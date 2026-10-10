/* ==========================================================================
   집감독 - Client Application Script (Master User Flow & Auth / Friend Hub)
   ========================================================================== */

let sseSource = null;
let currentGameState = null;
let crisisTimerInterval = null;
let crisisTimeLeft = 15;

let currentUserId = 1;
// 응원 구단은 서버 세션(DB) 값만 사용 (기본 구단 없음)
let selectedTeamCode = window.CURRENT_SESSION_TEAM || null;
let selectedTeamFull = window.CURRENT_SESSION_TEAM_FULL || null;
let userLoginProvider = 'General';
let userNickname = '김명장 감독';
let isIdentityVerified = false;

// KBO 10개 구단 메타데이터 매핑 및 도우미 함수
const teamLogos = {
    '삼성': '🦁', '한화': '🦅', 'KIA': '🐯', 'LG': '🧢', '두산': '🐻',
    '롯데': '⚓', 'SSG': '🚀', 'KT': '🧙', 'NC': '🦖', '키움': '🦸'
};
const teamFullMap = {
    '삼성': '삼성 라이온즈', '한화': '한화 이글스', 'KIA': 'KIA 타이거즈', 'LG': 'LG 트윈스',
    '두산': '두산 베어스', '롯데': '롯데 자이언츠', 'SSG': 'SSG 랜더스', 'KT': 'KT 위즈',
    'NC': 'NC 다이노스', '키움': '키움 히어로즈'
};
const teamColorMap = {
    '삼성': '#005CB9', '한화': '#FF6600', 'KIA': '#EA0029', 'LG': '#C30452', '두산': '#131230',
    '롯데': '#041E42', 'SSG': '#CE0E2D', 'KT': '#000000', 'NC': '#315288', '키움': '#570514'
};

function normalizeTeamShort(name) {
    if (!name) return null;
    const str = String(name).trim();
    for (const code of Object.keys(teamFullMap)) {
        if (str.includes(code)) return code;
    }
    return null;
}

function syncUserTeamUI(teamCode, teamFullName) {
    teamCode = normalizeTeamShort(teamCode || selectedTeamCode);
    if (!teamCode) return;
    selectedTeamCode = teamCode;
    selectedTeamFull = teamFullName || teamFullMap[teamCode];
    
    try {
        localStorage.setItem('antigravity_favorite_team', selectedTeamCode);
        localStorage.setItem('antigravity_favorite_team_full', selectedTeamFull);
    } catch(e) {}

    // 1. Welcome Card
    const sessTeamEl = document.getElementById('session-disp-team');
    if (sessTeamEl) sessTeamEl.innerText = selectedTeamFull;

    // 2. Profile Badge & Header
    const teamBadge = document.getElementById('lobby-login-type');
    if (teamBadge) teamBadge.innerText = `${selectedTeamCode} 팬클럽 감독`;

    const avatarEl = document.getElementById('lobby-user-avatar');
    if (avatarEl && teamLogos[selectedTeamCode]) avatarEl.innerText = teamLogos[selectedTeamCode];

    const headerBar = document.getElementById('lobby-header-bar');
    if (headerBar && teamColorMap[selectedTeamCode]) {
        headerBar.style.borderLeft = `5px solid ${teamColorMap[selectedTeamCode]}`;
    }

    // 3. Settings Modal
    const setAvatar = document.getElementById('settings-disp-avatar');
    if (setAvatar && teamLogos[selectedTeamCode]) setAvatar.innerText = teamLogos[selectedTeamCode];

    const setTeam = document.getElementById('settings-disp-team');
    if (setTeam) setTeam.innerText = `⚾ ${selectedTeamFull} 응원 구단`;
}

let matchCountdownInterval = null;
let matchCountdownTime = 15;
let liveClockInterval = null;

function getFormattedTodayStr() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

let currentSystemDate = getFormattedTodayStr();

function syncTodayTabLabel(dateStr) {
    const todayBtn = document.getElementById('btn-today-sched-tab');
    if (todayBtn && dateStr) {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const m = parseInt(parts[1], 10);
            const d = parseInt(parts[2], 10);
            todayBtn.innerText = `오늘 경기 (${m}/${d})`;
        }
    }
}

function saveGameStateToStorage(state) {
    if (!state) return;
    try {
        localStorage.setItem('zipgamdok_active_match', JSON.stringify({
            home_team: currentHomeTeam,
            away_team: currentAwayTeam,
            home_pitcher: currentHomePitcher,
            away_pitcher: currentAwayPitcher,
            state: state,
            timestamp: Date.now()
        }));
    } catch(e) {
        console.warn("localStorage save error:", e);
    }
}

function restoreGameStateFromStorage() {
    try {
        const saved = localStorage.getItem('zipgamdok_active_match');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && parsed.state) {
                if (parsed.home_team) currentHomeTeam = parsed.home_team;
                if (parsed.away_team) currentAwayTeam = parsed.away_team;
                if (parsed.home_pitcher) currentHomePitcher = parsed.home_pitcher;
                if (parsed.away_pitcher) currentAwayPitcher = parsed.away_pitcher;
                currentGameState = parsed.state;
                return true;
            }
        }
    } catch(e) {
        console.warn("localStorage restore error:", e);
    }
    return false;
}

document.addEventListener('DOMContentLoaded', () => {
    try { restoreGameStateFromStorage(); } catch(e) {}
    try { loadUserState(); } catch(e) { console.warn('loadUserState error:', e); }
    try { initCanvas(); } catch(e) { console.warn('initCanvas error:', e); }
    try { switchView('pregame-view'); } catch(e) { console.warn('switchView error:', e); }
    try { updateBottomNavVisibility(); } catch(e) {}
    try { runSplashScreen(); } catch(e) { dismissSplash(); }
    try { startLiveClock(); } catch(e) {}
    try { setupSmartAutoScroll(); } catch(e) {}
    try { syncTodayTabLabel(currentSystemDate); } catch(e) {}
});

// ==========================================================================
// Web Audio API Sound Alert System (Fires Audio BEFORE Click, When Submit Button Appears)
// ==========================================================================
function unlockGlobalAudio() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            if (!window._appAudioCtx) {
                window._appAudioCtx = new AudioContext();
            }
            if (window._appAudioCtx.state === 'suspended') {
                window._appAudioCtx.resume();
            }
        }
    } catch(e) {}
}

['click', 'touchstart', 'pointerdown', 'keydown'].forEach(evtType => {
    window.addEventListener(evtType, unlockGlobalAudio, { once: false });
});

function playWebAudioAlert(soundType = 'submit_ready') {
    try {
        unlockGlobalAudio();
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        
        if (!window._appAudioCtx) {
            window._appAudioCtx = new AudioContext();
        }
        const ctx = window._appAudioCtx;
        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        const now = ctx.currentTime;

        if (soundType === 'tactic_modal' || soundType === 'submit_ready') {
            // Loud high-pitch dual chime (A5: 880Hz -> E6: 1318.5Hz) the instant submit button pops up
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(880, now);
            osc1.frequency.exponentialRampToValueAtTime(1318.51, now + 0.15);
            gain1.gain.setValueAtTime(0.4, now);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.45);

            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(1760, now + 0.15);
            gain2.gain.setValueAtTime(0.25, now + 0.15);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now + 0.15);
            osc2.stop(now + 0.5);
        } else if (soundType === 'tactic_result' || soundType === 'completed') {
            // Major Triad Chime (C5 -> E5 -> G5) on action completion
            [523.25, 659.25, 783.99].forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                const startTime = now + (idx * 0.08);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, startTime);
                gain.gain.setValueAtTime(0.3, startTime);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(startTime);
                osc.stop(startTime + 0.5);
            });
        }
    } catch (e) {
        console.warn('WebAudio play error:', e);
    }
}

function saveUserState() {
    try {
        localStorage.setItem('antigravity_user_id', currentUserId);
        localStorage.setItem('antigravity_user_nickname', userNickname);
        localStorage.setItem('antigravity_favorite_team', selectedTeamCode);
        localStorage.setItem('antigravity_favorite_team_full', selectedTeamFull);
    } catch(e) {}
}

function loadUserState() {
    try {
        if (window.CURRENT_SESSION_USER_ID) {
            currentUserId = window.CURRENT_SESSION_USER_ID;
        } else {
            const savedId = localStorage.getItem('antigravity_user_id');
            if (savedId) currentUserId = parseInt(savedId);
        }

        if (window.CURRENT_SESSION_NICKNAME) {
            userNickname = window.CURRENT_SESSION_NICKNAME;
        } else {
            const savedNick = localStorage.getItem('antigravity_user_nickname');
            if (savedNick) userNickname = savedNick;
        }

        if (window.CURRENT_SESSION_TEAM) {
            selectedTeamCode = normalizeTeamShort(window.CURRENT_SESSION_TEAM);
        } else {
            const savedTeam = localStorage.getItem('antigravity_favorite_team');
            if (savedTeam) selectedTeamCode = normalizeTeamShort(savedTeam);
        }

        if (window.CURRENT_SESSION_TEAM_FULL) {
            selectedTeamFull = window.CURRENT_SESSION_TEAM_FULL;
        } else {
            const savedTeamFull = localStorage.getItem('antigravity_favorite_team_full');
            if (savedTeamFull) selectedTeamFull = savedTeamFull;
        }

        const nameEl = document.getElementById('lobby-user-name');
        if (nameEl && userNickname) nameEl.innerText = userNickname;

        syncUserTeamUI(selectedTeamCode, selectedTeamFull);
    } catch(e) {}
}

// 실시간 시계 & 날짜 컴포넌트 스크립트
function startLiveClock() {
    clearInterval(liveClockInterval);
    
    function updateClock() {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');

        const dateEl = document.getElementById('lobby-date-text');
        const timeEl = document.getElementById('lobby-time-text');

        const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
        if (dateEl) dateEl.innerText = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 (${weekdays[now.getDay()]})`;
        if (timeEl) timeEl.innerText = `${hours}:${minutes}:${seconds}`;
    }

    updateClock();
    liveClockInterval = setInterval(updateClock, 1000);
}

function showInitialLandingScreen() {
    try {
        const splash = document.getElementById('splash-screen');
        if (splash) {
            splash.classList.add('fade-out');
            splash.style.opacity = '0';
            splash.style.pointerEvents = 'none';
            setTimeout(() => {
                try {
                    splash.style.display = 'none';
                    if (splash.parentNode) splash.parentNode.removeChild(splash);
                } catch(e) {}
            }, 250);
        }
    } catch(e) {}

    if (window.CURRENT_SESSION_USER) {
        if (window.CURRENT_SESSION_USER_ID) {
            currentUserId = window.CURRENT_SESSION_USER_ID;
            localStorage.setItem('antigravity_user_id', currentUserId);
        }
        let nick = window.CURRENT_SESSION_NICKNAME || window.CURRENT_SESSION_USER;
        if (nick && !nick.endsWith('감독')) {
            nick = nick + ' 감독';
        }
        userNickname = nick || '김명장 감독';
        localStorage.setItem('antigravity_user_nickname', userNickname);
        const nameEl = document.getElementById('lobby-user-name');
        if (nameEl) nameEl.innerText = userNickname;

        if (window.CURRENT_SESSION_TEAM) {
            selectedTeamCode = normalizeTeamShort(window.CURRENT_SESSION_TEAM);
            selectedTeamFull = window.CURRENT_SESSION_TEAM_FULL || teamFullMap[selectedTeamCode];
            syncUserTeamUI(selectedTeamCode, selectedTeamFull);
        }
        try {
            hideOverlay('login-screen');
            switchView('pregame-view');
            loadLobbyData();
        } catch(e) {}
    } else {
        window.location.href = '/login';
        return;
    }
    try { updateBottomNavVisibility(); } catch(e) {}
}

function dismissSplash() {
    if (window._splashDismissed) return;
    window._splashDismissed = true;
    if (window._splashTimer) clearInterval(window._splashTimer);
    if (window._splashSafetyTimer) clearTimeout(window._splashSafetyTimer);
    
    const fill = document.getElementById('splash-progress-fill');
    if (fill) fill.style.width = '100%';
    
    showInitialLandingScreen();
}

// Phase 1-1: Splash Loader & Initial Landing/Login Screen Entry (Max 1.2s Timeout / Skip on Click)
function runSplashScreen() {
    window._splashDismissed = false;
    const splash = document.getElementById('splash-screen');
    const fill = document.getElementById('splash-progress-fill');
    const statusText = document.getElementById('loader-status-text');

    if (splash) {
        splash.style.cursor = 'pointer';
        splash.onclick = (e) => { try { e.stopPropagation(); } catch(err) {} dismissSplash(); };
        splash.ontouchstart = (e) => { try { e.stopPropagation(); } catch(err) {} dismissSplash(); };
        splash.onpointerdown = (e) => { try { e.stopPropagation(); } catch(err) {} dismissSplash(); };
    }

    const statusMsgs = [
        "로비 입장 준비 중...",
        "응원 구단 경기 정보 불러오는 중...",
        "입장 완료!"
    ];

    let progress = 0;
    let msgIdx = 0;

    // 30ms마다 1%씩 → 약 3초 동안 진행
    window._splashTimer = setInterval(() => {
        progress += 1;
        if (fill) fill.style.width = `${Math.min(100, progress)}%`;

        if (progress > 35 && msgIdx === 0) {
            msgIdx = 1;
            if (statusText) statusText.innerText = statusMsgs[1];
        } else if (progress > 75 && msgIdx === 1) {
            msgIdx = 2;
            if (statusText) statusText.innerText = statusMsgs[2];
        }

        if (progress >= 100) {
            dismissSplash();
        }
    }, 30);

    // Safety Timeout: 환영 화면은 최대 3.5초 (멈추지 않도록 보장)
    window._splashSafetyTimer = setTimeout(() => {
        dismissSplash();
    }, 3500);
}

// Modal Handlers for Auth
function openLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) modal.classList.add('active');
}

function closeLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) modal.classList.remove('active');
}

function openRegisterModal() {
    const modal = document.getElementById('register-modal');
    if (modal) modal.classList.add('active');
}

function closeRegisterModal() {
    const modal = document.getElementById('register-modal');
    if (modal) modal.classList.remove('active');
}

// Settings Modal Handlers (환경설정 및 로그아웃)
function openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;

    // 현재 사용자 및 구단 정보 동기화
    const nick = window.CURRENT_SESSION_NICKNAME || window.CURRENT_SESSION_USER || userNickname || localStorage.getItem('antigravity_user_nickname') || '김명장 감독';
    const teamCode = normalizeTeamShort(selectedTeamCode || window.CURRENT_SESSION_TEAM);
    const teamFull = teamFullMap[teamCode] || '응원 구단 미설정';
    const user = window.CURRENT_SESSION_ACCOUNT || window.CURRENT_SESSION_USER || '';

    const nickEl = document.getElementById('settings-disp-nickname');
    const teamEl = document.getElementById('settings-disp-team');
    const avatarEl = document.getElementById('settings-disp-avatar');
    const idEl = document.getElementById('settings-disp-id');

    if (nickEl) nickEl.innerText = nick.endsWith('감독') ? nick : `${nick} 감독`;
    if (teamEl) teamEl.innerText = `⚾ ${teamFull} 응원 구단`;
    if (avatarEl && teamLogos[teamCode]) avatarEl.innerText = teamLogos[teamCode];
    if (idEl) {
        if (user) {
            idEl.innerText = `계정: ${user}`;
            idEl.style.display = 'block';
        } else {
            idEl.style.display = 'none';
        }
    }

    modal.classList.add('active');
}

function closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.classList.remove('active');
}

function toggleSoundSetting(checkbox) {
    if (checkbox.checked) {
        try { showToast("🔊 실시간 효과음 및 알림이 켜졌습니다."); } catch(e) {}
    } else {
        try { showToast("🔇 실시간 효과음 및 알림이 꺼졌습니다."); } catch(e) {}
    }
}

window.addEventListener('click', (event) => {
    const loginModal = document.getElementById('login-modal');
    const regModal = document.getElementById('register-modal');
    const settingsModal = document.getElementById('settings-modal');
    if (event.target === loginModal) {
        closeLoginModal();
    }
    if (event.target === regModal) {
        closeRegisterModal();
    }
    if (event.target === settingsModal) {
        closeSettingsModal();
    }
});

// 본인인증 가상 UI 액션
function triggerIdentityVerify() {
    const btn = document.getElementById('btn-do-verify');
    const badge = document.getElementById('verify-badge');

    btn.innerText = "⏳ 통신사 인증 진행 중...";
    btn.disabled = true;

    setTimeout(() => {
        isIdentityVerified = true;
        btn.style.display = 'none';
        badge.classList.remove('hidden');
        showToast("🪪 PASS 간편 본인인증이 성공적으로 완료되었습니다!");
    }, 1200);
}

// 회원가입 제출
function submitRegister() {
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const marketingAgreed = document.getElementById('reg-marketing').checked;

    if (!isIdentityVerified) {
        showToast("⚠️ 본인인증(PASS 간편인증)을 먼저 진행해주세요!");
        return;
    }

    fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: username,
            password: password,
            email: email,
            marketing_agreed: marketingAgreed,
            nickname: username + " 감독",
            team: selectedTeamCode
        })
    })
    .then(r => r.json())
    .then(data => {
        if (data.status === 'success') {
            currentUserId = data.user.id;
            userNickname = data.user.nickname;
            showToast(`🎉 회원가입 성공! 닉네임과 응원 구단을 설정하세요.`);
            closeRegisterModal();
            hideOverlay('login-screen');
            showOverlay('team-select-screen');
        } else {
            showToast(`❌ ${data.message}`);
        }
    })
    .catch(err => {
        showToast("❌ 서버와 통신 중 오류가 발생했습니다.");
    });
}

// 로그인 제출 및 메인 로비 직행 라우팅
function submitLogin() {
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    const username = usernameInput ? usernameInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value.trim() : '';

    function proceedToLobby(user) {
        currentUserId = user ? user.id : 1;
        let nick = user ? (user.nickname || user.username) : (username || "김명장");
        if (nick && !nick.endsWith('감독')) {
            nick = nick + ' 감독';
        }
        userNickname = nick;
        window.CURRENT_SESSION_USER = username || userNickname;
        window.CURRENT_SESSION_NICKNAME = nick;
        localStorage.setItem('antigravity_user_nickname', userNickname);
        if (user) selectedTeamCode = normalizeTeamShort(user.favorite_team || user.team) || selectedTeamCode;
        selectedTeamFull = teamFullMap[selectedTeamCode] || selectedTeamFull;
        syncUserTeamUI(selectedTeamCode, selectedTeamFull);

        showToast(`🔑 환영합니다, ${userNickname}님!`);
        closeLoginModal();
        hideOverlay('login-screen');
        switchView('pregame-view');
        try { updateBottomNavVisibility(); } catch(e) {}
    }

    if (!username || !password) {
        proceedToLobby(null);
        return;
    }

    fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password })
    })
    .then(r => r.json())
    .then(data => {
        if (data.status === 'success') {
            proceedToLobby(data.user);
        } else {
            proceedToLobby(null);
        }
    })
    .catch(() => {
        proceedToLobby(null);
    });
}

// Direct Screen Routing & Seamless Entrance Handlers (Ensures 2000pt & Main Screen Routing)
function enterMainLobbyDirect(loginType = 'Existing', customNick = '김명장 감독') {
    userNickname = customNick || '김명장 감독';
    window.CURRENT_SESSION_USER = userNickname;
    currentUserId = 1;

    // 1. Immediately dismiss all blocking overlays and modals
    hideOverlay('login-screen');
    hideOverlay('team-select-screen');
    closeLoginModal();
    closeRegisterModal();
    try { updateBottomNavVisibility(); } catch(e) {}

    // 2. Set score UI elements to 2,000 pts
    const scoreEl = document.getElementById('lobby-my-score');
    if (scoreEl) scoreEl.innerText = '2,000 pts';
    
    const gradeBadge = document.getElementById('lobby-my-grade');
    if (gradeBadge) {
        gradeBadge.innerText = 'B급 명장';
        gradeBadge.className = 'grade-badge grade-b';
    }

    const nameEl = document.getElementById('lobby-user-name');
    if (nameEl) nameEl.innerText = userNickname;

    const tag = document.getElementById('lobby-login-type');
    if (tag) {
        tag.innerText = loginType === 'Guest' ? '게스트 감독' : '회원 계정 인증됨';
        tag.className = 'login-tag kakao';
    }

    saveUserState();

    // 3. Immediately transition to main pregame view & load lobby data
    switchView('pregame-view');
    loadLobbyData();

    // 4. Trigger Toast Notification
    if (loginType === 'Existing') {
        showToast(`🔑 로그인 성공! ${userNickname} 감독님, 메인 화면(2,000pt)으로 진입합니다.`);
    } else if (loginType === 'Register') {
        showToast(`🎉 회원가입 완료! 2,000pt가 부여되어 메인 화면으로 진입합니다.`);
    } else {
        showToast(`⚡ 게스트 감독 입장! 2,000pt와 메인 일정 캘린더를 확인하세요.`);
    }
}

function handleExistingLoginDirect() {
    enterMainLobbyDirect('Existing', userNickname || '김명장 감독');
}

function handleRegisterDirect() {
    enterMainLobbyDirect('Register', '신규 명장 감독');
}

function handleGuestLoginDirect() {
    enterMainLobbyDirect('Guest', '게스트 감독');
}

// 게스트 로그인
function handleGuestLogin() {
    handleGuestLoginDirect();
}

// Phase 1-3: 응원 구단 그리드 선택
function selectTeamGrid(code, fullName) {
    selectedTeamCode = code;
    selectedTeamFull = fullName;

    document.querySelectorAll('.team-grid-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.currentTarget.classList.add('active');
}

function confirmTeamSelection() {
    const nicknameInput = document.getElementById('user-nickname-input');
    if (nicknameInput && nicknameInput.value.trim() !== '') {
        userNickname = nicknameInput.value.trim();
    }

    saveUserState();

    const nameEl = document.getElementById('lobby-user-name');
    if (nameEl) nameEl.innerText = userNickname;
    hideOverlay('team-select-screen');

    showToast(`🎁 2,000pt 지급 완료! ${userNickname}님, ${selectedTeamFull}로 감독 매니지먼트를 시작합니다.`);
    switchView('pregame-view');
}

// 로비 KBO 스케줄(18:30 & 월요일 휴식일) 및 카운트다운 타이머
let currentScheduleFilter = 'today';
let cachedSchedules = [];
let currentHomeTeam = '한화';
let currentAwayTeam = '롯데';
let currentHomePitcher = '화이트';
let currentAwayPitcher = '반즈';
let currentStadium = '대전';
let currentStartTimeStr = '18:30';
let currentMatchIsLive = true;

function getStartTimeByDayOfWeek(dayOfWeek) {
    if (dayOfWeek === 1) return { timeStr: "휴식일", isRest: true };
    if (dayOfWeek === 6) return { timeStr: "17:00", isRest: false };
    if (dayOfWeek === 0) return { timeStr: "14:00", isRest: false };
    return { timeStr: "18:30", isRest: false };
}

function formatMatchDateLabel(dateStr) {
    const parts = (dateStr || '').split('-');
    return parts.length === 3 ? `${parseInt(parts[1], 10)}/${parseInt(parts[2], 10)}` : '';
}

function updateLobbyBannerForUserTeam(allMatches, scheduleInfo = {}) {
    const tagEl = document.getElementById('banner-live-tag');
    const titleEl = document.getElementById('match-title');
    const countdownEl = document.getElementById('match-countdown');
    const btn = document.getElementById('btn-enter-ingame');

    const teamCode = normalizeTeamShort(selectedTeamCode);
    const teamFull = teamFullMap[teamCode] || '응원 구단 미설정';

    // 동일 구단 매칭 원천 차단 필터
    allMatches = (allMatches || []).filter(m => m.is_rest_day === 1 || m.home_team !== m.away_team);

    // 응원 구단 경기가 DB에 없음 (휴식일 아님)
    if (allMatches.length === 0 && !scheduleInfo.is_rest_day) {
        currentMatchIsLive = false;
        if (tagEl) tagEl.innerText = `🔥 [MY TEAM] ${teamFull} 경기`;
        if (titleEl) titleEl.innerText = `⚾ ${teamFull} 경기 일정 준비 중`;
        if (countdownEl) countdownEl.innerText = `등록된 ${teamFull} 경기 일정이 없습니다.`;
        if (btn) {
            btn.disabled = true;
            btn.className = 'btn-primary-glow btn-locked';
            btn.innerText = `🔒 ${teamFull} 경기 일정 준비 중`;
        }
        return;
    }

    if (!allMatches || allMatches.length === 0) {
        currentMatchIsLive = false;
        if (tagEl) tagEl.innerText = "MONDAY REST DAY";
        if (titleEl) titleEl.innerText = `⚾ 오늘은 ${teamFull} 경기가 없는 KBO 정기 휴식일입니다`;
        if (countdownEl) countdownEl.innerText = `오늘은 응원 구단의 경기가 없는 휴식일입니다. 아래 소셜 랭킹 리더보드를 확인하세요!`;
        if (btn) {
            btn.disabled = true;
            btn.className = 'btn-primary-glow btn-locked';
            btn.innerText = `🔒 💤 오늘은 ${teamFull} 정기 휴식일입니다 (경기 없음)`;
        }
        return;
    }

    // 오늘 일정 중 유저의 응원 구단(selectedTeamCode)이 포함된 경기 탐색
    let userMatch = allMatches.find(m => 
        (normalizeTeamShort(m.home_team) === teamCode || normalizeTeamShort(m.away_team) === teamCode) && 
        m.is_rest_day === 0
    );

    if (!userMatch) {
        currentMatchIsLive = false;
        if (tagEl) tagEl.innerText = "REST DAY";
        if (titleEl) titleEl.innerText = `⚾ 오늘은 [${teamFull}] 경기가 없는 KBO 휴식일입니다`;
        if (countdownEl) countdownEl.innerText = `오늘은 응원 구단(${teamFull})의 경기가 없는 휴식일입니다. 아래 소셜 랭킹에서 다른 경기 일정을 확인하세요!`;
        if (btn) {
            btn.disabled = true;
            btn.className = 'btn-primary-glow btn-locked';
            btn.innerText = `🔒 💤 오늘은 ${teamFull} 경기가 없는 휴식일입니다`;
        }
        return;
    }

    // 유저 구단 경기 발견
    currentMatchIsLive = true;
    currentHomeTeam = userMatch.home_team;
    currentAwayTeam = userMatch.away_team;
    currentHomePitcher = userMatch.home_pitcher || teamPitcherMap[userMatch.home_team] || '페덱';
    currentAwayPitcher = userMatch.away_pitcher || teamPitcherMap[userMatch.away_team] || '박준영';
    currentStadium = userMatch.stadium;
    currentStartTimeStr = userMatch.start_time;

    if (currentHomeTeam === currentAwayTeam) {
        currentAwayTeam = (currentHomeTeam === '삼성') ? '한화' : '삼성';
    }

    const isHome = (normalizeTeamShort(userMatch.home_team) === teamCode);
    const homeAwayTag = isHome ? `🔥 [MY TEAM] ${teamFull} 홈 경기` : `✈️ [MY TEAM] ${teamFull} 원정 경기`;
    const awayFull = teamFullMap[normalizeTeamShort(userMatch.away_team)] || userMatch.away_team;
    const homeFull = teamFullMap[normalizeTeamShort(userMatch.home_team)] || userMatch.home_team;

    // 오늘 경기가 아니라 가장 가까운 날짜의 경기라면 날짜를 함께 표시
    const dateLabel = scheduleInfo.is_today === false ? `[${formatMatchDateLabel(userMatch.game_date)}] ` : '';

    if (tagEl) tagEl.innerText = homeAwayTag;
    if (titleEl) titleEl.innerHTML = `⚾ ${dateLabel}${getTeamLogoHtml(userMatch.away_team)} ${awayFull} vs ${getTeamLogoHtml(userMatch.home_team)} ${homeFull} [${userMatch.stadium}]`;
    if (countdownEl) countdownEl.innerText = `KBO ${userMatch.start_time} 라이브 경기 개시 대기 중 (${matchCountdownTime}초... 수동 클릭으로 언제든 입장 가능)`;
    
    if (btn) {
        btn.disabled = false;
        btn.className = 'btn-live-entry-glow';
        btn.innerText = `🚨 [${teamFull} 경기 입장] 실시간 세컨드 스크린 직행하기`;
    }
}

// 로비 KBO 스케줄 카운트다운 타이머
function startLobbyCountdown() {
    clearInterval(matchCountdownInterval);
    matchCountdownTime = 15;

    const now = new Date();
    const dayOfWeek = now.getDay();
    const timeRule = getStartTimeByDayOfWeek(dayOfWeek);

    if (timeRule.isRest || !currentMatchIsLive) {
        return;
    }

    const countdownEl = document.getElementById('match-countdown');

    matchCountdownInterval = setInterval(() => {
        matchCountdownTime--;
        if (matchCountdownTime > 0) {
            if (countdownEl) countdownEl.innerText = `KBO ${currentStartTimeStr} 라이브 경기 개시 대기 중 (${matchCountdownTime}초... 수동 클릭으로 입장)`;
        } else {
            clearInterval(matchCountdownInterval);
            triggerLiveMatchReady();
        }
    }, 1000);
}

// 15초 경과 후 수동 입장 안내
function triggerLiveMatchReady() {
    if (!currentMatchIsLive) return;
    isMatchLive = true;
    const btn = document.getElementById('btn-enter-ingame');
    const countdownEl = document.getElementById('match-countdown');
    const tagEl = document.getElementById('banner-live-tag');
    const teamCode = normalizeTeamShort(selectedTeamCode);
    const teamFull = teamFullMap[teamCode] || '응원 구단 미설정';

    if (btn) {
        btn.disabled = false;
        btn.className = 'btn-live-entry-glow';
        btn.innerText = `🚨 [${teamFull} 경기 입장] 실시간 세컨드 스크린 직행하기`;
    }
    if (countdownEl) countdownEl.innerText = `🚨 KBO ${currentStartTimeStr} 라이브 경기 준비 완료! [입장하기] 버튼을 누르면 경기로 이동합니다.`;
    if (tagEl) tagEl.innerText = "🔴 LIVE BROADCASTING";

    showToast(`🚨 [${currentHomeTeam} vs ${currentAwayTeam}] 라이브 경기가 준비되었습니다. 입장 버튼을 눌러 직행하세요!`);
}

function tryEnterIngame() {
    forceLiveMatchStart();
}

function forceLiveMatchStart() {
    clearInterval(matchCountdownInterval);
    isMatchLive = true;

    fetch('/api/state')
        .then(r => r.json())
        .then(serverState => {
            const isOngoing = serverState &&
                (serverState.home_team === currentHomeTeam && serverState.away_team === currentAwayTeam) &&
                !serverState.game_over &&
                ((serverState.totalPitcherCount && serverState.totalPitcherCount > 0) || serverState.inning > 1 || serverState.score_home > 0 || serverState.score_away > 0 || serverState.balls > 0 || serverState.strikes > 0);

            const teamCode = normalizeTeamShort(selectedTeamCode);
            const teamFull = teamFullMap[teamCode] || '응원 구단 미설정';

            if (isOngoing) {
                currentGameState = serverState;
                saveGameStateToStorage(serverState);
                showToast(`🚨 [${teamFull} 경기 직행] ${userNickname}님, 진행 중인 ${currentHomeTeam} vs ${currentAwayTeam} 경기 관전에 재입장합니다!`);
                switchView('ingame-view');
            } else {
                showToast(`🚨 [${teamFull} 경기 직행] ${userNickname}님, ${currentHomeTeam} vs ${currentAwayTeam} [${currentStadium}] 덕아웃 감독석으로 진입합니다!`);
                fetch('/api/reset', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        home_team: currentHomeTeam,
                        away_team: currentAwayTeam,
                        home_pitcher: currentHomePitcher,
                        away_pitcher: currentAwayPitcher
                    })
                })
                .then(r => r.json())
                .then(data => {
                    if (data && data.state) {
                        currentGameState = data.state;
                        saveGameStateToStorage(data.state);
                        updateScoreboardUI(data.state);
                        drawBaseballField(data.state);
                    }
                    const modal = document.getElementById('crisis-modal');
                    if (modal) modal.classList.remove('active');
                    switchView('ingame-view');
                })
                .catch(() => {
                    switchView('ingame-view');
                });
            }
        })
        .catch(() => switchView('ingame-view'));
}

// 하단 네비게이션 바 노출/숨김 제어 함수: 로그인 완료 후 메인 로비 화면이나 게임 화면 진입 시에만 노출
function updateBottomNavVisibility() {
    const bottomNav = document.getElementById('bottom-nav-bar');
    if (!bottomNav) return;

    const loginScreen = document.getElementById('login-screen');
    const isLoginActive = loginScreen && 
        loginScreen.classList.contains('active') && 
        loginScreen.style.display !== 'none';
        
    const teamSelectScreen = document.getElementById('team-select-screen');
    const isTeamSelectActive = teamSelectScreen && 
        teamSelectScreen.classList.contains('active') &&
        teamSelectScreen.style.display !== 'none';

    // 로그인 여부 확인: 서버가 제공한 세션 사용자 변수 존재 여부로 엄격히 판정
    const isLoggedIn = Boolean(window.CURRENT_SESSION_USER);

    if (isLoggedIn && !isLoginActive && !isTeamSelectActive) {
        bottomNav.style.setProperty('display', 'flex', 'important');
        bottomNav.classList.remove('hidden');
        bottomNav.classList.add('visible');
    } else {
        bottomNav.style.setProperty('display', 'none', 'important');
        bottomNav.classList.remove('visible');
        bottomNav.classList.add('hidden');
    }
}

function showOverlay(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.add('active');
        el.style.display = 'flex';
    }
    try { updateBottomNavVisibility(); } catch(e) {}
}

function hideOverlay(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.remove('active');
        el.style.display = 'none';
    }
    try { updateBottomNavVisibility(); } catch(e) {}
}

function switchView(viewId) {
    document.querySelectorAll('.view-screen').forEach(screen => {
        screen.classList.remove('active');
    });
    const target = document.getElementById(viewId);
    if (target) {
        target.classList.add('active');
    }

    if (viewId === 'ingame-view') {
        fetch('/api/state')
            .then(r => r.json())
            .then(state => {
                currentGameState = state;
                saveGameStateToStorage(state);
                updateScoreboardUI(state);
                drawBaseballField(state);
                renderNaverSportsLiveFeed(state);
                if (state.crisis_active && state.current_crisis) {
                    openCrisisModal(state.current_crisis);
                }
            })
            .catch(() => {
                if (currentGameState) {
                    updateScoreboardUI(currentGameState);
                    drawBaseballField(currentGameState);
                    renderNaverSportsLiveFeed(currentGameState);
                    if (currentGameState.crisis_active && currentGameState.current_crisis) {
                        openCrisisModal(currentGameState.current_crisis);
                    }
                }
            });
        try { updateBottomNavVisibility(); } catch(e) {}
        startSSEStream();
        if (!autoPitchInterval) {
            startAutoPitchTimer();
        }
    } else if (viewId === 'pregame-view') {
        try { updateBottomNavVisibility(); } catch(e) {}
        stopSSEStream();
        // Maintain simulation timer running in background!
        if (!autoPitchInterval) {
            startAutoPitchTimer();
        }
        loadLobbyData();
        startLobbyCountdown();
        switchLobbyTab('home');
    } else {
        try { updateBottomNavVisibility(); } catch(e) {}
    }
}

function switchLobbyTab(tabName, btnEl) {
    const pregame = document.getElementById('pregame-view');
    if (pregame && !pregame.classList.contains('active')) {
        switchView('pregame-view');
    }

    document.querySelectorAll('.lobby-tab-pane').forEach(pane => {
        pane.classList.remove('active');
    });

    const targetPane = document.getElementById(`pane-${tabName}`);
    if (targetPane) {
        targetPane.classList.add('active');
    }

    document.querySelectorAll('.bottom-nav-item').forEach(btn => {
        btn.classList.remove('active');
    });

    if (btnEl && btnEl.classList.contains('bottom-nav-item')) {
        btnEl.classList.add('active');
    } else {
        const defaultBtn = document.querySelector(`.bottom-nav-item[onclick*="'${tabName}'"]`);
        if (defaultBtn) defaultBtn.classList.add('active');
    }

    // Sync sub-nav-item buttons in top menu bar
    document.querySelectorAll('.sub-nav-item').forEach(subBtn => {
        subBtn.classList.remove('active');
        const onclickAttr = subBtn.getAttribute('onclick') || '';
        if ((tabName === 'schedule' && (onclickAttr.includes('schedule') || subBtn.innerText.includes('일정'))) ||
            (tabName === 'records' && (onclickAttr.includes('records') || subBtn.innerText.includes('순위/기록')))) {
            subBtn.classList.add('active');
        }
    });

    if (tabName === 'schedule') {
        loadScheduleTable(currentScheduleFilter || 'today');
    } else if (tabName === 'records') {
        renderKboStandingsTable();
    } else if (tabName === 'my_records') {
        renderMyRecordsPane();
    }

    try { updateBottomNavVisibility(); } catch(e) {}
}

const kboTeamStandingsData = [
    { rank: 1, team: 'KT', winRate: '0.637', gb: '0.0', games: 140, wins: 86, losses: 49, draws: 5, streak: '6승', avg: '0.283', era: '4.20', recent: ['승','승','승','무','승'], next: '키움', psType: 'ks' },
    { rank: 2, team: '삼성', winRate: '0.603', gb: '4.5', games: 139, wins: 82, losses: 54, draws: 3, streak: '2패', avg: '0.276', era: '4.25', recent: ['승','승','승','패','패'], next: 'KIA', psType: 'po' },
    { rank: 3, team: 'KIA', winRate: '0.551', gb: '11.5', games: 138, wins: 75, losses: 61, draws: 2, streak: '3승', avg: '0.271', era: '4.30', recent: ['패','패','승','승','승'], next: '삼성', psType: 'jpo' },
    { rank: 4, team: 'LG', winRate: '0.543', gb: '12.5', games: 139, wins: 75, losses: 63, draws: 1, streak: '8패', avg: '0.265', era: '4.85', recent: ['패','패','패','패','패'], next: 'NC', psType: 'wc' },
    { rank: 5, team: '두산', winRate: '0.529', gb: '14.5', games: 141, wins: 72, losses: 64, draws: 5, streak: '2승', avg: '0.268', era: '3.84', recent: ['승','승','패','승','승'], next: '롯데', psType: 'wc' },
    { rank: 6, team: 'SSG', winRate: '0.467', gb: '23.0', games: 140, wins: 63, losses: 72, draws: 5, streak: '2승', avg: '0.259', era: '5.15', recent: ['승','승','패','승','승'], next: '한화', psType: '' },
    { rank: 7, team: 'NC', winRate: '0.457', gb: '24.5', games: 140, wins: 63, losses: 75, draws: 2, streak: '2패', avg: '0.271', era: '4.73', recent: ['패','패','승','패','패'], next: 'LG', psType: '' },
    { rank: 8, team: '롯데', winRate: '0.452', gb: '25.0', games: 138, wins: 61, losses: 74, draws: 3, streak: '2패', avg: '0.272', era: '4.77', recent: ['승','승','패','무','패'], next: '두산', psType: '' },
    { rank: 9, team: '한화', winRate: '0.409', gb: '31.0', games: 141, wins: 56, losses: 81, draws: 4, streak: '1승', avg: '0.273', era: '5.29', recent: ['패','패','패','패','승'], next: 'SSG', psType: '' },
    { rank: 10, team: '키움', winRate: '0.355', gb: '38.5', games: 142, wins: 49, losses: 89, draws: 4, streak: '1패', avg: '0.244', era: '5.28', recent: ['패','패','승','승','패'], next: 'KT', psType: '' }
];

let standingsYear = 2026;

function shiftStandingsYear(delta) {
    standingsYear += delta;
    const titleEl = document.getElementById('standings-year-title');
    if (titleEl) titleEl.innerText = standingsYear;
}

function switchStandingsSubTab(subTabKey, btnEl) {
    document.querySelectorAll('.standings-tab-btn').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    if (subTabKey === 'team_rank') {
        renderKboStandingsTable();
    } else {
        showToast('ℹ️ 해당 카테고리 세부 데이터 준비 중입니다.');
    }
}

function renderKboStandingsTable() {
    const tbody = document.getElementById('kbo-standings-tbody');
    if (!tbody) return;

    tbody.innerHTML = kboTeamStandingsData.map(row => {
        const psClass = row.psType ? `ps-${row.psType}` : '';
        const logoHtml = getTeamLogoHtml(row.team, 'standings-team-logo');
        const nextLogoHtml = getTeamLogoHtml(row.next, 'standings-next-team-logo');

        const recentBadgesHtml = row.recent.map((res, idx) => {
            const badgeClass = res === '승' ? 'badge-w' : (res === '패' ? 'badge-l' : 'badge-d');
            if (idx === row.recent.length - 1) {
                return `<span class="recent-last-item"><span class="badge-result ${badgeClass}">${res}</span><span class="arr">∨</span></span>`;
            }
            return `<span class="badge-result ${badgeClass}">${res}</span>`;
        }).join('');

        return `
            <tr class="${psClass}">
                <td class="col-rank">${row.rank}</td>
                <td style="text-align:left;">
                    <div class="col-team-wrap">
                        ${logoHtml}
                        <span>${row.team}</span>
                        <span class="chevron">›</span>
                    </div>
                </td>
                <td class="winrate-val">${row.winRate}</td>
                <td>${row.gb}</td>
                <td>${row.games}</td>
                <td>${row.wins}</td>
                <td>${row.losses}</td>
                <td>${row.draws}</td>
                <td>${row.streak}</td>
                <td>${row.avg}</td>
                <td>${row.era}</td>
                <td>
                    <div class="recent-badges-wrap">
                        ${recentBadgesHtml}
                    </div>
                </td>
                <td>${nextLogoHtml}</td>
            </tr>
        `;
    }).join('');
}

let cachedTacticsHistory = [];
let selectedMyRecordsFilter = 'all';

function renderMyRecordsPane(filterKey = 'all') {
    selectedMyRecordsFilter = filterKey;
    renderMyRecordsGamePills();
    filterAndRenderTacticsHistory(selectedMyRecordsFilter);
}

function renderMyRecordsGamePills() {
    const container = document.getElementById('my-records-game-pills');
    if (!container) return;

    const gameOptions = [
        { key: 'all', label: '⚾ 전체 경기 히스토리' },
        { key: '2026-10-06', label: '10/06 한화 vs 롯데' },
        { key: '2026-09-30', label: '09/30 삼성 vs 한화' },
        { key: '2026-09-29', label: '09/29 SSG vs LG' },
        { key: '2026-09-27', label: '09/27 KIA vs LG' }
    ];

    container.innerHTML = gameOptions.map(opt => {
        const activeClass = opt.key === selectedMyRecordsFilter ? 'active' : '';
        return `<button class="game-pill-btn ${activeClass}" onclick="renderMyRecordsPane('${opt.key}')">${opt.label}</button>`;
    }).join('');
}

function filterAndRenderTacticsHistory(filterKey) {
    const titleEl = document.getElementById('my-records-section-title');
    const tagEl = document.getElementById('my-records-count-tag');

    let list = cachedTacticsHistory || [];
    let filtered = list;
    if (filterKey !== 'all') {
        filtered = list.filter(h => {
            if (h.timestamp && h.timestamp.includes(filterKey)) return true;
            if (h.game_date && h.game_date.includes(filterKey)) return true;
            return false;
        });
        if (filtered.length === 0 && list.length > 0) {
            filtered = list.slice(0, 3);
        }
    }

    if (titleEl) {
        if (filterKey === 'all') {
            titleEl.innerText = '📜 전체 경기 승부처 작전 기록';
        } else {
            const labelMap = {
                '2026-10-06': '10/06 한화 vs 롯데 경기',
                '2026-09-30': '09/30 삼성 vs 한화 경기',
                '2026-09-29': '09/29 SSG vs LG 경기',
                '2026-09-27': '09/27 KIA vs LG 경기'
            };
            titleEl.innerText = `📜 ${labelMap[filterKey] || filterKey} 작전 기록`;
        }
    }

    if (tagEl) {
        tagEl.innerText = `총 ${filtered.length}건`;
    }

    renderTacticsHistory(filtered);
}

function renderTacticsHistory(historyList) {
    const container = document.getElementById('tactics-history-list');
    if (!container) return;

    if (!historyList || historyList.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:24px; color:#94a3b8; font-size:0.85rem;">선택하신 경기의 승부처 감독 판단 기록이 아직 없습니다.</div>';
        return;
    }

    container.innerHTML = historyList.map(h => {
        const gradeClass = `grade-${(h.result_grade || 'B').toLowerCase()}`;
        const scoreSign = h.score_change > 0 ? `+${h.score_change}` : `${h.score_change}`;
        return `
            <div class="history-item-card">
                <div class="history-item-left">
                    <span class="history-item-title">${h.situation || '승부처 작전'}</span>
                    <span class="history-item-sub">선택: [${h.tactic_chosen || '자율'}] | ${h.commentary || ''}</span>
                </div>
                <div class="history-item-grade ${gradeClass}">
                    ${h.result_grade || 'B'} (${scoreSign}pt)
                </div>
            </div>
        `;
    }).join('');
}

function selectTeam(home, away) {
    if (home === away) {
        away = (home === '롯데') ? '한화' : '롯데';
    }
    currentHomeTeam = home;
    currentAwayTeam = away;
    fetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ home_team: home, away_team: away })
    })
    .then(r => r.json())
    .then(data => {
        document.getElementById('match-title').innerText = `⚾ ${away} vs ${home}`;
    });
}

function loadLobbyData() {
    const uid = window.CURRENT_SESSION_USER_ID || currentUserId || 1;
    fetch(`/api/lobby?user_id=${uid}`)
        .then(res => res.json())
        .then(data => {
            const scoreEl = document.getElementById('lobby-my-score');
            if (scoreEl) scoreEl.innerText = `${data.user_score.toLocaleString()} pts`;
            
            const gradeBadge = document.getElementById('lobby-my-grade');
            if (gradeBadge) {
                gradeBadge.innerText = `${data.user_grade}급 명장`;
                gradeBadge.className = `grade-badge grade-${data.user_grade.toLowerCase()}`;
            }

            const nameEl = document.getElementById('lobby-user-name');
            if (nameEl && userNickname) nameEl.innerText = userNickname;

            // 응원 팀 정보 및 로고/컬러 동기화
            const serverTeam = data.favorite_team || (data.user_info && (data.user_info.favorite_team || data.user_info.team)) || window.CURRENT_SESSION_TEAM;
            if (serverTeam) {
                const teamCode = normalizeTeamShort(serverTeam);
                const teamFull = data.favorite_team_full || teamFullMap[teamCode];
                syncUserTeamUI(teamCode, teamFull);
            }

            // Stats grid in records pane
            const statScore = document.getElementById('stat-total-score');
            if (statScore) statScore.innerText = `${data.user_score.toLocaleString()} pt`;
            const statGrade = document.getElementById('stat-current-grade');
            if (statGrade) statGrade.innerText = `${data.user_grade}급`;

            if (data.today_schedule) {
                if (data.today_schedule.game_date) {
                    currentSystemDate = data.today_schedule.game_date;
                }
                updateLobbyBannerForUserTeam(data.today_schedule.all_matches || [], data.today_schedule);
                if (data.today_schedule.match) {
                    const match = data.today_schedule.match;
                    currentHomeTeam = match.home_team;
                    currentAwayTeam = match.away_team;
                    currentStadium = match.stadium;
                    if (currentHomeTeam === currentAwayTeam) {
                        currentAwayTeam = (currentHomeTeam === '롯데') ? '한화' : '롯데';
                    }
                }
            }

            syncTodayTabLabel(currentSystemDate);
            renderFriendRankings(data.rankings);
            renderTacticsHistory(data.history);
            loadScheduleTable('today');
        })
        .catch(err => console.error("Lobby error:", err));
}

// Schedule Tab Globals & Date Picker Logic
let selectedScheduleDate = getFormattedTodayStr();

const teamLogoImgMap = {
    "한화": "/logos/hanwha.png",
    "삼성": "/logos/samsung.png",
    "KIA": "/logos/kia.png",
    "KT": "/logos/kt.png",
    "LG": "/logos/lg.png",
    "SSG": "/logos/ssg.png",
    "키움": "/logos/kiwoom.png",
    "롯데": "/logos/lotte.png",
    "NC": "/logos/nc.png",
    "두산": "/logos/doosan.png"
};

const teamLogoMap = {
    "한화": "🦅", "롯데": "⚓", "KIA": "🐯", "삼성": "🦁",
    "SSG": "🐶", "두산": "🐻", "NC": "🦖", "KT": "🧙",
    "키움": "🦸", "LG": "🧢"
};

function getTeamLogoHtml(teamName, extraClass = '') {
    return '';
}

const teamPitcherMap = {
    "한화": "화이트", "삼성": "후라도", "KIA": "김태형", "KT": "대니엘",
    "LG": "박시원", "SSG": "김건우", "키움": "김성진", "롯데": "로드리게스",
    "NC": "라일리", "두산": "잭로그"
};

const teamBatterMap = {
    "한화": "황영묵", "삼성": "김지찬", "KIA": "박찬호", "LG": "홍창기",
    "SSG": "최지훈", "두산": "정수빈", "NC": "박민우", "KT": "멜 로하스",
    "키움": "이주형", "롯데": "황성빈"
};

function loadScheduleTable(filterDate = getFormattedTodayStr()) {
    if (!filterDate || filterDate === 'today') filterDate = getFormattedTodayStr();
    selectedScheduleDate = filterDate;
    fetch('/api/schedules')
        .then(res => res.json())
        .then(data => {
            cachedSchedules = data.schedules || [];
            renderHorizontalDatePicker();
            renderMatchupsForDate(selectedScheduleDate);
        })
        .catch(err => console.error("Error loading schedules:", err));
}

function renderHorizontalDatePicker() {
    const scrollContainer = document.getElementById('sched-date-scroll');
    if (!scrollContainer) return;

    let availableDates = [];
    const todayStr = getFormattedTodayStr();

    if (cachedSchedules && cachedSchedules.length > 0) {
        const set = new Set(cachedSchedules.map(s => s.game_date));
        set.add(todayStr);
        availableDates = Array.from(set).sort();
    } else {
        const today = new Date();
        for (let i = -7; i <= 7; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            availableDates.push(`${y}-${m}-${day}`);
        }
    }

    const dows = ['일', '월', '화', '수', '목', '금', '토'];

    const dates = availableDates.map(dateStr => {
        const [y, m, d] = dateStr.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        const dow = dows[dateObj.getDay()];
        const num = String(d);
        return { date: dateStr, dow, num };
    });

    const monthTitleEl = document.getElementById('sched-month-title');
    if (monthTitleEl && selectedScheduleDate) {
        const parts = selectedScheduleDate.split('-');
        if (parts.length >= 2) {
            monthTitleEl.innerText = `${parts[0]}.${parts[1]} ▾`;
        }
    }

    scrollContainer.innerHTML = dates.map(d => `
        <div class="date-pill-item ${d.date === selectedScheduleDate ? 'active' : ''}" onclick="selectScheduleDate('${d.date}')">
            <span class="dow">${d.dow}</span>
            <span class="day-num">${d.num}</span>
        </div>
    `).join('');

    setTimeout(() => {
        const activeEl = scrollContainer.querySelector('.date-pill-item.active');
        if (activeEl) {
            activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }, 50);
}

function selectScheduleDate(dateStr) {
    selectedScheduleDate = dateStr;
    renderHorizontalDatePicker();
    renderMatchupsForDate(dateStr);
}

function scrollDateBar(direction) {
    const container = document.getElementById('sched-date-scroll');
    if (container) {
        container.scrollBy({ left: direction * 150, behavior: 'smooth' });
    }
}

function shiftSchedMonth(delta) {
    showToast("🗓️ 2026년 9월 정규시즌 일정 캘린더입니다.");
}

function renderMatchupsForDate(dateStr) {
    const container = document.getElementById('sched-matchup-list');
    if (!container) return;

    let filtered = (cachedSchedules || []).filter(s => s.game_date === dateStr);

    if (filtered.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:30px; color:#94a3b8; font-weight:700;">
                📅 ${dateStr} 에는 예정된 KBO 경기가 없습니다. (KBO 정기 휴식일)
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(m => {
        if (m.is_rest_day === 1) {
            return `
                <div class="matchup-card" style="justify-content:center; text-align:center; padding:20px; color:#fca5a5;">
                    ⚾ KBO 정기 휴식일 (전 구단 휴식)
                </div>
            `;
        }

        const awayLogo = getTeamLogoHtml(m.away_team, 'matchup-team-logo-img');
        const homeLogo = getTeamLogoHtml(m.home_team, 'matchup-team-logo-img');
        const awayPitcher = m.away_pitcher ? m.away_pitcher : '';
        const homePitcher = m.home_pitcher ? m.home_pitcher : '';

        const awayPitcherHtml = awayPitcher ? `<span class="matchup-pitcher-name">${awayPitcher}</span>` : '';
        const homePitcherHtml = homePitcher ? `<span class="matchup-pitcher-name">${homePitcher}</span>` : '';
        const statusText = m.status_text || '경기전';
        const badgeClass = statusText === '경기중' ? 'status-badge-cyan' : 'status-badge-cyan';

        return `
            <div class="matchup-card">
                <div class="matchup-card-left">
                    <div class="matchup-meta-row">
                        <span class="${badgeClass}">${statusText}</span>
                        <span class="match-time-stadium">${m.start_time} <span class="match-stadium-name">${m.stadium}</span></span>
                    </div>
                    <div class="matchup-teams-block">
                        <div class="matchup-team-item">
                            <span class="matchup-team-logo">${awayLogo}</span>
                            <span class="matchup-team-name">${m.away_team}</span>
                            ${awayPitcherHtml}
                        </div>
                        <div class="matchup-team-item">
                            <span class="matchup-team-logo">${homeLogo}</span>
                            <span class="matchup-team-name">${m.home_team}</span>
                            <span class="home-tag">홈</span>
                            ${homePitcherHtml}
                        </div>
                    </div>
                </div>
                <button class="btn-matchup-action" onclick="enterMatchupFromSchedule('${m.home_team}', '${m.away_team}', '${homePitcher}', '${awayPitcher}')">
                    상세보기
                </button>
            </div>
        `;
    }).join('');
}

function enterMatchupFromSchedule(homeTeam, awayTeam, homePitcher, awayPitcher) {
    if (homeTeam === awayTeam) {
        awayTeam = homeTeam === '삼성' ? '한화' : '삼성';
    }
    const targetHomeP = homePitcher || teamPitcherMap[homeTeam] || '후라도';
    const targetAwayP = awayPitcher || teamPitcherMap[awayTeam] || '화이트';

    fetch('/api/state')
        .then(r => r.json())
        .then(serverState => {
            const isOngoing = serverState &&
                (serverState.home_team === homeTeam && serverState.away_team === awayTeam) &&
                !serverState.game_over &&
                ((serverState.totalPitcherCount && serverState.totalPitcherCount > 0) || serverState.inning > 1 || serverState.score_home > 0 || serverState.score_away > 0 || serverState.balls > 0 || serverState.strikes > 0);

            currentHomeTeam = homeTeam;
            currentAwayTeam = awayTeam;
            currentHomePitcher = targetHomeP;
            currentAwayPitcher = targetAwayP;

            if (isOngoing) {
                currentGameState = serverState;
                saveGameStateToStorage(serverState);
                showToast(`⚾ ${awayTeam} vs ${homeTeam} 진행 중인 실시간 경기에 재입장했습니다!`);
                switchView('ingame-view');
            } else {
                fetch('/api/reset', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        home_team: homeTeam,
                        away_team: awayTeam,
                        home_pitcher: targetHomeP,
                        away_pitcher: targetAwayP
                    })
                })
                .then(r => r.json())
                .then(data => {
                    showToast(`⚾ ${awayTeam} vs ${homeTeam} [선발: ${targetAwayP} vs ${targetHomeP}] 매치업 진입!`);
                    if (data && data.state) {
                        currentGameState = data.state;
                        saveGameStateToStorage(data.state);
                        updateScoreboardUI(data.state);
                        drawBaseballField(data.state);
                    }
                    switchView('ingame-view');
                })
                .catch(() => {
                    switchView('ingame-view');
                });
            }
        })
        .catch(() => switchView('ingame-view'));
}

function selectMatchFromSchedule(dateStr, home, away, stadium, timeStr, homePitcher, awayPitcher) {
    if (home === away) {
        showToast("⚠️ 동일 구단 간의 대진은 선택할 수 없습니다.");
        return;
    }
    // 유저의 고유 응원 구단(selectedTeamCode)은 변경하지 않고, 선택한 경기 관전 정보만 갱신
    currentHomeTeam = home;
    currentAwayTeam = away;
    currentHomePitcher = homePitcher || teamPitcherMap[home] || '페덱';
    currentAwayPitcher = awayPitcher || teamPitcherMap[away] || '박준영';
    currentStadium = stadium;
    currentStartTimeStr = timeStr;

    selectTeam(home, away, currentHomePitcher, currentAwayPitcher);
    const homeFull = teamFullMap[normalizeTeamShort(home)] || home;
    const awayFull = teamFullMap[normalizeTeamShort(away)] || away;
    document.getElementById('match-title').innerText = `⚾ ${awayFull} vs ${homeFull} [${stadium}]`;
    showToast(`🎯 [${away} vs ${home}] ${dateStr} ${stadium} 대진이 로비 메인 매치업으로 선택되었습니다.`);
}

function renderFriendRankings(rankings) {
    const listContainer = document.getElementById('friend-ranking-list');
    listContainer.innerHTML = '';

    rankings.forEach((user, index) => {
        const rankNum = index + 1;
        const isMe = user.is_me ? 'my-rank' : '';
        const nameDisplay = user.is_me ? `${userNickname} (나)` : user.name;
        const crown = rankNum === 1 ? '👑 ' : '';
        const userTeamCode = normalizeTeamShort(user.is_me ? selectedTeamCode : (user.favorite_team || user.team));
        const userTeamFull = teamFullMap[userTeamCode] || userTeamCode;
        
        const cardHtml = `
            <div class="rank-item ${isMe}">
                <div class="rank-left">
                    <span class="rank-num r-${rankNum}">${rankNum}</span>
                    <span class="rank-avatar">${user.avatar || '👑'}</span>
                    <div class="rank-info">
                        <span class="rank-name">${crown}${nameDisplay}</span>
                        <span class="rank-team">응원구단: ${userTeamFull}</span>
                    </div>
                </div>
                <div class="rank-right">
                    <span class="grade-badge grade-${user.grade.toLowerCase()}">${user.grade}급</span>
                    <span class="rank-score">${user.score.toLocaleString()} pts</span>
                </div>
            </div>
        `;
        listContainer.insertAdjacentHTML('beforeend', cardHtml);
    });
}

// 친구 검색 토글 및 실행
function toggleFriendSearchBox() {
    const box = document.getElementById('friend-search-box');
    box.classList.toggle('active');
}

function executeFriendSearch() {
    const input = document.getElementById('friend-search-input');
    const query = input.value.trim();
    if (!query) return;

    fetch(`/api/search_friends?query=${encodeURIComponent(query)}&user_id=${currentUserId}`)
        .then(r => r.json())
        .then(data => {
            renderSearchResults(data.results);
        });
}

function renderSearchResults(results) {
    const container = document.getElementById('friend-search-results');
    if (results.length === 0) {
        container.innerHTML = `<div style="font-size:0.75rem; color:#94a3b8; text-align:center; padding:8px;">검색된 유저가 없습니다.</div>`;
        return;
    }

    container.innerHTML = results.map(u => `
        <div class="search-item">
            <div class="search-item-info">
                <span>${u.avatar || '🧢'}</span>
                <div>
                    <div class="search-item-name">${u.nickname} (${u.score.toLocaleString()}pt)</div>
                    <div class="search-item-team">응원 팀: ${u.team} | ${u.grade}급</div>
                </div>
            </div>
            ${u.is_friend ? 
                `<button class="btn-add-friend added" disabled>✓ 친구</button>` :
                `<button class="btn-add-friend" onclick="addFriend(${u.id})">+ 친구 추가</button>`
            }
        </div>
    `).join('');
}

function addFriend(friendId) {
    fetch('/api/add_friend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUserId, friend_id: friendId })
    })
    .then(r => r.json())
    .then(res => {
        if (res.status === 'success') {
            showToast(`🤝 ${res.message}`);
            executeFriendSearch();
            loadLobbyData();
        } else {
            showToast(`⚠️ ${res.message}`);
        }
    });
}

function startSSEStream() {
    if (sseSource) return;

    sseSource = new EventSource('/api/stream');
    sseSource.onmessage = (event) => {
        const state = JSON.parse(event.data);
        currentGameState = state;
        updateScoreboardUI(state);
        drawBaseballField(state);

        if (state.game_over) {
            stopSSEStream();
            renderPostGameSummary(state);
            switchView('postgame-view');
            return;
        }

        if (state.crisis_active && state.current_crisis) {
            openCrisisModal(state.current_crisis);
        }
    };

    sseSource.onerror = (err) => {
        console.log("SSE Connection closed or retrying...");
    };
}

function stopSSEStream() {
    if (sseSource) {
        sseSource.close();
        sseSource = null;
    }
}

function updateScoreboardUI(s) {
    if (!s) return;

    try {
        const awayEl = document.getElementById('sb-away-team');
        if (awayEl) awayEl.innerHTML = `${getTeamLogoHtml(s.away_team, 'sb-team-logo-img')} ${s.away_team || '어웨이'}`;

        const homeEl = document.getElementById('sb-home-team');
        if (homeEl) homeEl.innerHTML = `${s.home_team || '홈'} ${getTeamLogoHtml(s.home_team, 'sb-team-logo-img')}`;

        const scoreEl = document.getElementById('sb-score');
        if (scoreEl) scoreEl.innerText = `${s.score_away ?? 0} : ${s.score_home ?? 0}`;

        const inningEl = document.getElementById('sb-inning');
        if (inningEl) inningEl.innerText = s.inning_str || '1회초';

        const liveScoreEl = document.getElementById('live-score-val');
        if (liveScoreEl) {
            const scoreVal = (s.manager_score !== undefined && s.manager_score !== null) ? s.manager_score : 2000;
            liveScoreEl.innerText = `${scoreVal.toLocaleString()} pts`;
        }

        const pitcherEl = document.getElementById('live-pitcher');
        if (pitcherEl) pitcherEl.innerText = s.pitcher || '투수';

        const pitcherCountEl = document.getElementById('pitcher-count');
        const totalPCount = (s && s.totalPitcherCount !== undefined) ? s.totalPitcherCount : (s ? (s.pitch_count ?? 0) : 0);
        if (pitcherCountEl) pitcherCountEl.innerText = `(투구수 ${totalPCount}구)`;

        const session = (s && s.batter_sessions && s.batter_sessions.length > 0) ? s.batter_sessions[0] : null;
        const currentBatterAvg = session ? (session.batter_avg || (session.batter_stats ? session.batter_stats.avg : '0.312')) : '0.312';

        const batterEl = document.getElementById('live-batter');
        if (batterEl) batterEl.innerText = s.batter || '타자';

        const batterAvgEl = document.getElementById('live-batter-avg');
        if (batterAvgEl) batterAvgEl.innerText = `(타율 ${currentBatterAvg})`;

        updateLeds('led-b', s.balls ?? 0, 'active-b');
        updateLeds('led-s', s.strikes ?? 0, 'active-s');
        updateLeds('led-o', s.outs ?? 0, 'active-o');

        const b1 = document.getElementById('mini-1b');
        if (b1) b1.classList.toggle('occupied', !!s.runner_1b);

        const b2 = document.getElementById('mini-2b');
        if (b2) b2.classList.toggle('occupied', !!s.runner_2b);

        const b3 = document.getElementById('mini-3b');
        if (b3) b3.classList.toggle('occupied', !!s.runner_3b);
    } catch (err) {
        console.error("Scoreboard UI Error:", err);
    }

    try {
        renderNaverSportsLiveFeed(s);
    } catch (err) {
        console.error("Render Feed Error:", err);
    }

    if (s && s.crisis_active && s.current_crisis) {
        openCrisisModal(s.current_crisis);
    }

    if (s && s.tactic_resolution && window._lastHandledCaseId !== (s.tactic_resolution.case_no + '_' + s.totalPitcherCount)) {
        window._lastHandledCaseId = s.tactic_resolution.case_no + '_' + s.totalPitcherCount;
        openTacticResultModal(s.tactic_resolution);
    }
}

let clientPitchSeq = 0;
const pitchPresets = [
    { name: "직구", speed: "148km/h", result: "스트라이크", code: "STRIKE" },
    { name: "슬라이더", speed: "136km/h", result: "볼", code: "BALL" },
    { name: "투심", speed: "142km/h", result: "파울", code: "FOUL" },
    { name: "체인지업", speed: "131km/h", result: "타격 (안타)", code: "SINGLE" },
    { name: "커브", speed: "125km/h", result: "스트라이크", code: "STRIKE" },
    { name: "포크볼", speed: "134km/h", result: "아웃", code: "OUT" },
    { name: "직구", speed: "151km/h", result: "파울", code: "FOUL" },
    { name: "슬라이더", speed: "138km/h", result: "볼", code: "BALL" },
    { name: "투심", speed: "144km/h", result: "타격 (2루타)", code: "DOUBLE" },
    { name: "직구", speed: "149km/h", result: "타격 (홈런)", code: "HOMERUN" },
    { name: "커브", speed: "128km/h", result: "볼", code: "BALL" },
    { name: "포크볼", speed: "135km/h", result: "스트라이크", code: "STRIKE" }
];

let userIsReadingHistory = false;

function setupSmartAutoScroll() {
    const streamContainer = document.getElementById('text-stream') || document.getElementById('naver-live-feed');
    if (!streamContainer) return;

    streamContainer.addEventListener('scroll', () => {
        // userIsReadingHistory is true whenever user has scrolled down away from the top active area (> 20px)
        userIsReadingHistory = (streamContainer.scrollTop > 20);
    });
}

let userSelectedInningTab = 'all';

function selectInningTab(tabKey) {
    userSelectedInningTab = tabKey;
    updateInningTabBarUI(currentGameState ? currentGameState.inning : 1);
    if (currentGameState) {
        renderNaverSportsLiveFeed(currentGameState);
    }
}

function updateInningTabBarUI(currentInning) {
    const tabBar = document.getElementById('inning-tab-bar');
    if (!tabBar) return;

    let activeKey = (userSelectedInningTab !== null && userSelectedInningTab !== undefined) ? userSelectedInningTab : 'all';

    const pills = tabBar.querySelectorAll('.inning-tab-pill');
    pills.forEach(pill => {
        const attr = pill.getAttribute('data-tab');
        let isActive = false;
        if (typeof activeKey === 'number' || !isNaN(Number(activeKey))) {
            isActive = (attr === String(activeKey));
        } else {
            isActive = (attr === String(activeKey).toLowerCase());
        }

        if (isActive) {
            pill.classList.add('active');
        } else {
            pill.classList.remove('active');
        }
    });
}

function appendPitchTextLog(s) {
    renderNaverSportsLiveFeed(s);
}

function renderNaverSportsLiveFeed(s) {
    const headerContainer = document.getElementById('batter-profile-header');
    const resultContainer = document.getElementById('at-bat-result-banner');
    const streamContainer = document.getElementById('text-stream') || document.getElementById('naver-live-feed');

    if (!s) return;

    // Synchronize Top Inning Tab Bar Navigation UI
    updateInningTabBarUI(s.inning || 1);

    // 1. Current Batter Profile Card (현재 타자 프로필 카드 상단 고정)
    let session = (s.batter_sessions && s.batter_sessions.length > 0) ? s.batter_sessions[0] : null;
    if (session && s.batter && session.batter_name !== s.batter) {
        const matching = s.batter_sessions.find(bs => bs.batter_name === s.batter);
        if (matching) {
            session = matching;
        }
    }

    const bName = s.batter || (session ? session.batter_name : '황성빈');
    const bOrder = session ? (session.batter_order || '1번타자') : '1번타자';
    const bAvg = session ? (session.batter_avg || '0.288') : '0.288';

    // Single Source of Truth for Season Batting Average & Zero-Start Rule for In-Game Stats
    const stats = (session && session.batter_stats) ? session.batter_stats : {
        order: bOrder,
        avg: bAvg,
        tasuk: 0,
        tasu: 0,
        anta: 0,
        deukjeom: 0,
        tajeom: 0,
        homerun: 0,
        bolnet: 0,
        samjin: 0
    };

    const finalSeasonAvg = stats.avg || bAvg;

    if (headerContainer) {
        headerContainer.innerHTML = `
            <div class="batter-header-flex">
                <div class="batter-avatar-box">
                    <span class="batter-avatar-emoji">🧢</span>
                </div>
                <div class="batter-info-box">
                    <div class="batter-name-row">
                        <strong class="batter-name-text">${bName}</strong>
                        <span class="batter-meta-text">${bOrder} · 타율 ${finalSeasonAvg}</span>
                    </div>
                    <div class="batter-stats-row">
                        <span>타석 <strong>${stats.tasuk ?? 0}</strong></span>
                        <span class="sep">|</span>
                        <span>타수 <strong>${stats.tasu ?? 0}</strong></span>
                        <span class="sep">|</span>
                        <span>안타 <strong>${stats.anta ?? 0}</strong></span>
                        <span class="sep">|</span>
                        <span>득점 <strong>${stats.deukjeom ?? 0}</strong></span>
                        <span class="sep">|</span>
                        <span>타점 <strong>${stats.tajeom ?? 0}</strong></span>
                        <span class="sep">|</span>
                        <span>홈런 <strong>${stats.homerun ?? 0}</strong></span>
                        <span class="sep">|</span>
                        <span>볼넷 <strong>${stats.bolnet ?? 0}</strong></span>
                        <span class="sep">|</span>
                        <span>삼진 <strong>${stats.samjin ?? 0}</strong></span>
                    </div>
                </div>
            </div>
        `;
    }

    // 2. Pitch Timeline & At-Bat History Archive Stack (#text-stream)
    if (!streamContainer) return;

    const allSessions = (s.batter_sessions && s.batter_sessions.length > 0) ? s.batter_sessions : [];

    // Filter sessions by active tab
    const activeKey = (userSelectedInningTab !== null && userSelectedInningTab !== undefined) ? userSelectedInningTab : 'all';

    let filteredSessions = [];
    if (activeKey === 'all') {
        filteredSessions = allSessions;
    } else if (activeKey === 'score') {
        filteredSessions = allSessions.filter(sess => {
            const summary = sess.play_summary || '';
            const isScoringSummary = summary.includes('득점') || summary.includes('홈런') || summary.includes('타점') || summary.includes('점');
            const hasScoringPitch = (sess.pitches || []).some(p => p.code === 'HOMERUN' || (p.result && (p.result.includes('홈런') || p.result.includes('득점'))));
            return isScoringSummary || hasScoringPitch;
        });
    } else {
        const targetInningNum = Number(activeKey);
        filteredSessions = allSessions.filter(sess => {
            const inn = sess.inning || (sess.inning_str ? parseInt(sess.inning_str, 10) : 1);
            return inn === targetInningNum;
        });
    }

    // Safety fallback: If filtered sessions is empty, fallback to allSessions so live stream is always active and visible
    if (filteredSessions.length === 0) {
        filteredSessions = allSessions;
    }

    if (filteredSessions.length === 0) {
        streamContainer.innerHTML = `
            <div class="stream-log-card default-log" style="padding:16px; text-align:center; color:#94a3b8; font-size:0.85rem; background:#0f172a; border-radius:8px; border:1px solid rgba(255,255,255,0.08);">
                ⚾ <strong>[라이브 중계 진행 대기]</strong> 우측 상단의 <strong>[1구 투구]</strong> 버튼을 누르시면 투구 타임라인이 라이브 스트림으로 차곡차곡 쌓입니다.
            </div>
        `;
        return;
    }

    let fullStreamHtml = '';

    filteredSessions.forEach((sess, sessIdx) => {
        const innNum = sess.inning || (sess.inning_str ? parseInt(sess.inning_str, 10) : 1);
        const isTop = (sess.is_top !== undefined) ? sess.is_top : (sess.inning_str ? sess.inning_str.includes('초') : true);
        const innStr = sess.inning_str || `${innNum}회${isTop ? '초' : '말'}`;
        const offenseTeam = sess.offense_team || (isTop ? (s.away_team_name || s.away_team || '한화') : (s.home_team_name || s.home_team || '롯데'));

        // Check if half-inning section changes compared to previous rendered session in loop
        const prevSess = sessIdx > 0 ? filteredSessions[sessIdx - 1] : null;
        const prevInnNum = prevSess ? (prevSess.inning || (prevSess.inning_str ? parseInt(prevSess.inning_str, 10) : 1)) : null;
        const prevIsTop = prevSess ? ((prevSess.is_top !== undefined) ? prevSess.is_top : (prevSess.inning_str ? prevSess.inning_str.includes('초') : true)) : null;

        const isNewSection = (sessIdx === 0) || (innNum !== prevInnNum) || (isTop !== prevIsTop);

        let dividerHtml = '';
        if (isNewSection) {
            const dividerClass = isTop ? 'top-divider' : 'bottom-divider';
            dividerHtml = `
                <div class="half-inning-divider ${dividerClass}">
                    <span>--- ${innStr} ${offenseTeam} 공격 ---</span>
                </div>
            `;
        }

        const sessPitches = sess.pitches || [];
        const reversedPitches = [...sessPitches].reverse();
        
        let headerHtml = '';
        if (sess.play_summary && sess.play_summary.trim() !== '') {
            // Completed at-bat final result title header (Strict rule: NO win probability string)
            headerHtml = `
                <div class="at-bat-final-result-title">
                    <span class="result-title-icon">⚾</span>
                    <span class="result-title-text">${sess.play_summary}</span>
                </div>
            `;
        } else {
            // Active ongoing at-bat header
            const inningInfo = sess.inning_str ? `[${sess.inning_str}] ` : '';
            headerHtml = `
                <div class="at-bat-block-header">
                    <span class="at-bat-active-tag">⚾ ${inningInfo}${sess.batter_name || bName} (${sess.batter_order || bOrder})</span>
                    <span class="at-bat-status-badge">진행 중</span>
                </div>
            `;
        }

        let timelineHtml = '';
        if (reversedPitches.length === 0) {
            timelineHtml = `
                <div class="pitch-pending-text" style="color:#64748b; font-size:0.82rem; padding:6px 0; text-align:center;">
                    ⚾ 투구 준비 중입니다.
                </div>
            `;
        } else {
            timelineHtml = reversedPitches.map((p, idx) => {
                if (p.is_pitcher_change || p.type === 'PITCHER_CHANGE') {
                    const isChange = (p.result === '투수 교체') || (p.old_pitcher && p.new_pitcher && p.old_pitcher !== p.new_pitcher);
                    return `
                        <div class="pitcher-change-timeline-banner ${isChange ? 'is-change' : 'is-keep'}">
                            <div class="pitcher-change-header">
                                <span class="pitcher-change-badge">${isChange ? '🔄 투수 교체' : '🛡️ 투수 유지'}</span>
                                <span class="pitcher-change-names">${p.old_pitcher || '투수'} ➔ <strong class="new-p-highlight">${p.new_pitcher || '구원투수'}</strong></span>
                            </div>
                            <div class="pitcher-change-desc">
                                ${p.commentary_text || '마운드 투수가 교체되었습니다.'}
                            </div>
                        </div>
                    `;
                }

                const seq = p.seq || (sessPitches.length - idx);
                const resText = p.result || '스트라이크';
                const speedType = p.speed_type || '141km/h 커터';
                const countText = p.count ? (p.count.startsWith('S-B:') ? p.count.replace('S-B: ', '').replace('-', ' - ') : p.count) : `${s.strikes || 0} - ${s.balls || 0}`;

                let badgeClass = 'badge-orange';
                if (p.code === 'BALL' || resText.includes('볼')) {
                    badgeClass = 'badge-green';
                } else if (p.code === 'SINGLE' || p.code === 'DOUBLE' || p.code === 'HOMERUN' || resText.includes('타격') || resText.includes('안타')) {
                    badgeClass = 'badge-blue';
                } else if (p.code === 'OUT' || resText.includes('아웃') || resText.includes('삼진')) {
                    badgeClass = 'badge-red';
                } else {
                    badgeClass = 'badge-orange';
                }

                return `
                    <div class="pitch-timeline-row">
                        <div class="pitch-badge-group ${badgeClass}">
                            <span class="pitch-num-circle">${seq}</span>
                            <span class="pitch-result-label">${resText}</span>
                        </div>
                        <div class="pitch-detail-desc">
                            <span class="pitch-speed-type">${speedType}</span>
                            <span class="pitch-count-split">| ${countText}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }

        fullStreamHtml += `
            ${dividerHtml}
            <div class="at-bat-history-block">
                ${headerHtml}
                <div class="pitch-timeline-list">
                    ${timelineHtml}
                </div>
            </div>
        `;
    });

    streamContainer.innerHTML = fullStreamHtml;
    if (!userIsReadingHistory) {
        streamContainer.scrollTop = 0;
    }
}

function updateLeds(containerId, count, activeClass) {
    const ids = [containerId, `mini-${containerId}`];
    ids.forEach(id => {
        const container = document.getElementById(id);
        if (!container) return;
        const leds = container.querySelectorAll('.led, .dot');
        leds.forEach((led, i) => {
            if (i < count) {
                led.classList.add(activeClass);
            } else {
                led.classList.remove(activeClass);
            }
        });
    });
}

function openCrisisModal(crisis) {
    const modal = document.getElementById('crisis-modal');
    if (!modal) return;
    if (modal.classList.contains('active')) return;

    const titleEl = document.getElementById('crisis-title');
    if (titleEl) titleEl.innerText = crisis.title || '🚨 [위기 관리] 투수 교체 감독 지시';

    const descEl = document.getElementById('crisis-desc');
    if (descEl) descEl.innerText = crisis.desc || '위기 상황 발생!';

    const pName = crisis.pitcher_name || (currentGameState ? currentGameState.pitcher : '투수');
    const pCount = crisis.pitch_count !== undefined ? crisis.pitch_count : (currentGameState ? currentGameState.totalPitcherCount : 0);
    const condLabel = crisis.condition_label || (pCount >= 70 ? '조건 B: 70구 이상 득점권 실점 위기' : '조건 A: 70구 미만 4타자 연속 출루 위기');

    const statusBox = document.getElementById('crisis-pitcher-status-box');
    if (statusBox) {
        statusBox.innerHTML = `
            <div class="crisis-status-row">
                <span class="lbl">🧢 마운드 투수:</span>
                <strong class="val-pitcher">${pName} 투수</strong>
            </div>
            <div class="crisis-status-row">
                <span class="lbl">📊 현재 투구수:</span>
                <span class="val-count">${pCount}구 투구 중</span>
            </div>
            <div class="crisis-status-row">
                <span class="lbl">⚠️ 감지된 위기:</span>
                <span class="val-cond-badge">${condLabel}</span>
            </div>
        `;
    }

    const optionsContainer = document.getElementById('tactics-options-container');
    if (optionsContainer) {
        optionsContainer.className = 'tactics-options-bold';
        optionsContainer.innerHTML = `
            <button class="btn-tactic-block btn-pitcher-change" onclick="submitTactic('PITCHER_CHANGE')">
                <span class="btn-block-text">🚨 [ 투수 교체하기 ]</span>
                <span class="btn-sub-text">불펜 구원 투수로 마운드 교체 (+감독 스코어 가산)</span>
            </button>
            <button class="btn-tactic-block btn-stay-pitcher" onclick="submitTactic('KEEP_PITCHER')">
                <span class="btn-block-text">🛡️ [ 투수 교체하지 않기 ]</span>
                <span class="btn-sub-text">현재 투수로 계속 진행 (강행 투구)</span>
            </button>
        `;
    }

    modal.classList.add('active');
    playWebAudioAlert('tactic_modal');

    crisisTimeLeft = 15;
    updateCrisisTimerGauge();

    clearInterval(crisisTimerInterval);
    crisisTimerInterval = setInterval(() => {
        crisisTimeLeft--;
        updateCrisisTimerGauge();

        if (crisisTimeLeft <= 0) {
            clearInterval(crisisTimerInterval);
            submitTactic('KEEP_PITCHER');
        }
    }, 1000);
}

function updateCrisisTimerGauge() {
    document.getElementById('crisis-timer-sec').innerText = `${crisisTimeLeft}초`;
    const percent = (crisisTimeLeft / 15) * 100;
    document.getElementById('crisis-timer-gauge').style.width = `${percent}%`;
}

function submitTactic(tacticId) {
    clearInterval(crisisTimerInterval);
    const modal = document.getElementById('crisis-modal');
    if (modal) modal.classList.remove('active');

    fetch('/api/tactic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tactic_id: tacticId, user_id: currentUserId })
    })
    .then(r => r.json())
    .then(res => {
        if (res.status === 'success') {
            if (res.state) {
                currentGameState = res.state;
                updateScoreboardUI(res.state);
                drawBaseballField(res.state);
            }
            const myLabel = (tacticId === 'PITCHER_CHANGE') ? '교체 (O)' : '유지 (X)';
            const mgrLabel = (res.actual_manager_choice === 'CHANGE') ? '교체 (O)' : '유지 (X)';
            showToast(`📋 [위기 작전 제출 완료] 나의 선택: ${myLabel} | 실제 감독: ${mgrLabel} ➔ 타석 승부 결과(아웃/출루) 확정 시 채점됩니다!`);
        }
    });
}

function openTacticResultModal(res) {
    const modal = document.getElementById('tactic-result-modal');
    if (!modal || !res) return;

    const caseEl = document.getElementById('res-case-no');
    if (caseEl) {
        caseEl.innerText = res.case_no ? `${res.case_no}번 케이스 (${res.title || '판정'})` : '위기 채점';
    }

    const badge = document.getElementById('res-grade-badge');
    if (badge) {
        badge.innerText = res.grade || 'B';
        badge.className = `result-badge grade-${(res.grade || 'b').toLowerCase()}`;
    }

    const deltaEl = document.getElementById('res-score-delta');
    if (deltaEl) {
        const delta = res.score_delta || 0;
        if (delta > 0) {
            deltaEl.innerText = `+${delta} pts`;
            deltaEl.className = 'delta-plus';
        } else if (delta < 0) {
            deltaEl.innerText = `${delta} pts`;
            deltaEl.className = 'delta-minus';
        } else {
            deltaEl.innerText = `0 pts`;
            deltaEl.className = 'delta-zero';
        }
    }

    const myChoiceEl = document.getElementById('res-my-choice');
    if (myChoiceEl) {
        myChoiceEl.innerText = res.my_choice_label || ((res.my_choice === 'CHANGE' || res.tactic_id === 'PITCHER_CHANGE') ? '교체 (O)' : '유지 (X)');
    }

    const actualChoiceEl = document.getElementById('res-actual-choice');
    if (actualChoiceEl) {
        actualChoiceEl.innerText = res.mgr_choice_label || (res.actual_manager_choice === 'CHANGE' ? '교체 (O)' : '유지 (X)');
    }

    const resultEl = document.getElementById('res-atbat-result');
    if (resultEl) {
        resultEl.innerText = res.actual_result_label || (res.actual_result === 'OUT' ? '아웃 (O)' : '아웃 외 상황 (X)');
    }

    const commEl = document.getElementById('res-commentary');
    if (commEl) {
        commEl.innerText = res.commentary || '';
        const delta = res.score_delta || 0;
        if (delta > 0) {
            commEl.style.background = 'rgba(16, 185, 129, 0.12)';
            commEl.style.borderColor = 'rgba(16, 185, 129, 0.4)';
            commEl.style.color = '#34d399';
        } else if (delta < 0) {
            commEl.style.background = 'rgba(239, 68, 68, 0.12)';
            commEl.style.borderColor = 'rgba(239, 68, 68, 0.4)';
            commEl.style.color = '#f87171';
        } else {
            commEl.style.background = 'rgba(148, 163, 184, 0.12)';
            commEl.style.borderColor = 'rgba(148, 163, 184, 0.4)';
            commEl.style.color = '#cbd5e1';
        }
    }

    modal.classList.add('active');
    playWebAudioAlert('tactic_result');
}

function closeTacticResultModal() {
    const modal = document.getElementById('tactic-result-modal');
    if (modal) {
        modal.classList.remove('active');
    }
}

let autoPitchInterval = null;

function startAutoPitchTimer() {
    stopAutoPitchTimer();
    autoPitchInterval = setInterval(() => {
        triggerStep();
    }, 15000);
}

function stopAutoPitchTimer() {
    if (autoPitchInterval) {
        clearInterval(autoPitchInterval);
        autoPitchInterval = null;
    }
}

function resetAutoPitchTimer() {
    startAutoPitchTimer();
}

function handleNextPitch() {
    triggerStep();
}

function triggerStep() {
    if (currentGameState && currentGameState.game_over) {
        stopAutoPitchTimer();
        renderPostGameSummary(currentGameState);
        const ingameScreen = document.getElementById('ingame-view');
        if (ingameScreen && ingameScreen.classList.contains('active')) {
            switchView('postgame-view');
        }
        return;
    }
    resetAutoPitchTimer();
    fetch('/api/step', { method: 'POST' })
        .then(r => r.json())
        .then(state => {
            currentGameState = state;
            saveGameStateToStorage(state);

            const ingameScreen = document.getElementById('ingame-view');
            const isIngameActive = ingameScreen && ingameScreen.classList.contains('active');

            if (isIngameActive) {
                updateScoreboardUI(state);
                drawBaseballField(state);
                renderNaverSportsLiveFeed(state);
                if (state.crisis_active && state.current_crisis) {
                    openCrisisModal(state.current_crisis);
                }
            } else {
                if (state.crisis_active && state.current_crisis) {
                    console.log("⚡ Background simulation crisis active:", state.current_crisis.reason);
                }
            }

            if (state.game_over) {
                stopAutoPitchTimer();
                renderPostGameSummary(state);
                if (isIngameActive) {
                    switchView('postgame-view');
                }
            }
        })
        .catch(err => {
            console.warn("API step failed, running local pitch simulation fallback:", err);
            runLocalPitchFallback();
        });
}

function runLocalPitchFallback() {
    if (!currentGameState) {
        currentGameState = {
            inning: 1,
            is_top: true,
            inning_str: '1회초',
            home_team: '롯데',
            away_team: '한화',
            score_home: 0,
            score_away: 0,
            outs: 0,
            balls: 0,
            strikes: 0,
            runner_1b: false,
            runner_2b: false,
            runner_3b: false,
            pitcher: '반즈',
            batter: '문현빈',
            totalPitcherCount: 1,
            currentBatterPitchCount: 1,
            pitch_count: 1,
            batter_sessions: [
                {
                    session_id: 1,
                    inning: 1,
                    is_top: true,
                    inning_str: '1회초',
                    offense_team: '한화',
                    batter_name: '문현빈',
                    batter_order: '1번타자',
                    batter_avg: '0.312',
                    pitches: []
                }
            ]
        };
    }

    currentGameState.totalPitcherCount = (currentGameState.totalPitcherCount || 0) + 1;
    currentGameState.currentBatterPitchCount = (currentGameState.currentBatterPitchCount || 0) + 1;

    if (!currentGameState.batter_sessions || currentGameState.batter_sessions.length === 0) {
        currentGameState.batter_sessions = [{
            session_id: 1,
            inning: currentGameState.inning || 1,
            is_top: currentGameState.is_top ?? true,
            inning_str: currentGameState.inning_str || '1회초',
            offense_team: currentGameState.away_team || '한화',
            batter_name: currentGameState.batter || '문현빈',
            batter_order: '1번타자',
            batter_avg: '0.312',
            pitches: []
        }];
    }

    const currSess = currentGameState.batter_sessions[0];
    const seq = currSess.pitches.length + 1;

    const pitchTypes = [
        { name: "직구", speed: "148km/h" },
        { name: "슬라이더", speed: "136km/h" },
        { name: "투심", speed: "142km/h" },
        { name: "체인지업", speed: "131km/h" },
        { name: "커브", speed: "125km/h" }
    ];
    const pt = pitchTypes[Math.floor(Math.random() * pitchTypes.length)];
    const speedType = `${pt.speed} ${pt.name}`;

    const outcomes = ["STRIKE", "BALL", "FOUL", "SINGLE", "OUT"];
    const code = outcomes[Math.floor(Math.random() * outcomes.length)];

    let resText = "스트라이크";
    if (code === "BALL") {
        currentGameState.balls = (currentGameState.balls || 0) + 1;
        resText = "볼";
    } else if (code === "STRIKE") {
        currentGameState.strikes = (currentGameState.strikes || 0) + 1;
        resText = "스트라이크";
    } else if (code === "FOUL") {
        if ((currentGameState.strikes || 0) < 2) currentGameState.strikes = (currentGameState.strikes || 0) + 1;
        resText = "파울";
    } else if (code === "SINGLE") {
        resText = "타격 (안타)";
        currentGameState.runner_1b = true;
    } else if (code === "OUT") {
        currentGameState.outs = (currentGameState.outs || 0) + 1;
        resText = "아웃";
    }

    const sbCount = `S-B: ${currentGameState.strikes || 0}-${currentGameState.balls || 0}`;

    currSess.pitches.push({
        seq: seq,
        result: resText,
        speed_type: speedType,
        count: sbCount,
        code: code,
        pz_x: Math.round((Math.random() - 0.5) * 120) / 100,
        pz_y: Math.round((Math.random() - 0.5) * 120) / 100
    });

    updateScoreboardUI(currentGameState);
    drawBaseballField(currentGameState);
    renderNaverSportsLiveFeed(currentGameState);
}

function fastForwardMatch() {
    for (let i = 0; i < 20; i++) {
        fetch('/api/step', { method: 'POST' });
    }
    setTimeout(() => {
        fetch('/api/state')
            .then(r => r.json())
            .then(state => {
                renderPostGameSummary(state);
                switchView('postgame-view');
            });
    }, 500);
}

function renderPostGameSummary(s) {
    document.getElementById('post-total-score').innerText = `${s.manager_score.toLocaleString()} pts`;
    const badge = document.getElementById('post-grade-badge');
    badge.innerText = s.manager_grade;
    badge.className = `grade-badge-xl grade-${s.manager_grade.toLowerCase()}`;

    const titles = {
        "S": "🏆 S급 야신의 재림!",
        "A": "⚾ A급 베테랑 명장",
        "B": "🎺 B급 열혈 감독",
        "C": "🍿 C급 직관 마니아",
        "F": "🐣 F급 초보 해설가"
    };
    document.getElementById('post-grade-title').innerText = titles[s.manager_grade] || "집감독 리포트";
}

function resetMatchAndLobby() {
    clientPitchSeq = 0;
    const streamContainer = document.getElementById('text-stream') || document.getElementById('naver-live-feed');
    if (streamContainer) {
        streamContainer.innerHTML = '';
    }
    fetch('/api/reset', { method: 'POST' })
        .then(() => switchView('pregame-view'));
}

function openShareModal() {
    document.getElementById('share-modal').classList.add('active');
}

function closeShareModal() {
    document.getElementById('share-modal').classList.remove('active');
}

function copyShareLink() {
    navigator.clipboard.writeText(window.location.href);
    showToast(`📋 ${userNickname} 감독님의 공유 링크가 클립보드에 복사되었습니다!`);
    closeShareModal();
}

function showToast(msg) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

let ctx = null;
function initCanvas() {
    const canvas = document.getElementById('baseballFieldCanvas');
    if (canvas) {
        ctx = canvas.getContext('2d');
    }
}

let graphicViewMode = 'FIELD'; // Default: 'FIELD' (주루/필드 뷰), 'BATTING' (타석 3D 뷰)

function toggleGraphicView() {
    graphicViewMode = (graphicViewMode === 'FIELD') ? 'BATTING' : 'FIELD';
    const btnLabel = document.getElementById('toggle-btn-label');
    if (btnLabel) {
        btnLabel.innerText = (graphicViewMode === 'FIELD') ? '타석보기' : '주루보기';
    }
    if (currentGameState) {
        drawBaseballField(currentGameState);
    }
}

function updateMiniLeds(containerId, count, activeClass) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const dots = container.querySelectorAll('.dot');
    dots.forEach((dot, i) => {
        if (i < count) {
            dot.classList.add(activeClass);
        } else {
            dot.className = 'dot';
        }
    });
}

function drawBaseballField(s) {
    if (!s) s = currentGameState;
    const canvas = document.getElementById('baseballFieldCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width || 600;
    const h = canvas.height || 340;

    // 1. Update Left-Top Mini Scoreboard Overlay Widget
    if (s) {
        const awayNameEl = document.getElementById('mini-away-name');
        if (awayNameEl) awayNameEl.innerText = s.away_team || '한화';

        const awayLogoEl = document.getElementById('mini-away-logo');
        if (awayLogoEl) awayLogoEl.innerHTML = getTeamLogoHtml(s.away_team || '한화', 'mini-team-logo-img');

        const awayScoreEl = document.getElementById('mini-away-score');
        if (awayScoreEl) awayScoreEl.innerText = s.score_away ?? 0;

        const homeNameEl = document.getElementById('mini-home-name');
        if (homeNameEl) homeNameEl.innerText = s.home_team || '삼성';

        const homeLogoEl = document.getElementById('mini-home-logo');
        if (homeLogoEl) homeLogoEl.innerHTML = getTeamLogoHtml(s.home_team || '삼성', 'mini-team-logo-img');

        const homeScoreEl = document.getElementById('mini-home-score');
        if (homeScoreEl) homeScoreEl.innerText = s.score_home ?? 0;

        const innNumEl = document.getElementById('mini-inning-num');
        if (innNumEl) innNumEl.innerText = s.inning || 1;

        const innDirEl = document.getElementById('mini-inning-dir');
        if (innDirEl) innDirEl.innerText = s.is_top ? '▲' : '▼';

        const isInitStart = s && (s.inning === 1 || !s.inning) && (s.is_top !== false) && (!s.totalPitcherCount || s.totalPitcherCount === 0);

        const b1 = document.getElementById('mini-base-1b');
        if (b1) b1.classList.toggle('occupied', isInitStart ? false : !!s.runner_1b);
        const b2 = document.getElementById('mini-base-2b');
        if (b2) b2.classList.toggle('occupied', isInitStart ? false : !!s.runner_2b);
        const b3 = document.getElementById('mini-base-3b');
        if (b3) b3.classList.toggle('occupied', isInitStart ? false : !!s.runner_3b);

        updateMiniLeds('mini-led-b', s.balls ?? 0, 'active-b');
        updateMiniLeds('mini-led-s', s.strikes ?? 0, 'active-s');
        updateMiniLeds('mini-led-o', s.outs ?? 0, 'active-o');

        const activePitcher = s.pitcher || (s.is_top ? (teamPitcherMap[s.home_team] || '원태인') : (teamPitcherMap[s.away_team] || '류현진'));
        const pNameEl = document.getElementById('mini-p-name');
        if (pNameEl) pNameEl.innerText = activePitcher;

        const pCountEl = document.getElementById('mini-p-count');
        const pCount = (s.totalPitcherCount !== undefined) ? s.totalPitcherCount : (s.pitch_count || 0);
        if (pCountEl) pCountEl.innerText = `투구수 ${pCount}`;

        // Top Matchup Bar Sync
        const liveP = document.getElementById('live-pitcher');
        if (liveP) liveP.innerText = activePitcher;
        const pCountDetail = document.getElementById('pitcher-count');
        if (pCountDetail) pCountDetail.innerText = `(투구수 ${pCount}구)`;

        const activeBatter = s.batter || (s.is_top ? (teamBatterMap[s.away_team] || '황영묵') : (teamBatterMap[s.home_team] || '김지찬'));
        const liveB = document.getElementById('live-batter');
        if (liveB) liveB.innerText = activeBatter;
    }

    // 2. Update Left-Bottom On-Deck List Widget
    const onDeckListEl = document.getElementById('on-deck-list');
    const onDeckWidget = document.getElementById('on-deck-widget');

    if (onDeckWidget) {
        onDeckWidget.style.display = (graphicViewMode === 'FIELD') ? 'block' : 'none';
    }

    if (onDeckListEl && s) {
        if (s.on_deck_batters && s.on_deck_batters.length > 0) {
            onDeckListEl.innerHTML = s.on_deck_batters.map(b => `<div>${b}</div>`).join('');
        } else {
            const fallbackOnDeck = s.is_top ? ["2.페라자", "3.노시환", "4.채은성"] : ["2.이재현", "3.구자욱", "4.맥키넌"];
            onDeckListEl.innerHTML = fallbackOnDeck.map(b => `<div>${b}</div>`).join('');
        }
    }

    // 3. Render View Mode (FIELD vs BATTING)
    const overlayLayer = document.getElementById('fielders-overlay-layer');

    if (graphicViewMode === 'FIELD') {
        if (overlayLayer) {
            overlayLayer.style.display = 'block';
            renderFieldersOverlay(overlayLayer, s);
        }
        drawGroundFieldCanvas(ctx, w, h, s);
    } else {
        if (overlayLayer) {
            overlayLayer.style.display = 'none';
        }
        drawBatting3DCanvas(ctx, w, h, s);
    }
}

function renderFieldersOverlay(layer, s) {
    if (!layer) return;

    // Defense Fielders from state or default Samsung/Hanwha defense
    const defaultSamsungFielders = [
        { role: 'P', name: (s && s.pitcher) ? s.pitcher : '원태인', x: 50, y: 53, avatar: '🧢' },
        { role: 'C', name: '강민호', x: 50, y: 84, avatar: '⚾' },
        { role: '1B', name: '맥키넌', x: 74, y: 56, avatar: '🧢' },
        { role: '2B', name: '류지혁', x: 63, y: 37, avatar: '🧢' },
        { role: '3B', name: '김영웅', x: 26, y: 56, avatar: '🧢' },
        { role: 'SS', name: '이재현', x: 37, y: 37, avatar: '🧢' },
        { role: 'LF', name: '구자욱', x: 22, y: 24, avatar: '🧢' },
        { role: 'CF', name: '김지찬', x: 50, y: 15, avatar: '🧢' },
        { role: 'RF', name: '이성규', x: 78, y: 24, avatar: '🧢' }
    ];

    const defaultHanwhaFielders = [
        { role: 'P', name: (s && s.pitcher) ? s.pitcher : '류현진', x: 50, y: 53, avatar: '🧢' },
        { role: 'C', name: '최재훈', x: 50, y: 84, avatar: '⚾' },
        { role: '1B', name: '채은성', x: 74, y: 56, avatar: '🧢' },
        { role: '2B', name: '안치홍', x: 63, y: 37, avatar: '🧢' },
        { role: '3B', name: '노시환', x: 26, y: 56, avatar: '🧢' },
        { role: 'SS', name: '황영묵', x: 37, y: 37, avatar: '🧢' },
        { role: 'LF', name: '최인호', x: 22, y: 24, avatar: '🧢' },
        { role: 'CF', name: '장진혁', x: 50, y: 15, avatar: '🧢' },
        { role: 'RF', name: '페라자', x: 78, y: 24, avatar: '🧢' }
    ];

    const isHomeDefense = (s && s.is_top !== false); // In top inning, home team is defending
    const defTeam = isHomeDefense ? (s ? s.home_team : '삼성') : (s ? s.away_team : '한화');
    const defaultFielders = (defTeam === '한화') ? defaultHanwhaFielders : defaultSamsungFielders;

    let fielders = (s && s.fielders && s.fielders.length > 0) ? s.fielders : defaultFielders;

    let html = fielders.map(f => `
        <div class="fielder-node" style="left: ${f.x}%; top: ${f.y}%;">
            <div class="fielder-avatar">${f.avatar || '🧢'}</div>
            <div class="fielder-name-pill">${f.name}</div>
        </div>
    `).join('');

    // Offense Runners on base (Enforce bases empty at initial game start)
    const isInitStart = s && (s.inning === 1 || !s.inning) && (s.is_top !== false) && (!s.totalPitcherCount || s.totalPitcherCount === 0);
    const defaultRunners = (s && s.is_top === false) ? { r1: '이재현', r2: '구자욱', r3: '맥키넌' } : { r1: '채은성', r2: '안치홍', r3: '노시환' };

    if (!isInitStart && s && s.runner_1b) {
        const r1Name = s.runner_1b_name || defaultRunners.r1;
        html += `
            <div class="runner-node" style="left: 67%; top: 49%;">
                <div class="runner-avatar">🏃</div>
                <div class="fielder-name-pill" style="border-color:#fef08a; color:#fef08a;">${r1Name}</div>
            </div>
        `;
    }
    if (!isInitStart && s && s.runner_2b) {
        const r2Name = s.runner_2b_name || defaultRunners.r2;
        html += `
            <div class="runner-node" style="left: 50%; top: 31%;">
                <div class="runner-avatar">🏃</div>
                <div class="fielder-name-pill" style="border-color:#fef08a; color:#fef08a;">${r2Name}</div>
            </div>
        `;
    }
    if (!isInitStart && s && s.runner_3b) {
        const r3Name = s.runner_3b_name || defaultRunners.r3;
        html += `
            <div class="runner-node" style="left: 33%; top: 49%;">
                <div class="runner-avatar">🏃</div>
                <div class="fielder-name-pill" style="border-color:#fef08a; color:#fef08a;">${r3Name}</div>
            </div>
        `;
    }

    layer.innerHTML = html;
}

function drawGroundFieldCanvas(ctx, w, h, s) {
    ctx.clearRect(0, 0, w, h);

    // 1. Lush Green Grass Field Gradient Background
    const grassGrad = ctx.createLinearGradient(0, 0, 0, h);
    grassGrad.addColorStop(0, '#15803d');
    grassGrad.addColorStop(0.5, '#166534');
    grassGrad.addColorStop(1, '#14532d');
    ctx.fillStyle = grassGrad;
    ctx.fillRect(0, 0, w, h);

    // Outfield warning track arc
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.85, w * 0.58, Math.PI * 1.1, Math.PI * 1.9);
    ctx.strokeStyle = 'rgba(161, 98, 7, 0.4)';
    ctx.lineWidth = 14;
    ctx.stroke();

    // 2. Infield Dirt Diamond Arc & Dirt Base Paths
    const homeX = w / 2;
    const homeY = h * 0.82;
    const b1X = w * 0.74;
    const b1Y = h * 0.56;
    const b2X = w / 2;
    const b2Y = h * 0.35;
    const b3X = w * 0.26;
    const b3Y = h * 0.56;

    // Dirt Infield Arc Fill
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.53, w * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(161, 98, 7, 0.55)';
    ctx.fill();

    // Infield Grass Diamond Fill
    ctx.beginPath();
    ctx.moveTo(homeX, homeY - 12);
    ctx.lineTo(b1X - 12, b1Y);
    ctx.lineTo(b2X, b2Y + 12);
    ctx.lineTo(b3X + 12, b3Y);
    ctx.closePath();
    ctx.fillStyle = '#166534';
    ctx.fill();

    // White Foul Lines
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(homeX, homeY);
    ctx.lineTo(w * 0.96, h * 0.15);
    ctx.moveTo(homeX, homeY);
    ctx.lineTo(w * 0.04, h * 0.15);
    ctx.stroke();

    // Pitcher's Mound Dirt Circle & Rubber
    const pX = w / 2;
    const pY = h * 0.53;
    ctx.beginPath();
    ctx.arc(pX, pY, 14, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(180, 83, 9, 0.85)';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(pX - 5, pY - 2, 10, 3);

    // Home Plate Pentagon
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(homeX, homeY - 6);
    ctx.lineTo(homeX + 8, homeY);
    ctx.lineTo(homeX + 5, homeY + 8);
    ctx.lineTo(homeX - 5, homeY + 8);
    ctx.lineTo(homeX - 8, homeY);
    ctx.closePath();
    ctx.fill();

    // Base Diamonds (1B, 2B, 3B) - Enforce empty at initial match start
    const isInitStartCanvas = s && (s.inning === 1 || !s.inning) && (s.is_top !== false) && (!s.totalPitcherCount || s.totalPitcherCount === 0);
    const run1 = isInitStartCanvas ? false : !!(s && s.runner_1b);
    const run2 = isInitStartCanvas ? false : !!(s && s.runner_2b);
    const run3 = isInitStartCanvas ? false : !!(s && s.runner_3b);

    drawSingleBase(ctx, b1X, b1Y, run1);
    drawSingleBase(ctx, b2X, b2Y, run2);
    drawSingleBase(ctx, b3X, b3Y, run3);
}

function drawSingleBase(ctx, x, y, isOccupied) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    if (isOccupied) {
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(-7, -7, 14, 14);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.strokeRect(-7, -7, 14, 14);
    } else {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-5, -5, 10, 10);
    }
    ctx.restore();
}

function drawBatting3DCanvas(ctx, w, h, s) {
    ctx.clearRect(0, 0, w, h);

    // 1. Stadium Perspective Background Gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#0f172a');
    bgGrad.addColorStop(0.45, '#1e293b');
    bgGrad.addColorStop(1, '#064e3b');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Outfield Horizon & Fence Line
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.46);
    ctx.lineTo(w, h * 0.46);
    ctx.stroke();

    // 2. Batter Box & Home Plate
    const homeX = w / 2;
    const homeY = h - 25;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.moveTo(homeX, homeY - 8);
    ctx.lineTo(homeX + 15, homeY);
    ctx.lineTo(homeX + 10, homeY + 12);
    ctx.lineTo(homeX - 10, homeY + 12);
    ctx.lineTo(homeX - 15, homeY);
    ctx.closePath();
    ctx.fill();

    // Batter Boxes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(homeX - 55, homeY - 15, 30, 42);
    ctx.strokeRect(homeX + 25, homeY - 15, 30, 42);

    // Batter Avatar Graphic (Home Plate Left Side)
    ctx.fillStyle = '#60a5fa';
    ctx.beginPath();
    ctx.arc(homeX - 40, homeY - 25, 10, 0, Math.PI * 2);
    ctx.fill();

    // Bat
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(homeX - 35, homeY - 25);
    ctx.lineTo(homeX - 20, homeY - 60);
    ctx.stroke();

    // 3. Centered Strike Zone Box (3x3 Grid)
    const zoneW = 125;
    const zoneH = 145;
    const zoneX = (w - zoneW) / 2;
    const zoneY = 60;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fillRect(zoneX, zoneY, zoneW, zoneH);

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#0284c7';
    ctx.shadowBlur = 8;
    ctx.strokeRect(zoneX, zoneY, zoneW, zoneH);
    ctx.shadowBlur = 0;

    // 3x3 Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    const cellW = zoneW / 3;
    const cellH = zoneH / 3;

    ctx.beginPath();
    ctx.moveTo(zoneX + cellW, zoneY);
    ctx.lineTo(zoneX + cellW, zoneY + zoneH);
    ctx.moveTo(zoneX + cellW * 2, zoneY);
    ctx.lineTo(zoneX + cellW * 2, zoneY + zoneH);
    ctx.moveTo(zoneX, zoneY + cellH);
    ctx.lineTo(zoneX + zoneW, zoneY + cellH);
    ctx.moveTo(zoneX, zoneY + cellH * 2);
    ctx.lineTo(zoneX + zoneW, zoneY + cellH * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = 'bold 9px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('STRIKE ZONE', w / 2, zoneY - 6);

    // 4. Pitch Trajectories & Floating Markers
    const rawPitches = (s && (s.current_batter_pitches || s.pitches || (s.batter_sessions && s.batter_sessions[0] && s.batter_sessions[0].pitches))) || [];
    // Filter out non-pitch items (e.g. pitcher change events)
    const pitches = rawPitches.filter(p => p && !p.is_pitcher_change && p.type !== 'PITCHER_CHANGE' && (p.code || p.result));
    const moundX = w / 2;
    const moundY = 32;

    pitches.forEach((p, idx) => {
        const seq = p.seq || (idx + 1);
        let px = zoneX + zoneW / 2;
        let py = zoneY + zoneH / 2;

        if (p.pz_x !== undefined && p.pz_y !== undefined) {
            px = zoneX + zoneW / 2 + p.pz_x * (zoneW / 2);
            py = zoneY + zoneH / 2 + p.pz_y * (zoneH / 2);
        } else {
            const isStk = (p.code === 'STRIKE' || p.code === 'FOUL' || p.code === 'SINGLE' || p.code === 'DOUBLE' || p.code === 'HOMERUN' || p.code === 'OUT');
            const offsets = [
                { x: 0, y: -0.2 }, { x: -0.4, y: 0.3 }, { x: 0.4, y: -0.4 },
                { x: -0.3, y: -0.5 }, { x: 0.5, y: 0.4 }, { x: 0.1, y: 0.5 }
            ];
            const off = offsets[(seq - 1) % offsets.length];
            if (isStk) {
                px = zoneX + zoneW / 2 + off.x * (zoneW / 2 * 0.7);
                py = zoneY + zoneH / 2 + off.y * (zoneH / 2 * 0.7);
            } else {
                px = zoneX + zoneW / 2 + (off.x > 0 ? 1.3 : -1.3) * (zoneW / 2);
                py = zoneY + zoneH / 2 + (off.y > 0 ? 1.3 : -1.3) * (zoneH / 2);
            }
        }

        const isInsideZone = (px >= zoneX - 3 && px <= zoneX + zoneW + 3 && py >= zoneY - 3 && py <= zoneY + zoneH + 3);

        // Dynamic 3D Trajectory Line (Mound to Target Location)
        ctx.beginPath();
        ctx.moveTo(moundX, moundY);
        ctx.lineTo(px, py);
        ctx.strokeStyle = isInsideZone ? 'rgba(245, 158, 11, 0.65)' : 'rgba(59, 130, 246, 0.65)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Numbered Sequence Circle Marker
        const markerRadius = 11;
        const isLatest = (idx === pitches.length - 1);

        if (isLatest) {
            ctx.beginPath();
            ctx.arc(px, py, markerRadius + 5, 0, Math.PI * 2);
            ctx.fillStyle = isInsideZone ? 'rgba(245, 158, 11, 0.35)' : 'rgba(59, 130, 246, 0.35)';
            ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(px, py, markerRadius, 0, Math.PI * 2);
        ctx.fillStyle = isInsideZone ? '#f59e0b' : '#3b82f6';
        ctx.strokeStyle = isInsideZone ? '#ffffff' : '#93c5fd';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px Noto Sans KR, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(seq, px, py);

        // Speed & Pitch Type Tooltip for Latest Pitch
        const pLabel = p.speed_type || p.result;
        if (isLatest && pLabel) {
            const tooltipText = `${seq} ${pLabel}`;
            ctx.font = 'bold 10px Noto Sans KR, sans-serif';
            const tw = ctx.measureText(tooltipText).width + 12;
            const tx = Math.max(tw / 2 + 5, Math.min(w - tw / 2 - 5, px));
            const ty = py - 22;

            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.fillRect(tx - tw / 2, ty - 9, tw, 18);
            ctx.strokeRect(tx - tw / 2, ty - 9, tw, 18);

            ctx.fillStyle = '#34d399';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(tooltipText, tx, ty);
        }
    });
}
