/* ==========================================================================
   방구석 감독 - Client Application Script (Master User Flow & Auth / Friend Hub)
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
// 실제 구단 로고 이미지 (정식 출시 전 라이선스 필요). 없는 팀은 이모지로 대신 표시
const TEAM_LOGO_FILES = {
    '삼성': 'samsung', '한화': 'hanwha', 'KIA': 'kia', 'LG': 'lg', '두산': 'doosan',
    '롯데': 'lotte', 'SSG': 'ssg', 'KT': 'kt', 'NC': 'nc', '키움': 'kiwoom'
};
function teamLogoHtml(code) {
    const file = TEAM_LOGO_FILES[code];
    if (file) return `<img class="team-logo-img" src="/logos/v2/${file}.png?v=6" alt="${code}">`;
    return teamLogos[code] || '⚾';
}
// 내용이 바뀐 경우에만 다시 그림 (같은 로고를 지웠다 다시 넣으며 깜빡이지 않도록)
// 프로필 로고: 이미 같은 팀 로고가 있으면 그대로 둠 (서버가 처음 그린 이미지 포함)
function setLogoIfChanged(el, code) {
    const file = TEAM_LOGO_FILES[code];
    const img = el.querySelector('img.team-logo-img');
    if (file && img && img.getAttribute('src').includes(`/${file}.png`)) return;
    el.innerHTML = teamLogoHtml(code);
}
function setHtmlIfChanged(el, html) {
    if (!el || el._lastHtml === html) return;
    el._lastHtml = html;
    el.innerHTML = html;
}
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
    if (avatarEl && teamLogos[selectedTeamCode]) setLogoIfChanged(avatarEl, selectedTeamCode);

    const headerBar = document.getElementById('lobby-header-bar');
    if (headerBar && teamColorMap[selectedTeamCode]) {
        headerBar.style.borderLeft = `5px solid ${teamColorMap[selectedTeamCode]}`;
    }

    // 3. Settings Modal
    const setAvatar = document.getElementById('settings-disp-avatar');
    if (setAvatar && teamLogos[selectedTeamCode]) setLogoIfChanged(setAvatar, selectedTeamCode);

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
    try { renderHome(window.INITIAL_TODAY_SCHEDULE, window.INITIAL_TODAY_GAMES); } catch(e) { console.warn('renderHome error:', e); }
    // 홈 화면이 열려 있으면 1분마다 점수·경기 상태 새로고침
    setInterval(() => {
        const home = document.getElementById('pane-home');
        if (document.visibilityState === 'visible' && home && home.classList.contains('active')) loadLobbyData();
    }, 60000);
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

    // 주루 중계 문구 (진행률 25%마다 다음 베이스)
    const statusMsgs = [
        "타석에 들어서는 중...",
        "1루 진루! 경기 정보 확인 중",
        "2루 도루 성공! 응원 구단 소식 불러오는 중",
        "3루 안착! 감독석 준비 중",
        "홈 인! ⚾ 입장합니다"
    ];
    const runner = document.getElementById('splash-runner');
    const bases = document.querySelectorAll('.basepath-base');

    let progress = 0;
    let msgIdx = 0;

    // 45ms마다 1%씩 → 약 4.5초 동안 진행
    window._splashTimer = setInterval(() => {
        progress = Math.min(100, progress + 1);
        if (fill) fill.style.width = `${progress}%`;
        if (runner) runner.style.left = `${progress}%`;
        bases.forEach(b => b.classList.toggle('reached', progress >= Number(b.dataset.at)));

        const idx = Math.min(4, Math.floor(progress / 25));
        if (idx !== msgIdx) {
            msgIdx = idx;
            if (statusText) statusText.innerText = statusMsgs[idx];
        }

        if (progress >= 100) {
            dismissSplash();
        }
    }, 45);

    // Safety Timeout: 환영 화면은 최대 5초 (멈추지 않도록 보장)
    window._splashSafetyTimer = setTimeout(() => {
        dismissSplash();
    }, 5000);
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
    if (avatarEl && teamLogos[teamCode]) setLogoIfChanged(avatarEl, teamCode);
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

// ==========================================================================
// 홈 화면: 내 팀 경기 카드 + 오늘의 다른 경기 + 날씨 연출(우천·폭염·미세먼지 취소)
// ==========================================================================
const WX_ICON = {
    rain: '<svg viewBox="0 0 24 24"><path d="M7 14a4 4 0 0 1 .4-8 5 5 0 0 1 9.4 1.6A3.3 3.3 0 0 1 17 14z"/><path d="M8.5 17l-1 2.5M12.5 17l-1 2.5M16.5 17l-1 2.5"/></svg>',
    heat: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.2 5.2l1.8 1.8M17 17l1.8 1.8M5.2 18.8 7 17M17 7l1.8-1.8"/></svg>',
    dust: '<svg viewBox="0 0 24 24"><path d="M3 8c3-2 5 2 8 0s5-2 8 0M3 13c3-2 5 2 8 0s5-2 8 0M5 18c3-2 5 2 8 0s4-1.5 6 0"/></svg>',
    ground: '<svg viewBox="0 0 24 24"><path d="M12 3 2.5 20h19z"/><path d="M12 10v4.5M12 17.2v.3"/></svg>',
};
const WX_KEY = { '우천': 'rain', '폭염': 'heat', '미세먼지': 'dust', '그라운드': 'ground', '기타': 'ground' };

function gameState(m) {
    const status = m.status_text || '경기전';
    const hasScore = m.away_score != null && m.home_score != null;
    if (status === '경기중') {
        return { cls: 'live', chip: m.inning_text || 'LIVE', center: hasScore ? `${m.away_score} : ${m.home_score}` : 'VS', canEnter: true, label: '실시간 경기 입장' };
    }
    if (status === '경기종료') {
        return { cls: 'final', chip: '종료', center: hasScore ? `${m.away_score} : ${m.home_score}` : 'VS', canEnter: false, label: '경기 종료' };
    }
    if (status === '취소') {
        const reason = m.cancel_reason || '우천';
        const wx = WX_KEY[reason] || 'ground';
        return { cls: `cancel wx-${wx}`, wx, chip: `${reason}취소`, center: 'VS', canEnter: false, label: `${reason} 취소`, reason };
    }
    return { cls: 'ready', chip: m.start_time || '경기 전', center: 'VS', canEnter: true, label: '실시간 경기 입장' };
}

function teamCol(team, side, myTeam) {
    const code = normalizeTeamShort(team) || team || '-';
    return `<div class="hm-team ${code === myTeam ? 'is-mine' : ''}" style="--team-color:${teamColorMap[code] || '#334155'}">
        <span class="hm-logo">${teamLogoHtml(code)}</span>
        <span class="hm-name">${code}</span>
        <span class="hm-side">${side}</span>
    </div>`;
}

function weatherLayer(st) {
    if (!st.wx) return '';
    return `<div class="wx-layer" aria-hidden="true"><span class="wx-fx"></span><span class="wx-fx wx-fx2"></span></div>
        <div class="wx-label">${WX_ICON[st.wx]}<span>${st.reason} 취소</span></div>`;
}

// 투수 정보: 경기 중이면 지금 던지는 투수, 경기 전이면 양 팀 선발. 정보가 없으면 줄 자체를 숨김
function pitcherLine(m, st) {
    if (st.cls === 'live') {
        return m.current_pitcher ? `<div class="hm-pitcher"><span class="hm-pitcher-tag">투구 중</span><b>${m.current_pitcher}</b></div>` : '';
    }
    if (st.cls === 'ready' && (m.away_pitcher || m.home_pitcher)) {
        return `<div class="hm-pitcher"><span class="hm-pitcher-tag">선발</span><b>${m.away_pitcher || '미정'}</b><i>vs</i><b>${m.home_pitcher || '미정'}</b></div>`;
    }
    return '';
}

function renderHomeMatch(match, opts = {}) {
    const box = document.getElementById('home-featured');
    if (!box) return;
    const myTeam = normalizeTeamShort(selectedTeamCode);
    if (!match) {
        setHtmlIfChanged(box, `<div class="hm-card hm-empty">
            <img src="/brand/mascot-head.png?v=6" alt="" width="64" height="64">
            <div><strong>오늘은 쉬는 날</strong><span>예정된 ${teamFullMap[myTeam] || ''} 경기가 없어요</span></div>
        </div>`);
        return;
    }
    const st = gameState(match);
    const dateText = opts.isToday === false ? formatMatchDateLabel(match.game_date).replace('/', '.') : '오늘';
    setHtmlIfChanged(box, `<div class="hm-card st-${st.cls.split(' ')[0]} ${st.wx ? 'wx-' + st.wx : ''}">
        <span class="hm-field" aria-hidden="true"></span>
        <div class="hm-head">
            <span class="hm-meta">${dateText} ${match.start_time || ''} · ${match.stadium || '-'}</span>
            <span class="hm-chip" id="banner-live-tag">${st.cls === 'live' ? '<i class="live-dot"></i>' : ''}${st.chip}</span>
        </div>
        <div class="hm-teams">
            ${teamCol(match.away_team, '원정', myTeam)}
            <div class="hm-center">${st.center}</div>
            ${teamCol(match.home_team, '홈', myTeam)}
        </div>
        ${pitcherLine(match, st)}
        ${weatherLayer(st)}
        <button id="btn-enter-ingame" class="hm-enter" onclick="forceLiveMatchStart()" ${st.canEnter ? '' : 'disabled'}>${st.label}</button>
    </div>`);
}

// 경기 한 줄 (홈 '오늘의 다른 경기'와 리그 '경기 일정'에서 공통 사용)
function gameRowHtml(m, opts = {}) {
    const st = gameState(m);
    const a = normalizeTeamShort(m.away_team) || m.away_team;
    const h = normalizeTeamShort(m.home_team) || m.home_team;
    const showScore = st.cls === 'live' || st.cls === 'final';
    const aWin = st.cls === 'final' && m.away_score > m.home_score;
    const hWin = st.cls === 'final' && m.home_score > m.away_score;
    const where = m.stadium || '-';
    const when = st.cls === 'live' ? (m.inning_text || '경기 중') : st.cls === 'final' ? '경기 종료' : st.cls === 'ready' ? `${m.start_time || ''} 시작` : `${st.reason} 취소`;
    const extra = st.cls === 'live' && m.current_pitcher ? ` · 투구 중 ${m.current_pitcher}`
        : st.cls === 'ready' && (m.away_pitcher || m.home_pitcher) ? ` · 선발 ${m.away_pitcher || '미정'} vs ${m.home_pitcher || '미정'}` : '';
    const myTeam = normalizeTeamShort(selectedTeamCode);
    const mine = a === myTeam || h === myTeam;
    const enterable = opts.enterable && st.canEnter;
    const onclick = enterable ? ` onclick="enterMatchupFromSchedule('${m.home_team}', '${m.away_team}', '${m.home_pitcher || ''}', '${m.away_pitcher || ''}')" role="button"` : '';
    const compact = !!opts.compact;  // 홈: 한 줄 요약 (스크롤 없이 한 화면에)
    return `<div class="hm-row st-${st.cls.split(' ')[0]} ${st.wx ? 'wx-' + st.wx : ''} ${mine ? 'is-mine' : ''} ${enterable ? 'is-tappable' : ''} ${compact ? 'is-compact' : ''}"${onclick}>
        ${st.wx ? '<span class="wx-row-fx" aria-hidden="true"></span>' : ''}
        <div class="hm-row-main">
            <span class="hm-row-team"><span class="hm-row-logo">${teamLogoHtml(a)}</span><span class="hm-row-name">${a}</span></span>
            <span class="hm-row-score">${showScore ? `<b class="${aWin ? 'win' : ''}">${m.away_score}</b><i>:</i><b class="${hWin ? 'win' : ''}">${m.home_score}</b>` : '<i class="vs">VS</i>'}</span>
            <span class="hm-row-team right"><span class="hm-row-name">${h}</span><span class="hm-row-logo">${teamLogoHtml(h)}</span></span>
        </div>
        <div class="hm-row-meta">
            <span class="hm-row-chip">${st.wx ? WX_ICON[st.wx] : ''}${st.cls === 'live' ? '<i class="live-dot"></i>' : ''}${when}</span>
            <span class="hm-row-where">${where}${compact ? '' : extra}</span>
            ${enterable ? '<span class="hm-row-go">입장 ›</span>' : ''}
        </div>
    </div>`;
}

function renderOtherGames(list) {
    const box = document.getElementById('home-games-list');
    const title = document.getElementById('hm-others-title');
    if (!box) return;
    if (title) title.style.display = '';
    if (!list.length) {
        setHtmlIfChanged(box, '<div class="hm-row-empty">오늘은 다른 경기가 없어요</div>');
        return;
    }
    setHtmlIfChanged(box, list.map(m => gameRowHtml(m, { compact: true })).join(''));
}

function renderHome(scheduleInfo, todayGames) {
    scheduleInfo = scheduleInfo || {};
    if (todayGames) window.TODAY_GAMES = todayGames;
    todayGames = (window.TODAY_GAMES || []).filter(m => m.is_rest_day !== 1 && m.home_team !== m.away_team);
    const teamCode = normalizeTeamShort(selectedTeamCode);
    const games = (scheduleInfo.all_matches || []).filter(m => m.is_rest_day !== 1 && m.home_team !== m.away_team);
    const mine = scheduleInfo.match && games.find(m => m.id === scheduleInfo.match.id) ||
        games.find(m => normalizeTeamShort(m.home_team) === teamCode || normalizeTeamShort(m.away_team) === teamCode) ||
        scheduleInfo.match || null;

    const label = document.getElementById('hm-section-label');
    if (label) label.innerText = scheduleInfo.is_today === false && scheduleInfo.game_date
        ? `${formatMatchDateLabel(scheduleInfo.game_date).replace('/', '.')} 경기` : '오늘의 경기';

    if (mine) {
        const st = gameState(mine);
        currentMatchIsLive = st.canEnter;
        currentHomeTeam = mine.home_team;
        currentAwayTeam = mine.away_team;
        currentHomePitcher = mine.home_pitcher || teamPitcherMap[mine.home_team] || '페덱';
        currentAwayPitcher = mine.away_pitcher || teamPitcherMap[mine.away_team] || '박준영';
        currentStadium = mine.stadium;
        currentStartTimeStr = mine.start_time;
    } else {
        currentMatchIsLive = false;
    }
    renderHomeMatch(mine, { isToday: scheduleInfo.is_today !== false });
    renderOtherGames(todayGames.filter(m => !mine || m.id !== mine.id));
}

function updateLobbyBannerForUserTeam(allMatches, scheduleInfo = {}, todayGames) {
    renderHome(Object.assign({}, scheduleInfo, { all_matches: allMatches }), todayGames);
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

    matchCountdownInterval = setInterval(() => {
        matchCountdownTime--;
        if (matchCountdownTime <= 0) {
            clearInterval(matchCountdownInterval);
            triggerLiveMatchReady();
        }
    }, 1000);
}

// 대기 시간이 지나면 '오늘의 경기' 칩을 LIVE로
function triggerLiveMatchReady() {
    if (!currentMatchIsLive) return;
    isMatchLive = true;
    const card = document.querySelector('#home-featured .hm-card.st-ready');
    const tagEl = document.getElementById('banner-live-tag');
    if (!card || !tagEl) return;
    card.classList.replace('st-ready', 'st-live');
    tagEl.innerHTML = '<i class="live-dot"></i>LIVE';
    showToast('경기가 시작됐어요. 입장해 보세요!');
}

function tryEnterIngame() {
    forceLiveMatchStart();
}

function forceLiveMatchStart() {
    clearInterval(matchCountdownInterval);
    isMatchLive = true;
    const modal = document.getElementById('crisis-modal');
    if (modal) modal.classList.remove('active');

    // 요청 한 번으로 입장: 같은 경기가 진행 중이면 이어 보고, 아니면 새로 시작 (서버가 판단)
    fetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            home_team: currentHomeTeam,
            away_team: currentAwayTeam,
            home_pitcher: currentHomePitcher,
            away_pitcher: currentAwayPitcher,
            resume: true
        })
    })
    .then(r => r.json())
    .then(data => {
        if (data && data.state) {
            currentGameState = data.state;
            saveGameStateToStorage(data.state);
        }
        switchView('ingame-view', data && data.state);
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

    // 경기 화면은 화면 전체를 경기에 쓰도록 하단 탭을 숨김 (위쪽 ‹ 버튼으로 로비 복귀)
    const ingame = document.getElementById('ingame-view');
    const isIngameActive = ingame && ingame.classList.contains('active');

    if (isLoggedIn && !isLoginActive && !isTeamSelectActive && !isIngameActive) {
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

function switchView(viewId, preloadedState) {
    document.querySelectorAll('.view-screen').forEach(screen => {
        screen.classList.remove('active');
    });
    const target = document.getElementById(viewId);
    if (target) {
        target.classList.add('active');
    }

    if (viewId === 'ingame-view') {
        // 방금 받은 상태가 있으면 바로 그림 (서버에 한 번 더 묻지 않음)
        (preloadedState ? Promise.resolve(preloadedState) : fetch('/api/state').then(r => r.json()))
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
        // 실시간 연결(SSE)은 서버를 붙잡아 다른 요청을 막으므로 쓰지 않음. 15초마다 진행 요청으로 갱신
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
    // 탭을 바꾸면 항상 맨 위부터 보이도록 (이전 탭의 스크롤 위치가 남지 않게)
    const pregameView = document.getElementById('pregame-view');
    if (pregameView) pregameView.scrollTop = 0;
    if (tabName === 'schedule') requestAnimationFrame(() => centerActiveDate(false));

    document.querySelectorAll('.bottom-nav-item').forEach(btn => {
        btn.classList.remove('active');
    });

    if (btnEl && btnEl.classList.contains('bottom-nav-item')) {
        btnEl.classList.add('active');
    } else {
        // 팀 순위(records)는 리그 탭 안에 있으므로 리그 버튼을 켬
        const navKey = tabName === 'records' ? 'schedule' : tabName;
        const defaultBtn = document.querySelector(`.bottom-nav-item[onclick*="'${navKey}'"]`);
        if (defaultBtn) defaultBtn.classList.add('active');
    }

    // Sync sub-nav-item buttons in top menu bar
    document.querySelectorAll('.sub-nav-item').forEach(subBtn => {
        subBtn.classList.remove('active');
        const onclickAttr = subBtn.getAttribute('onclick') || '';
        if ((tabName === 'schedule' && onclickAttr.includes('schedule')) ||
            (tabName === 'records' && onclickAttr.includes('records'))) {
            subBtn.classList.add('active');
        }
    });

    if (tabName === 'schedule') {
        loadScheduleTable(currentScheduleFilter || 'today');
    } else if (tabName === 'records') {
        renderKboStandingsTable();
        refreshStandingsInBackground();
    } else if (tabName === 'my_records') {
        renderMyRecordsPane();
    }

    try { updateBottomNavVisibility(); } catch(e) {}
}

// 팀 순위는 서버(/api/standings)가 관리자 입력 경기 결과로 계산한 값을 사용
// 페이지를 열 때 서버가 넣어 준 순위로 바로 표시하고, 탭을 열 때마다 조용히 최신 순위로 갱신
let kboTeamStandingsData = window.INITIAL_STANDINGS || [];

function refreshStandingsInBackground() {
    fetch('/api/standings')
        .then(r => r.json())
        .then(data => {
            const latest = data.standings || [];
            if (JSON.stringify(latest) !== JSON.stringify(kboTeamStandingsData)) {
                kboTeamStandingsData = latest;
                renderKboStandingsTable();
            }
        })
        .catch(err => console.error('standings error:', err));
}

const STANDINGS_DATA_YEAR = 2026;  // 순위 데이터가 있는 시즌
let standingsYear = STANDINGS_DATA_YEAR;

function shiftStandingsYear(delta) {
    const next = standingsYear + delta;
    if (next > STANDINGS_DATA_YEAR) return;  // 아직 열리지 않은 시즌
    standingsYear = next;
    renderKboStandingsTable();
}

function renderKboStandingsTable() {
    const list = document.getElementById('kbo-standings-tbody');
    if (!list) return;

    const titleEl = document.getElementById('standings-year-title');
    if (titleEl) titleEl.innerText = standingsYear;
    const nextBtn = document.getElementById('st-year-next');
    if (nextBtn) nextBtn.disabled = standingsYear >= STANDINGS_DATA_YEAR;

    if (standingsYear !== STANDINGS_DATA_YEAR) {
        list.innerHTML = `<div class="st-empty">${standingsYear} 시즌 순위 기록은 준비 중이에요.</div>`;
        return;
    }
    if (kboTeamStandingsData.length === 0) {
        list.innerHTML = `<div class="st-empty">순위 정보가 아직 없어요.</div>`;
        return;
    }

    const myTeam = normalizeTeamShort(selectedTeamCode);
    list.innerHTML = kboTeamStandingsData.map(row => {
        const isMine = row.team === myTeam;
        const color = teamColorMap[row.team] || '#64748b';
        const streakClass = row.streak.includes('승') ? 'win' : (row.streak.includes('패') ? 'lose' : '');
        return `
            <div class="st-row ${row.psType ? 'ps-' + row.psType : ''} ${isMine ? 'is-mine' : ''}" style="--team-color: ${color};">
                <span class="st-rank">${row.rank}</span>
                <span class="st-team">
                    <span class="st-logo">${teamLogoHtml(row.team)}</span>
                    <span class="st-team-text">
                        <strong>${row.team}${isMine ? '<em class="st-my">MY</em>' : ''}</strong>
                        <small>${row.wins}승 ${row.draws}무 ${row.losses}패</small>
                    </span>
                </span>
                <span class="st-num st-winrate">${row.winRate.replace(/^0/, '')}</span>
                <span class="st-num">${row.gb === '0.0' ? '-' : row.gb}</span>
                <span class="st-num"><span class="st-streak ${streakClass}">${row.streak}</span></span>
            </div>
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
        renderHomeMatch({ away_team: away, home_team: home, stadium: currentStadium, start_time: currentStartTimeStr });
    });
}

function loadLobbyData() {
    const uid = window.CURRENT_SESSION_USER_ID || currentUserId || 1;
    fetch(`/api/lobby?user_id=${uid}`)
        .then(res => res.json())
        .then(data => {
            const scoreEl = document.getElementById('lobby-my-score');
            if (scoreEl) scoreEl.innerText = `${data.user_score.toLocaleString()}P`;
            
            const gradeBadge = document.getElementById('lobby-my-grade');
            if (gradeBadge) {
                gradeBadge.innerText = `${data.user_grade}급`;
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
                updateLobbyBannerForUserTeam(data.today_schedule.all_matches || [], data.today_schedule, data.today_games);
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
    "한화": "이상규", "삼성": "최원태", "KIA": "올러", "KT": "고영표", "LG": "임찬규", "SSG": "이로운", "키움": "전준표", "롯데": "비슬리", "NC": "토다", "두산": "잭로그"
};

const teamBatterMap = {
    "한화": "심우준", "삼성": "김지찬", "KIA": "박재현", "KT": "최원준", "LG": "박해민", "SSG": "정준재", "키움": "추재현", "롯데": "황성빈", "NC": "김주원", "두산": "정수빈"
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

const SC_DOWS = ['일', '월', '화', '수', '목', '금', '토'];

function scDateParts(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return { y, m, d, dow: SC_DOWS[new Date(y, m - 1, d).getDay()] };
}

function renderHorizontalDatePicker() {
    const box = document.getElementById('sched-date-scroll');
    if (!box) return;
    const todayStr = getFormattedTodayStr();
    const gameCount = {};
    (cachedSchedules || []).forEach(s => {
        if (s.is_rest_day !== 1) gameCount[s.game_date] = (gameCount[s.game_date] || 0) + 1;
    });
    // 고른 날짜가 속한 달의 1일~말일을 빠짐없이 표시 (경기 없는 날 포함)
    const sel = scDateParts(selectedScheduleDate || todayStr);
    const lastDay = new Date(sel.y, sel.m, 0).getDate();
    const dates = [];
    for (let d = 1; d <= lastDay; d++) {
        dates.push(`${sel.y}-${String(sel.m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    const monthTitle = document.getElementById('sched-month-title');
    if (monthTitle) monthTitle.innerText = `${sel.y}년 ${sel.m}월`;

    box.innerHTML = dates.map(date => {
        const p = scDateParts(date);
        const cls = [
            'sc-date',
            date === selectedScheduleDate ? 'active' : '',
            date === todayStr ? 'is-today' : '',
            gameCount[date] ? 'has-games' : 'no-games',
            p.dow === '토' ? 'sat' : p.dow === '일' ? 'sun' : '',
        ].join(' ');
        return `<button class="${cls}" onclick="selectScheduleDate('${date}')">
            <span class="sc-dow">${date === todayStr ? '오늘' : p.dow}</span>
            <span class="sc-day">${p.d}</span>
            ${gameCount[date] ? '<i class="sc-dot"></i>' : '<span class="sc-none">경기 없음</span>'}
        </button>`;
    }).join('');

    setTimeout(() => centerActiveDate(true), 50);
}

// 선택한 날짜 카드를 날짜 줄 가운데로 (탭이 숨겨져 있으면 탭을 열 때 다시 호출)
function centerActiveDate(smooth) {
    const box = document.getElementById('sched-date-scroll');
    const active = box && box.querySelector('.sc-date.active');
    if (!active || !box.clientWidth) return;
    box.scrollTo({ left: active.offsetLeft - (box.clientWidth - active.offsetWidth) / 2, behavior: smooth ? 'smooth' : 'auto' });
}

function selectScheduleDate(dateStr) {
    selectedScheduleDate = dateStr;
    renderHorizontalDatePicker();
    renderMatchupsForDate(dateStr);
}

function scrollDateBar(direction) {
    const box = document.getElementById('sched-date-scroll');
    if (box) box.scrollBy({ left: direction * 150, behavior: 'smooth' });
}

// 이전/다음 달: 그 달의 1일로 이동
function shiftSchedMonth(delta) {
    const cur = scDateParts(selectedScheduleDate || getFormattedTodayStr());
    const target = new Date(cur.y, cur.m - 1 + delta, 1);
    selectScheduleDate(`${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-01`);
}

function renderMatchupsForDate(dateStr) {
    const list = document.getElementById('sched-matchup-list');
    const title = document.getElementById('sched-day-title');
    if (!list) return;
    const games = (cachedSchedules || []).filter(s => s.game_date === dateStr && s.is_rest_day !== 1 && s.home_team !== s.away_team);
    const p = scDateParts(dateStr);
    if (title) title.innerHTML = `${p.m}월 ${p.d}일 (${p.dow})${games.length ? ` <span class="sc-count">${games.length}경기</span>` : ''}`;

    if (!games.length) {
        list.innerHTML = '<div class="hm-row-empty">이 날은 경기가 없어요</div>';
        return;
    }
    // 내 팀 경기를 맨 위로
    const myTeam = normalizeTeamShort(selectedTeamCode);
    games.sort((a, b) => {
        const am = normalizeTeamShort(a.home_team) === myTeam || normalizeTeamShort(a.away_team) === myTeam;
        const bm = normalizeTeamShort(b.home_team) === myTeam || normalizeTeamShort(b.away_team) === myTeam;
        return (bm - am) || String(a.start_time).localeCompare(String(b.start_time));
    });
    const isToday = dateStr === getFormattedTodayStr();
    list.innerHTML = games.map(m => gameRowHtml(m, { enterable: isToday })).join('');
}

function enterMatchupFromSchedule(homeTeam, awayTeam, homePitcher, awayPitcher) {
    if (homeTeam === awayTeam) {
        awayTeam = homeTeam === '삼성' ? '한화' : '삼성';
    }
    currentHomeTeam = homeTeam;
    currentAwayTeam = awayTeam;
    currentHomePitcher = homePitcher || teamPitcherMap[homeTeam] || '페덱';
    currentAwayPitcher = awayPitcher || teamPitcherMap[awayTeam] || '박준영';
    forceLiveMatchStart();
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
    renderHomeMatch({ away_team: away, home_team: home, stadium, start_time: timeStr, game_date: dateStr }, { isToday: dateStr === getFormattedTodayStr() });
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
        renderIngame(s);
    } catch (err) {
        console.error("Scoreboard UI Error:", err);
    }

    try {
        renderNaverSportsLiveFeed(s);
    } catch (err) {
        console.error("Render Feed Error:", err);
    }

    // 작전 결과를 먼저 보여주고, 새 위기는 결과 팝업을 닫은 뒤에 띄움
    if (s && s.tactic_resolution && window._lastHandledCaseId !== (s.tactic_resolution.case_no + '_' + s.totalPitcherCount)) {
        window._lastHandledCaseId = s.tactic_resolution.case_no + '_' + s.totalPitcherCount;
        openTacticResultModal(s.tactic_resolution);
    }

    if (s && s.crisis_active && s.current_crisis) {
        openCrisisModal(s.current_crisis);
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
    if (!modal || !crisis) return;
    if (modal.classList.contains('active')) return;
    // 작전 결과 팝업을 보는 중이면, 닫은 뒤에 띄움 (뒤에서 타이머가 흘러가지 않게)
    const resultModal = document.getElementById('tactic-result-modal');
    if (resultModal && resultModal.classList.contains('active')) {
        window._pendingCrisis = crisis;
        return;
    }

    const pName = crisis.pitcher_name || (currentGameState ? currentGameState.pitcher : '투수');
    const pCount = crisis.pitch_count !== undefined ? crisis.pitch_count : (currentGameState ? currentGameState.totalPitcherCount : 0);
    const inning = (currentGameState && currentGameState.inning_str) || '';
    const reason = crisis.condition_type === 'CONDITION_A' ? '4타자 연속 출루' : '득점권 주자 · 실점 위기';

    const descEl = document.getElementById('crisis-desc');
    if (descEl) descEl.textContent = [inning, reason].filter(Boolean).join(' · ');
    const nameEl = document.getElementById('crisis-pitcher-name');
    if (nameEl) nameEl.textContent = pName;
    const countEl = document.getElementById('crisis-pitch-count');
    if (countEl) countEl.textContent = `${pCount}구`;

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
            showToast('작전 제출! 이번 타석 결과가 나오면 채점돼요');
        }
    });
}

function openTacticResultModal(res) {
    const modal = document.getElementById('tactic-result-modal');
    if (!modal || !res) return;
    const strip = t => String(t || '').replace(/\s*\([OX]\)\s*/g, '').trim();

    const badge = document.getElementById('res-grade-badge');
    if (badge) {
        badge.textContent = res.grade || 'B';
        badge.className = `result-badge grade-${(res.grade || 'b').toLowerCase()}`;
    }
    const delta = res.score_delta || 0;
    const deltaEl = document.getElementById('res-score-delta');
    if (deltaEl) {
        deltaEl.textContent = delta > 0 ? `+${delta}` : `${delta}`;
        deltaEl.className = delta > 0 ? 'delta-plus' : delta < 0 ? 'delta-minus' : 'delta-zero';
    }
    const mine = strip(res.my_choice_label) || ((res.my_choice === 'CHANGE' || res.tactic_id === 'PITCHER_CHANGE') ? '교체' : '유지');
    const mgr = strip(res.mgr_choice_label) || (res.actual_manager_choice === 'CHANGE' ? '교체' : '유지');
    const out = res.actual_result === 'OUT' || /^아웃/.test(res.actual_result_label || '');
    const set = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
    set('res-my-choice', mine);
    set('res-actual-choice', mgr);
    set('res-atbat-result', out ? '아웃' : '출루');
    set('res-commentary', delta > 0 ? '좋은 판단이었어요!' : delta < 0 ? '아쉬운 판단이었어요' : '무난한 판단이었어요');
    const comm = document.getElementById('res-commentary');
    if (comm) comm.className = `igm-comment ${delta > 0 ? 'good' : delta < 0 ? 'bad' : ''}`;

    modal.classList.add('active');
    playWebAudioAlert('tactic_result');
}

function closeTacticResultModal() {
    const modal = document.getElementById('tactic-result-modal');
    if (modal) {
        modal.classList.remove('active');
    }
    const pending = window._pendingCrisis;
    window._pendingCrisis = null;
    if (pending && currentGameState && currentGameState.crisis_active) {
        openCrisisModal(currentGameState.current_crisis || pending);
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
    // 응답이 올 때까지 버튼을 눌린 상태로 (연타로 요청이 쌓이지 않게)
    const pitchBtn = document.getElementById('btn-pitch-step');
    if (pitchBtn && pitchBtn.classList.contains('busy')) return;
    if (pitchBtn) pitchBtn.classList.add('busy');
    const done = () => { if (pitchBtn) pitchBtn.classList.remove('busy'); };
    fetch('/api/step', { method: 'POST' })
        .then(r => r.json())
        .then(state => {
            done();
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
            done();
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
    document.getElementById('post-grade-title').innerText = titles[s.manager_grade] || "방구석 감독 리포트";
}

function resetMatchAndLobby() {
    clientPitchSeq = 0;
    const streamContainer = document.getElementById('text-stream') || document.getElementById('naver-live-feed');
    if (streamContainer) {
        streamContainer.innerHTML = '';
    }
    // 지금 보던 경기의 두 팀 그대로 초기화 (기본값 삼성·한화로 바뀌지 않도록)
    fetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ home_team: currentHomeTeam, away_team: currentAwayTeam, home_pitcher: currentHomePitcher, away_pitcher: currentAwayPitcher })
    }).then(() => switchView('pregame-view'));
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

// ==========================================================================
// 인게임 화면: 점수판 · 카운트 · 투수 vs 타자 · 그라운드 · 이번 타석 투구 · 중계 기록 시트
// ==========================================================================
function igSetText(id, text) {
    const el = document.getElementById(id);
    if (el && el.textContent !== String(text)) el.textContent = text;
}

function igDots(id, count) {
    const box = document.getElementById(id);
    if (!box) return;
    box.querySelectorAll('i').forEach((dot, i) => dot.classList.toggle('on', i < count));
}

function igAvg(v) {
    const n = parseFloat(v);
    if (isNaN(n)) return '';
    return n.toFixed(3).replace(/^0/, '');
}

// 투구 결과를 색·짧은 이름으로
function igPitchKind(p) {
    const code = (p && p.code) || '';
    const res = (p && p.result) || '';
    if (code === 'BALL') return { cls: 'b', label: '볼' };
    if (code === 'STRIKE') return { cls: 's', label: '스트라이크' };
    if (code === 'FOUL') return { cls: 'f', label: '파울' };
    if (code === 'OUT') return { cls: 'out', label: res.replace('타격 ', '') || '아웃' };
    if (['SINGLE', 'DOUBLE', 'TRIPLE', 'HOMERUN'].includes(code)) {
        return { cls: 'hit', label: (res.match(/\(([^)]+)\)/) || [])[1] || '안타' };
    }
    return { cls: 'etc', label: res || '투구' };
}

// 한 타석의 투구들을 순서대로 판정: 파울은 2스트라이크 전까지는 스트라이크(노랑), 그 뒤로는 파울(회색)
function igSeqKinds(pitches) {
    let strikes = 0;
    return (pitches || []).map(p => {
        const k = igPitchKind(p);
        if (k.cls === 's') strikes++;
        else if (k.cls === 'f' && strikes < 2) { strikes++; return { cls: 's', label: '파울' }; }
        return k;
    });
}

function igCurrentSession(s) {
    return (s.batter_sessions && s.batter_sessions.length) ? s.batter_sessions[0] : null;
}

function renderIngame(s) {
    if (!s) return;
    const away = normalizeTeamShort(s.away_team) || s.away_team || '원정';
    const home = normalizeTeamShort(s.home_team) || s.home_team || '홈';
    igSetText('ig-away-name', away);
    igSetText('ig-home-name', home);
    setHtmlIfChanged(document.getElementById('ig-away-logo'), teamLogoHtml(away));
    setHtmlIfChanged(document.getElementById('ig-home-logo'), teamLogoHtml(home));
    igSetText('ig-away-score', s.score_away ?? 0);
    igSetText('ig-home-score', s.score_home ?? 0);

    const pts = (s.manager_score !== undefined && s.manager_score !== null) ? s.manager_score : 2000;
    igSetText('live-score-val', `${Number(pts).toLocaleString()}P`);

    igSetText('ig-inning', s.inning_str || '1회초');
    igDots('ig-b', s.balls ?? 0);
    igDots('ig-s', s.strikes ?? 0);
    igDots('ig-o', s.outs ?? 0);
    [['ig-mb-1', s.runner_1b], ['ig-mb-2', s.runner_2b], ['ig-mb-3', s.runner_3b]].forEach(([id, on]) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('on', !!on);
    });

    igSetText('ig-pitcher', s.pitcher || '-');
    const pc = s.totalPitcherCount ?? s.pitch_count ?? 0;
    igSetText('ig-pitch-count', `투구 ${pc}구`);

    igSetText('ig-batter', s.batter || '-');
    const sess = igCurrentSession(s);
    const order = sess && sess.batter_order ? sess.batter_order.replace('타자', '') : '';
    const avg = igAvg(sess ? (sess.batter_avg || (sess.batter_stats && sess.batter_stats.avg)) : '');
    igSetText('ig-batter-sub', [order, avg && `타율 ${avg}`].filter(Boolean).join(' · ') || '-');

    const btn = document.getElementById('btn-pitch-step');
    if (btn) btn.disabled = !!s.game_over;
}

// 그라운드 (위에서 내려다본 구장)
const IG_FIELD_POS = {
    P: [200, 206], C: [200, 292], '1B': [280, 178], '2B': [242, 146], SS: [158, 146],
    '3B': [120, 178], LF: [94, 100], CF: [200, 64], RF: [306, 100]
};
const IG_BASES = { home: [200, 268], b1: [262, 206], b2: [200, 144], b3: [138, 206] };

function renderIngameField(s) {
    const box = document.getElementById('ig-field');
    if (!box || !s) return;
    const defTeam = normalizeTeamShort(s.is_top !== false ? s.home_team : s.away_team);
    const offTeam = normalizeTeamShort(s.is_top !== false ? s.away_team : s.home_team);
    const defColor = teamColorMap[defTeam] || '#334155';
    const offColor = teamColorMap[offTeam] || '#f59e0b';

    const fielders = (s.fielders || []).filter(f => IG_FIELD_POS[f.role]);
    const fHtml = fielders.map(f => {
        const [x, y] = IG_FIELD_POS[f.role];
        const label = f.role === 'P' ? '' : `<text x="${x}" y="${y + 21}" class="ig-fname">${f.name}</text>`;
        return `<g class="ig-f"><circle cx="${x}" cy="${y}" r="8.5" fill="${defColor}"/>${label}</g>`;
    }).join('');

    const runners = [['b1', s.runner_1b], ['b2', s.runner_2b], ['b3', s.runner_3b]].filter(r => r[1]);
    const rHtml = runners.map(([b]) => {
        const [x, y] = IG_BASES[b];
        return `<g class="ig-run"><circle cx="${x}" cy="${y}" r="8" fill="${offColor}"/><circle cx="${x}" cy="${y}" r="11" class="ig-run-ring"/></g>`;
    }).join('');

    const base = (k, on) => {
        const [x, y] = IG_BASES[k];
        return `<rect x="${x - 6}" y="${y - 6}" width="12" height="12" transform="rotate(45 ${x} ${y})" class="ig-base ${on ? 'on' : ''}"/>`;
    };
    const [hx, hy] = IG_BASES.home;

    setHtmlIfChanged(box, `<svg viewBox="14 8 372 312" preserveAspectRatio="xMidYMax meet" class="ig-svg" role="img" aria-label="그라운드 수비 배치">
        <defs>
            <pattern id="igMow" width="34" height="34" patternUnits="userSpaceOnUse" patternTransform="rotate(45 200 268)">
                <rect width="17" height="34" fill="#1f6b37"/><rect x="17" width="17" height="34" fill="#1b5f31"/>
            </pattern>
        </defs>
        <path d="M200 268 L22 90 A252 252 0 0 1 378 90 Z" fill="url(#igMow)"/>
        <path d="M22 90 A252 252 0 0 1 378 90" class="ig-track"/>
        <path d="M200 294 L110 204 Q200 52 290 204 Z" class="ig-dirt"/>
        <polygon points="200,252 246,206 200,160 154,206" fill="#1f6b37"/>
        <circle cx="200" cy="206" r="12" class="ig-dirt"/>
        <circle cx="${hx}" cy="${hy}" r="20" class="ig-dirt"/>
        <path d="M200 268 L22 90 M200 268 L378 90" class="ig-line"/>
        <path d="M${hx} ${hy} L262 206 L200 144 L138 206 Z" class="ig-path"/>
        ${base('b1', s.runner_1b)}${base('b2', s.runner_2b)}${base('b3', s.runner_3b)}
        <path d="M${hx - 6} ${hy - 4} h12 v5 l-6 6 l-6 -6 z" class="ig-home"/>
        ${fHtml}
        ${rHtml}
    </svg>`);
}

// 이번 타석 투구 (없으면 직전 타석 결과)
function renderIngameLast(s) {
    const box = document.getElementById('ig-last');
    if (!box || !s) return;
    const pitches = s.current_batter_pitches || [];
    if (!pitches.length) {
        const prev = (s.batter_sessions || []).find(b => b.play_summary);
        const text = prev ? prev.play_summary.replace(/\s*:\s*/, ' ') : '첫 투구를 기다리고 있어요';
        setHtmlIfChanged(box, `<div class="ig-last-line"><span class="ig-chip etc">${prev ? '직전 타석' : '대기'}</span><span class="ig-last-text">${text}</span></div>`);
        return;
    }
    const last = pitches[pitches.length - 1];
    const kinds = igSeqKinds(pitches);
    const k = kinds[kinds.length - 1];
    const dots = pitches.map((p, i) => `<span class="ig-pdot ${kinds[i].cls}">${p.seq}</span>`).join('');
    setHtmlIfChanged(box, `<div class="ig-last-line"><span class="ig-chip ${k.cls}">${k.label}</span><span class="ig-last-text">${last.seq}구 · ${last.speed_type || ''}</span></div>
        <div class="ig-pdots">${dots}</div>`);
}

// 중계 기록 시트
let igLogTab = 'all';

function openIngameLog() {
    const sheet = document.getElementById('ig-log-sheet');
    const bg = document.getElementById('ig-log-bg');
    if (!sheet) return;
    renderIngameLog(currentGameState);
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    if (bg) bg.classList.add('open');
}

function closeIngameLog() {
    const sheet = document.getElementById('ig-log-sheet');
    const bg = document.getElementById('ig-log-bg');
    if (sheet) { sheet.classList.remove('open'); sheet.setAttribute('aria-hidden', 'true'); }
    if (bg) bg.classList.remove('open');
}

function selectInningTab(tabKey) {
    igLogTab = String(tabKey);
    renderIngameLog(currentGameState);
}

function renderIngameLog(s) {
    const list = document.getElementById('ig-log-list');
    const tabs = document.getElementById('ig-log-tabs');
    if (!list || !s) return;
    const sessions = s.batter_sessions || [];
    const innings = Array.from(new Set(sessions.map(b => b.inning))).filter(Boolean).sort((a, b) => a - b);
    if (tabs) {
        const keys = ['all', ...innings.map(String)];
        if (!keys.includes(igLogTab)) igLogTab = 'all';
        setHtmlIfChanged(tabs, keys.map(k => `<button class="ig-tab ${k === igLogTab ? 'active' : ''}" onclick="selectInningTab('${k}')">${k === 'all' ? '전체' : k + '회'}</button>`).join(''));
    }
    const shown = sessions.filter(b => igLogTab === 'all' || String(b.inning) === igLogTab);
    if (!shown.length) {
        setHtmlIfChanged(list, '<div class="ig-log-empty">아직 기록이 없어요</div>');
        return;
    }
    setHtmlIfChanged(list, shown.map((b, i) => {
        const pitches = b.pitches || [];
        const live = i === 0 && igLogTab === 'all' && !b.play_summary;
        const result = b.play_summary ? b.play_summary.split(':').slice(1).join(':').trim() : (live ? '타석 진행 중' : '');
        const kinds = igSeqKinds(pitches);
        const lastKind = kinds.length ? kinds[kinds.length - 1].cls : 'etc';
        return `<div class="ig-log-item ${live ? 'live' : ''}">
            <div class="ig-log-top">
                <span class="ig-log-inn">${b.inning_str || ''}</span>
                <strong class="ig-log-name">${b.batter_name || ''}</strong>
                <span class="ig-log-res ${b.play_summary ? lastKind : ''}">${result}</span>
            </div>
            <div class="ig-pdots small">${pitches.map((p, i) => `<span class="ig-pdot ${kinds[i].cls}">${p.seq}</span>`).join('')}</div>
        </div>`;
    }).join(''));
}

// 예전 이름으로 부르는 곳이 있어 그대로 연결
function renderNaverSportsLiveFeed(s) {
    const sheet = document.getElementById('ig-log-sheet');
    if (sheet && sheet.classList.contains('open')) renderIngameLog(s);
}
function appendPitchTextLog(s) { renderNaverSportsLiveFeed(s); }
function setupSmartAutoScroll() {}
function initCanvas() {}
function toggleGraphicView() {}

function drawBaseballField(s) {
    if (!s) s = currentGameState;
    if (!s) return;
    renderIngameField(s);
    renderIngameLast(s);
}
