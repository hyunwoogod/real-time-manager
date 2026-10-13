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
let userNickname = '김명장 감독';

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
    fetch('/api/state').then(r => r.json()).then(st => { if (st && st.home_team) currentGameState = st; }).catch(() => {});
    try { loadUserState(); } catch(e) { console.warn('loadUserState error:', e); }
    try { initCanvas(); } catch(e) { console.warn('initCanvas error:', e); }
    try { switchView('pregame-view'); } catch(e) { console.warn('switchView error:', e); }
    try { updateBottomNavVisibility(); } catch(e) {}
    try { runSplashScreen(); } catch(e) { dismissSplash(); }
    try { startLiveClock(); } catch(e) {}
    try { setupSmartAutoScroll(); } catch(e) {}
    try { syncTodayTabLabel(currentSystemDate); } catch(e) {}
    // 진행 중이던 경기: 입장 버튼을 누르기 전까지는 멈춰 둠 (나갔던 그 상황에서 이어서 시작)
    window._holdUntilEnter = !!(window.INITIAL_TODAY_SCHEDULE && window.INITIAL_TODAY_SCHEDULE.in_progress);
    try { renderHome(window.INITIAL_TODAY_SCHEDULE, window.INITIAL_TODAY_GAMES); } catch(e) { console.warn('renderHome error:', e); }
    // 테스트 시즌: 지난번에 경기를 시작하고 나갔다면 다음 날로 넘어왔다고 안내
    if (window.INITIAL_TODAY_SCHEDULE && window.INITIAL_TODAY_SCHEDULE.day_advanced) {
        setTimeout(() => showToast(`지난 경기는 종료 처리됐어요 · 테스트 ${window.INITIAL_TODAY_SCHEDULE.test_day}일차 시작`), 6000);
    }
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
    // 경기 도중 새로고침하거나 나갔다 왔으면: 바로 들어가지 않고, '실시간 경기 입장'을 누르면 그 시점부터 이어서
    const sch = window.INITIAL_TODAY_SCHEDULE;
    if (sch && sch.in_progress && !window._resumedOnce) {
        window._resumedOnce = true;
        setTimeout(() => showToast('진행 중인 경기가 있어요 · 입장하면 이어서 해요'), 700);
    }
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
    const settingsModal = document.getElementById('settings-modal');
    if (event.target === settingsModal) {
        closeSettingsModal();
    }
});









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
        return { cls: 'live', chip: m.inning_text || 'LIVE', center: hasScore ? `${m.away_score} : ${m.home_score}` : 'VS', canEnter: true, label: window._holdUntilEnter ? '실시간 경기 입장 · 이어서' : '실시간 경기 입장' };
    }
    if (status === '경기종료') {
        return { cls: 'final', chip: '종료', center: hasScore ? `${m.away_score} : ${m.home_score}` : 'VS', canEnter: false, label: '경기 종료' };
    }
    if (status === '취소') {
        const reason = m.cancel_reason || '우천';
        const wx = WX_KEY[reason] || 'ground';
        return { cls: `cancel wx-${wx}`, wx, chip: `${reason}취소`, center: 'VS', canEnter: false, label: `${reason} 취소`, reason };
    }
    return { cls: 'ready', chip: m.start_time || '경기 전', center: 'VS', canEnter: true, label: window._holdUntilEnter ? '실시간 경기 입장 · 이어서' : '실시간 경기 입장' };
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

    window._testDay = scheduleInfo.test_day || null;
    if (scheduleInfo.test_day && scheduleInfo.game_date) window._testDate = scheduleInfo.game_date;
    const label = document.getElementById('hm-section-label');
    if (label) label.innerText = scheduleInfo.test_day ? `테스트 ${scheduleInfo.test_day}일차 경기`
        : scheduleInfo.is_today === false && scheduleInfo.game_date
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


function forceLiveMatchStart() {
    enterLiveMatch();
}

function enterLiveMatch() {
    window._holdUntilEnter = false;
    clearInterval(matchCountdownInterval);
    isMatchLive = true;
    const modal = document.getElementById('crisis-modal');
    if (modal) modal.classList.remove('active');

    window._igLastPlayKey = undefined;
    // 누르는 즉시 경기 화면으로 전환 (같은 경기의 저장된 상태가 있으면 바로 그림, 없으면 '입장 중' 표시)
    const cached = currentGameState && currentGameState.home_team === currentHomeTeam && currentGameState.away_team === currentAwayTeam && !currentGameState.game_over ? currentGameState : null;
    const ig = document.getElementById('ingame-view');
    if (!cached && ig) ig.classList.add('ig-loading');
    switchView('ingame-view', cached || 'skip');
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
        if (ig) ig.classList.remove('ig-loading');
        if (data && data.state) {
            currentGameState = data.state;
            saveGameStateToStorage(data.state);
            updateScoreboardUI(data.state);
            drawBaseballField(data.state);
            renderNaverSportsLiveFeed(data.state);
            if (data.state.crisis_active && data.state.current_crisis) openCrisisModal(data.state.current_crisis);
        }
        if (data && !data.resumed) {
            setTimeout(() => igShowPlayBall(), 300);
            igFirstPitchCountdown(5);
        }
    })
    .catch(() => { if (ig) ig.classList.remove('ig-loading'); showToast('연결이 불안정해요. 다시 시도해 주세요.'); });
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
    const postgame = document.getElementById('postgame-view');
    const isIngameActive = (ingame && ingame.classList.contains('active')) || (postgame && postgame.classList.contains('active'));

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
        // 방금 받은 상태가 있으면 바로 그림 (서버에 한 번 더 묻지 않음). 'skip'이면 곧 올 응답이 채움
        (preloadedState === 'skip' ? new Promise(() => {}) : preloadedState ? Promise.resolve(preloadedState) : fetch('/api/state').then(r => r.json()))
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
        loadMyGames();    } else if (tabName === 'minigame') {
        loadMinigames();
    } else if (tabName === 'search') {
        loadFriends();
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
            if (data.test_day) window._stTest = { day: data.test_day, done: data.test_done_upto || 0 };
            if (data.test_day || JSON.stringify(latest) !== JSON.stringify(kboTeamStandingsData)) {
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
    // 테스트 시즌: 연도 이동 없이 'N일차까지' 표시
    if (window.TEST_SEASON) {
        const prev = document.getElementById('st-year-prev');
        if (prev) prev.style.visibility = 'hidden';
        if (nextBtn) nextBtn.style.visibility = 'hidden';
        if (titleEl) titleEl.innerText = '테스트';
        const sub = document.getElementById('standings-year-sub');
        const t = window._stTest;
        if (sub) sub.textContent = t && t.done ? `테스트 시즌 · ${t.done}일차까지` : '테스트 시즌 · 아직 끝난 경기가 없어요';
    }

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

// ---------------- 내 기록: 경기별 히스토리 ----------------
let myGames = [];

function loadMyGames() {
    fetch('/api/my_games')
        .then(r => r.json())
        .then(data => { myGames = data.games || []; renderMyRecords(data.summary || {}); })
        .catch(() => {});
}

function mrDateLabel(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    return `${m}/${d}(${['일', '월', '화', '수', '목', '금', '토'][new Date(y, m - 1, d).getDay()]})`;
}

function renderMyRecords(sum) {
    const set = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
    set('mr-score', `${Number(sum.score ?? 2000).toLocaleString()}P`);
    const grade = document.getElementById('mr-grade');
    if (grade) { grade.textContent = sum.grade || 'D'; grade.className = `pg-grade grade-${(sum.grade || 'd').toLowerCase()}`; }
    const d = sum.delta || 0;
    const delta = document.getElementById('mr-delta');
    if (delta) { delta.textContent = `${d > 0 ? '+' : d < 0 ? '' : '±'}${d}P`; delta.className = `mr-delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}`; }
    set('mr-games', sum.games || 0);
    set('mr-rate', sum.rate === null || sum.rate === undefined ? '-' : `${sum.rate}%`);
    set('mr-hitmiss', `${sum.hit || 0} / ${sum.miss || 0}`);
    set('mr-wl', `${sum.wins || 0}승 ${sum.losses || 0}패`);

    const list = document.getElementById('mr-list');
    if (!list) return;
    if (!myGames.length) {
        list.innerHTML = '<div class="mr-empty">아직 끝낸 경기가 없어요.<br>경기를 마치면 여기에 쌓여요</div>';
        return;
    }
    list.innerHTML = myGames.map((g, i) => {
        const away = normalizeTeamShort(g.away) || g.away, home = normalizeTeamShort(g.home) || g.home;
        const dl = g.delta || 0;
        const rc = g.result === '승' ? 'win' : g.result === '패' ? 'lose' : g.result === '중단' ? 'left' : '';
        return `<button class="mr-row" onclick="openMyGameDetail(${i})">
            <span class="mr-row-day">${g.day ? `<b>${g.day}일차</b>` : ''}<small>${mrDateLabel(g.date)}</small></span>
            <span class="mr-row-match">
                <span class="mr-logo">${teamLogoHtml(away)}</span>
                <b>${g.score_away}</b><i>:</i><b>${g.score_home}</b>
                <span class="mr-logo">${teamLogoHtml(home)}</span>
            </span>
            <span class="mr-row-right">
                ${g.result ? `<em class="mr-res ${rc}">${g.result}</em>` : ''}
                <strong class="${dl > 0 ? 'up' : dl < 0 ? 'down' : ''}">${dl > 0 ? '+' : dl < 0 ? '' : '±'}${dl}P</strong>
            </span>
        </button>`;
    }).join('');
}

function openMyGameDetail(i) {
    const g = myGames[i];
    const modal = document.getElementById('mr-detail');
    if (!g || !modal) return;
    const set = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
    const away = normalizeTeamShort(g.away) || g.away, home = normalizeTeamShort(g.home) || g.home;
    set('mr-d-title', g.day ? `${g.day}일차 경기` : '경기 기록');
    set('mr-d-date', `${mrDateLabel(g.date)}${g.status === 'left' ? ` · ${g.inning}에 중단` : ''}`);
    const rc = g.result === '승' ? 'win' : g.result === '패' ? 'lose' : g.result === '중단' ? 'left' : '';
    document.getElementById('mr-d-score').innerHTML = `
        <div class="pg-team"><span class="pg-logo">${teamLogoHtml(away)}</span><span>${away}</span></div>
        <div class="pg-runs"><b>${g.score_away}</b><i>:</i><b>${g.score_home}</b></div>
        <div class="pg-team"><span class="pg-logo">${teamLogoHtml(home)}</span><span>${home}</span></div>
        ${g.result ? `<em class="mr-res ${rc}">${g.my_team ? g.my_team + ' ' : ''}${g.result}</em>` : ''}`;
    const dl = g.delta || 0;
    document.getElementById('mr-d-points').innerHTML = `<span>감독 점수</span>
        <b>${Number(g.start_score).toLocaleString()}</b><i>→</i><b>${Number(g.end_score).toLocaleString()}</b>
        <strong class="${dl > 0 ? 'up' : dl < 0 ? 'down' : ''}">${dl > 0 ? '+' : dl < 0 ? '' : '±'}${dl}P</strong>`;
    const rate = g.hit + g.miss ? `${Math.round(g.hit / (g.hit + g.miss) * 100)}%` : '-';
    document.getElementById('mr-d-stats').innerHTML = `
        <div><span>적중</span><strong class="up">${g.hit}</strong></div>
        <div><span>실패</span><strong class="down">${g.miss}</strong></div>
        <div><span>자리 비움</span><strong>${g.skip}</strong></div>
        <div><span>적중률</span><strong>${rate}</strong></div>`;
    const label = (c, ph) => c === 'CHANGE' ? (ph ? '대타' : '교체') : c === 'KEEP' ? (ph ? '그대로' : '유지') : '자리 비움';
    const tl = g.tactics || [];
    document.getElementById('mr-d-list').innerHTML = tl.length ? tl.map(t => {
        const ph = t.kind === 'PH';
        const who = ph ? `대타 · ${t.pitcher}${t.new_pitcher && t.new_pitcher !== t.pitcher ? ' → ' + t.new_pitcher : ''}` : `${t.pitcher} vs ${t.batter}`;
        const d2 = t.score_delta || 0;
        return `<div class="pg-log-row">
            <span class="pg-log-inn">${t.inning_str}</span>
            <span class="pg-log-who">${who}</span>
            <span class="pg-log-choice">나 ${label(t.my_choice, ph)} · 감독 ${label(t.manager_choice, ph)}</span>
            <span class="pg-log-res ${t.result === 'OUT' ? 'out' : 'on'}">${t.result === 'OUT' ? '아웃' : '출루'}</span>
            <b class="pg-log-delta ${d2 > 0 ? 'up' : d2 < 0 ? 'down' : ''}">${d2 > 0 ? '+' : d2 < 0 ? '' : '±'}${d2}</b>
        </div>`;
    }).join('') : '<div class="pg-log-empty">이 경기는 작전이 없었어요</div>';
    modal.classList.add('active');
}

function closeMyGameDetail() {
    const m = document.getElementById('mr-detail');
    if (m) m.classList.remove('active');
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
            loadFriends();
            loadScheduleTable('today');
        })
        .catch(err => console.error("Lobby error:", err));
}

// Schedule Tab Globals & Date Picker Logic
// 일정 탭의 '오늘': 테스트 시즌이면 지금 테스트 일차의 날짜
function schedTodayStr() {
    return window._testDate || getFormattedTodayStr();
}
let selectedScheduleDate = getFormattedTodayStr();




const teamPitcherMap = {
    "한화": "이상규", "삼성": "최원태", "KIA": "올러", "KT": "고영표", "LG": "임찬규", "SSG": "이로운", "키움": "전준표", "롯데": "비슬리", "NC": "토다", "두산": "잭로그"
};


function loadScheduleTable(filterDate = schedTodayStr()) {
    const goToday = !filterDate || filterDate === 'today';
    if (goToday) filterDate = schedTodayStr();
    selectedScheduleDate = filterDate;
    fetch('/api/schedules')
        .then(res => res.json())
        .then(data => {
            cachedSchedules = data.schedules || [];
            // '오늘' 버튼: 서버가 알려 준 오늘(테스트 시즌은 진행 중인 일차) → 그날 경기가 없으면 가장 가까운 다음 경기일
            if (goToday) {
                if (data.test_date) window._testDate = data.test_date;
                selectedScheduleDate = scheduleGameDayFrom(schedTodayStr());
                renderHorizontalDatePicker();
                renderMatchupsForDate(selectedScheduleDate);
                setTimeout(() => centerActiveDate(false), 400);
                return;
            }
            // 테스트 시즌: '오늘'을 테스트 일차 날짜로
            if (data.test_date && window._testDate !== data.test_date) {
                const wasToday = selectedScheduleDate === schedTodayStr();
                window._testDate = data.test_date;
                if (wasToday || !cachedSchedules.some(g => g.game_date === selectedScheduleDate)) selectedScheduleDate = data.test_date;
            }
            renderHorizontalDatePicker();
            renderMatchupsForDate(selectedScheduleDate);
        })
        .catch(err => console.error("Error loading schedules:", err));
}

// 이 날짜에 경기가 없으면 가장 가까운 다음 경기일 (다음 경기가 없으면 마지막 경기일)
function scheduleGameDayFrom(dateStr) {
    const days = [...new Set((cachedSchedules || []).filter(g => g.is_rest_day !== 1).map(g => g.game_date))].sort();
    if (!days.length || days.includes(dateStr)) return dateStr;
    return days.find(d => d >= dateStr) || days[days.length - 1];
}

const SC_DOWS = ['일', '월', '화', '수', '목', '금', '토'];

function scDateParts(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return { y, m, d, dow: SC_DOWS[new Date(y, m - 1, d).getDay()] };
}

function renderHorizontalDatePicker() {
    const box = document.getElementById('sched-date-scroll');
    if (!box) return;
    const todayStr = schedTodayStr();
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


// 이전/다음 달: 그 달의 1일로 이동
function shiftSchedMonth(delta) {
    const cur = scDateParts(selectedScheduleDate || schedTodayStr());
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
    const isToday = dateStr === schedTodayStr();
    // 테스트 시즌에는 내 팀 경기만 입장 (다른 경기에 들어가면 내 하루가 소모되지 않도록)
    const canEnter = m => isToday && (!window.TEST_SEASON
        || [normalizeTeamShort(m.home_team), normalizeTeamShort(m.away_team)].includes(normalizeTeamShort(selectedTeamCode)));
    list.innerHTML = games.map(m => gameRowHtml(m, { enterable: canEnter(m) })).join('');
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


// ================= 랭킹 · 친구 =================
// 등급: 2000점 D(초짜 감독)에서 500점마다 한 단계 (서버 game_engine.grade_for와 같은 기준)
let GRADE_STEPS = [[4000, 'S'], [3500, 'A'], [3000, 'B'], [2500, 'C']];
let GRADE_NAMES = { S: '전설의 감독', A: '명장', B: '베테랑 감독', C: '주전 감독', D: '초짜 감독' };
let _rkData = null;

function rkEsc(t) {
    return String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function gradeOf(score) {
    for (const [cut, g] of GRADE_STEPS) if ((score || 0) >= cut) return g;
    return 'D';
}

function loadFriends() {
    return fetch('/api/friends')
        .then(r => r.json())
        .then(d => {
            if (d.status !== 'success') return;
            if (d.grade_names) GRADE_NAMES = d.grade_names;
            if (d.grade_steps) GRADE_STEPS = d.grade_steps;
            _rkData = d;
            renderFriendRankings(d.rankings);
            renderFriendRequests(d.received || []);
            renderSentRequests(d.sent || []);
        })
        .catch(() => {});
}

function rkUserRow(u, right) {
    const team = normalizeTeamShort(u.favorite_team || u.team);
    const g = u.grade || gradeOf(u.score);
    return `<span class="rk-logo">${teamLogoHtml(team)}</span>
        <div class="rk-who">
            <b>${rkEsc(u.nickname || u.name)}</b>
            <span><i class="rk-g grade-${g.toLowerCase()}">${g}</i>${GRADE_NAMES[g] || ''} · ${Number(u.score || 0).toLocaleString()}P</span>
        </div>${right}`;
}

function renderFriendRankings(rankings) {
    const list = document.getElementById('friend-ranking-list');
    if (!list || !rankings) return;
    const meIdx = rankings.findIndex(u => u.is_me);
    const me = rankings[meIdx] || {};
    renderMyGrade(me.score ?? 2000, meIdx + 1, rankings.length);
    const rows = rankings.map((u, i) => {
        const nick = u.is_me ? (u.nickname || userNickname) : u.name;
        return `<div class="rk-row ${u.is_me ? 'me' : ''}">
            <span class="rk-num ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span>
            ${rkUserRow({ ...u, nickname: nick }, u.is_me ? '<span class="rk-tag">나</span>'
                : `<button class="rk-btn rk-del" onclick="removeFriend(${u.id}, this)">삭제</button>`)}
        </div>`;
    }).join('');
    const hint = rankings.length <= 1
        ? '<div class="rk-empty">아직 친구가 없어요. 친구를 추가하고 점수를 겨뤄 보세요.</div>' : '';
    setHtmlIfChanged(list, rows + hint);
}

function renderMyGrade(score, rank, total) {
    const g = gradeOf(score);
    const set = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
    const badge = document.getElementById('rk-grade');
    if (badge) { badge.textContent = g; badge.className = `pg-grade grade-${g.toLowerCase()}`; }
    set('rk-grade-name', GRADE_NAMES[g] || '');
    set('rk-score', `${Number(score).toLocaleString()}P`);
    set('rk-myrank', total > 1 ? `${rank}위 / ${total}명` : '-');
    // 등급 사다리: 맨 위 S, 맨 아래 D. 내 위치까지 아래에서 위로 초록 선이 차오름
    const ladder = document.getElementById('rk-ladder');
    if (!ladder) return;
    const cuts = { D: 2000 }; GRADE_STEPS.forEach(([c, k]) => cuts[k] = c);
    const up = ['D', 'C', 'B', 'A', 'S'];
    const gi = up.indexOf(g);
    const nextG = up[gi + 1];
    const frac = nextG ? Math.max(0, Math.min(1, (score - cuts[g]) / (cuts[nextG] - cuts[g]))) : 0;
    const fillPct = ((gi + frac) / (up.length - 1)) * 100;
    const rows = [...up].reverse().map(k => {
        const i = up.indexOf(k);
        const state = i < gi ? 'past' : i === gi ? 'now' : 'future';
        let right = `<span class="rk-l-cut">${cuts[k].toLocaleString()}P</span>`;
        if (k === nextG) right = `<span class="rk-l-left">${(cuts[k] - score).toLocaleString()}P 남음</span>`;
        if (state === 'now') right = '<span class="rk-l-me">현재</span>';
        return `<div class="rk-l-row ${state}">
            <i class="rk-l-node"></i>
            <b class="rk-l-g">${k}</b>
            <span class="rk-l-name">${GRADE_NAMES[k] || ''}</span>
            ${right}
        </div>`;
    }).join('');
    setHtmlIfChanged(ladder, `<div class="rk-l-rail"><i style="height:${fillPct}%"></i></div>${rows}`);
}

function renderFriendRequests(received) {
    const box = document.getElementById('rk-reqs');
    const cnt = document.getElementById('rk-req-count');
    const dot = document.getElementById('nav-rk-dot');
    if (cnt) { cnt.textContent = received.length; cnt.hidden = !received.length; }
    if (dot) { dot.hidden = !received.length; dot.textContent = `친구 요청 ${received.length}`; } // 하단 바 랭킹 위 말풍선
    if (!box) return;
    setHtmlIfChanged(box, received.length ? received.map(u => `<div class="rk-row">
        ${rkUserRow(u, `<div class="rk-btns">
            <button class="rk-btn ok" onclick="respondFriend(${u.id}, true)">수락</button>
            <button class="rk-btn" onclick="respondFriend(${u.id}, false)">거절</button>
        </div>`)}
    </div>`).join('') : '<div class="rk-empty">받은 친구 요청이 없어요</div>');
}

function renderSentRequests(sent) {
    const wrap = document.getElementById('rk-sent-wrap');
    const box = document.getElementById('rk-sent');
    if (!wrap || !box) return;
    wrap.hidden = !sent.length;
    box.innerHTML = sent.map(u => `<div class="rk-row">
        ${rkUserRow(u, friendReqBtn(u.id, true))}
    </div>`).join('');
}

function openFriendSheet() {
    const m = document.getElementById('friend-sheet');
    if (!m) return;
    m.classList.add('active');
    const res = document.getElementById('friend-search-results');
    if (res && !res.innerHTML.trim()) res.innerHTML = '<div class="rk-empty">닉네임을 입력하고 검색하세요</div>';
    setTimeout(() => { const i = document.getElementById('friend-search-input'); if (i) i.focus(); }, 50);
}
function closeFriendSheet() {
    const m = document.getElementById('friend-sheet');
    if (m) m.classList.remove('active');
}

function executeFriendSearch() {
    const input = document.getElementById('friend-search-input');
    const query = input ? input.value.trim() : '';
    if (!query) { showToast('닉네임을 입력해 주세요.'); return; }
    fetch(`/api/search_friends?query=${encodeURIComponent(query)}`)
        .then(r => r.json())
        .then(data => renderSearchResults(data.results || []));
}

function renderSearchResults(results) {
    const box = document.getElementById('friend-search-results');
    if (!box) return;
    if (!results.length) { box.innerHTML = '<div class="rk-empty">검색된 감독이 없어요</div>'; return; }
    const btn = u => ({
        friend: '<span class="rk-state">친구</span>',
        sent: friendReqBtn(u.id, true),
        received: `<button class="rk-btn ok" onclick="respondFriend(${u.id}, true)">수락</button>`,
    }[u.relation] || friendReqBtn(u.id, false));
    box.innerHTML = results.map(u => `<div class="rk-row">${rkUserRow(u, btn(u))}</div>`).join('');
}

// 친구 요청 버튼: 요청 전 = 초록 '요청', 보낸 뒤 = 빨간 '요청 취소'
function friendReqBtn(id, sent) {
    return sent
        ? `<button class="rk-btn cancel" onclick="cancelFriendRequest(${id}, this)">요청 취소</button>`
        : `<button class="rk-btn ok" onclick="addFriend(${id}, this)">요청</button>`;
}
// 누르는 즉시 버튼을 바꾸고(서버 답을 기다리지 않음), 실패하면 원래대로 되돌림
function friendToggle(btn, id, sent) {
    if (btn) btn.outerHTML = friendReqBtn(id, sent);
}

function friendPost(url, body, quiet) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(r => r.json())
        .then(res => {
            if (!quiet || res.status !== 'success') showToast(res.message || (res.status === 'success' ? '완료했어요.' : '다시 시도해 주세요.'));
            loadFriends();
            return res;
        })
        .catch(() => { showToast('연결이 불안정해요. 다시 시도해 주세요.'); return { status: 'error' }; });
}
function addFriend(id, btn) {
    friendToggle(btn, id, true);
    return friendPost('/api/friends/request', { user_id: id }, true).then(res => {
        if (res.status !== 'success') friendToggle(document.querySelector(`[onclick^="cancelFriendRequest(${id},"]`), id, false);
        else if (res.relation === 'friend') executeFriendSearch(); // 상대도 요청했었으면 바로 친구
    });
}
function respondFriend(id, accept) {
    return friendPost('/api/friends/respond', { user_id: id, accept }).then(() => {
        const q = document.getElementById('friend-search-input');
        if (q && q.value.trim() && document.getElementById('friend-sheet').classList.contains('active')) executeFriendSearch();
    });
}
// 앱 안 확인 창 (브라우저 기본 창 대신). 확인이면 true
function appConfirm(message, opts = {}) {
    let m = document.getElementById('app-confirm');
    if (!m) {
        m = document.createElement('div');
        m.id = 'app-confirm';
        m.className = 'modal-overlay app-confirm';
        m.innerHTML = `<div class="igm-card ac-card"><p class="ac-msg"></p><div class="ac-btns">
            <button type="button" class="ac-btn ac-no">취소</button><button type="button" class="ac-btn ac-yes">확인</button></div></div>`;
        document.body.appendChild(m);
    }
    m.querySelector('.ac-msg').textContent = message;
    const yes = m.querySelector('.ac-yes'), no = m.querySelector('.ac-no');
    yes.textContent = opts.ok || '확인';
    no.textContent = opts.cancel || '취소';
    yes.classList.toggle('danger', !!opts.danger);
    m.classList.add('active');
    return new Promise(resolve => {
        const done = v => { m.classList.remove('active'); yes.onclick = no.onclick = m.onclick = null; resolve(v); };
        yes.onclick = () => done(true);
        no.onclick = () => done(false);
        m.onclick = e => { if (e.target === m) done(false); };
    });
}

// 친구 삭제: 앱 안 확인 창으로 한 번 묻고, 바로 목록에서 빼고, 서버는 뒤에서 처리
async function removeFriend(id, btn) {
    const row = btn && btn.closest('.rk-row');
    const name = row ? (row.querySelector('.rk-who b')?.textContent || '') : '';
    if (!(await appConfirm(`${name} 님을 친구에서 삭제할까요?`, { ok: '삭제', danger: true }))) return;
    if (row) row.remove();
    return friendPost('/api/friends/remove', { user_id: id }, true).then(res => {
        if (res.status === 'success') showToast('친구에서 삭제했어요.');
    });
}

function cancelFriendRequest(id, btn) {
    // 검색 결과의 버튼은 바로 '요청'으로, 보낸 요청 목록의 줄은 바로 사라지게
    const row = btn && btn.closest('#rk-sent .rk-row');
    if (row) row.remove(); else friendToggle(btn, id, false);
    document.querySelectorAll(`#friend-search-results [onclick^="cancelFriendRequest(${id},"]`).forEach(b => friendToggle(b, id, false));
    return friendPost('/api/friends/cancel', { user_id: id }, true).then(res => {
        if (res.status !== 'success') executeFriendSearch();
    });
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

    // 작전 결과는 타석 결과 큰 글씨 아래에 함께 표시 (igCheckPlayResult)

    if (s && s.crisis_active && s.current_crisis) {
        openCrisisModal(s.current_crisis);
    }
}

let clientPitchSeq = 0;



function openCrisisModal(crisis) {
    const modal = document.getElementById('crisis-modal');
    if (!modal || !crisis) return;
    if (modal.classList.contains('active')) return;
    // 타석 결과·작전 채점 글씨가 떠 있는 동안은 다 본 뒤에 띄움
    const wait = (window._igBannerUntil || 0) - Date.now();
    if (wait > 0) {
        clearTimeout(window._igCrisisDelay);
        window._igCrisisDelay = setTimeout(() => {
            if (currentGameState && currentGameState.crisis_active) openCrisisModal(currentGameState.current_crisis || crisis);
        }, wait + 50);
        return;
    }

    const pName = crisis.pitcher_name || (currentGameState ? currentGameState.pitcher : '투수');
    const pCount = crisis.pitch_count !== undefined ? crisis.pitch_count : (currentGameState ? currentGameState.totalPitcherCount : 0);
    const inning = (currentGameState && currentGameState.inning_str) || '';
    const isPH = crisis.id === 'PINCH_HIT';
    const reason = isPH ? '' : crisis.condition_type === 'CONDITION_A' ? '4타자 연속 출루' : '득점권 주자 · 실점 위기';

    const descEl = document.getElementById('crisis-desc');
    if (descEl) descEl.textContent = isPH ? crisis.desc : [inning, reason].filter(Boolean).join(' · ');
    // 작전 종류별 문구·버튼 (투수 교체 / 대타)
    const badge = document.getElementById('crisis-badge');
    if (badge) { badge.textContent = isPH ? '공격 작전' : '위기 상황'; badge.className = `igm-badge ${isPH ? 'attack' : ''}`; }
    const titleEl = document.getElementById('crisis-title');
    if (titleEl) titleEl.textContent = isPH ? '대타를 낼까요?' : '투수를 바꿀까요?';
    const card = modal.querySelector('.igm-card');
    if (card) card.classList.toggle('igm-attack', isPH);
    const reveal = document.getElementById('crisis-reveal');
    if (reveal) {
        reveal.hidden = !(isPH && crisis.revealed);
        reveal.innerHTML = isPH && crisis.revealed ? `실제 감독은 <b>대타 ${crisis.ph_name}</b> 기용!<br>당신도 바꾸실래요?` : '';
    }
    const phRow = document.getElementById('crisis-ph-row');
    if (phRow) phRow.hidden = !isPH;
    if (isPH) {
        const set2 = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
        set2('crisis-ph-name', crisis.ph_name || '-');
        set2('crisis-ph-hand', crisis.ph_bats || '');
        set2('crisis-ph-info', `타율 ${igAvg(crisis.ph_avg)}`);
    }
    const choices = document.getElementById('crisis-choices');
    if (choices) {
        choices.innerHTML = isPH
            ? `<button class="igm-choice change" onclick="submitTactic('PINCH_HIT')"><strong>대타 ${crisis.ph_name}</strong><span>대타 기용</span></button>
               <button class="igm-choice keep" onclick="submitTactic('KEEP_BATTER')"><strong>그대로 간다</strong><span>${crisis.batter_name} 타석</span></button>`
            : `<button class="igm-choice change" onclick="submitTactic('PITCHER_CHANGE')"><strong>투수 교체</strong><span>불펜 투입</span></button>
               <button class="igm-choice keep" onclick="submitTactic('KEEP_PITCHER')"><strong>그대로 간다</strong><span>지금 투수 유지</span></button>`;
    }
    const nameEl = document.getElementById('crisis-pitcher-name');
    if (nameEl) nameEl.textContent = pName;
    const countEl = document.getElementById('crisis-pitch-count');
    if (countEl) countEl.textContent = `${pCount}구`;

    // 이번에 상대할 타자 (투수 손 vs 타자 손도 함께)
    const gs = currentGameState || {};
    const sess = gs.batter_sessions && gs.batter_sessions[0];
    const setText = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
    setText('crisis-pitcher-hand', gs.pitcher_throws || '');
    setText('crisis-batter-name', gs.batter || '-');
    setText('crisis-batter-hand', gs.batter_bats || '');
    const order = sess && sess.batter_order ? sess.batter_order.replace('타자', '') : '';
    const avg = igAvg(sess ? (sess.batter_avg || (sess.batter_stats && sess.batter_stats.avg)) : '');
    setText('crisis-batter-info', [order, avg].filter(Boolean).join(' · '));

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
            submitTactic('SKIP');  // 시간 초과: 감독님 자리 비움 (점수 변동 없음)
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
            igShowTacticReveal(res);
        }
    });
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

// 경기가 시작됐는지 (한 구라도 던졌는지)
function gameHasStarted(s) {
    return !!(s && ((s.batter_sessions || []).some(b => (b.pitches || []).length) || s.inning > 1 || s.game_over));
}

function triggerStep() {
    // 로비에 있을 때는 이미 시작된 경기만 뒤에서 계속 진행 (입장 전 경기는 타순을 짜고 시작)
    const ingameNow = document.getElementById('ingame-view');
    const inGame = !!(ingameNow && ingameNow.classList.contains('active'));
    if (!inGame && window._holdUntilEnter) return; // 새로고침·재접속 뒤 입장 전에는 진행하지 않음
    if (!inGame && !gameHasStarted(currentGameState)) return;
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

// (테스트) 경기를 끝까지 진행하고 성적표로
function fastForwardMatch() {
    stopAutoPitchTimer();
    fetch('/api/finish', { method: 'POST' })
        .then(r => r.json())
        .then(state => {
            currentGameState = state;
            renderPostGameSummary(state);
            switchView('postgame-view');
        });
}

// 경기 후 성적표: 최종 점수 · 한 줄 평(내 판단이었다면?) · 적중/실패 · 감독 점수 · 작전 기록
function renderPostGameSummary(s) {
    if (!s) return;
    // 테스트 시즌이면 아래 버튼은 '다음 날 경기로'
    const nextBtn = document.getElementById('pg-btn-lobby');
    if (nextBtn) nextBtn.textContent = window._testDay ? `${window._testDay + 1}일차 경기로` : '로비로';
    const set = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
    const away = normalizeTeamShort(s.away_team) || s.away_team;
    const home = normalizeTeamShort(s.home_team) || s.home_team;
    set('pg-away-name', away);
    set('pg-home-name', home);
    setHtmlIfChanged(document.getElementById('pg-away-logo'), teamLogoHtml(away));
    setHtmlIfChanged(document.getElementById('pg-home-logo'), teamLogoHtml(home));
    set('pg-away-score', s.score_away ?? 0);
    set('pg-home-score', s.score_home ?? 0);

    const log = s.tactic_log || [];
    const hit = log.filter(t => t.score_delta > 0).length;
    const miss = log.filter(t => t.score_delta < 0).length;
    const skip = log.filter(t => t.my_choice === 'SKIP').length;
    set('pg-hit', hit);
    set('pg-miss', miss);
    set('pg-skip', skip);
    set('pg-rate', hit + miss ? `${Math.round(hit / (hit + miss) * 100)}%` : '-');

    // 내 팀 기준으로 결과와 '내 판단이었다면' 계산
    const myTeam = normalizeTeamShort(selectedTeamCode);
    const inGame = myTeam === away || myTeam === home;
    const myScore = myTeam === home ? s.score_home : s.score_away;
    const oppScore = myTeam === home ? s.score_away : s.score_home;
    // 실제 감독이 틀렸고 내 선택이 달랐던 타석(내가 맞힌 경우)에 내준 점수 = 내 판단이었다면 막을 수 있었던 점수
    const savedFor = team => log.filter(t => t.def_team === team && (t.case_no === 4 || t.case_no === 6)).reduce((n, t) => n + (t.runs || 0), 0);

    const resultEl = document.getElementById('pg-result');
    let title = '', sub = '', tone = '';
    const tacticLine = hit + miss ? `작전 ${hit + miss}번 중 ${hit}번 적중했어요`
        : skip ? `위기 ${skip}번 모두 자리 비움이었어요` : '이번 경기는 위기 작전이 없었어요';
    if (inGame) {
        const margin = myScore - oppScore;
        const saved = savedFor(myTeam);
        if (resultEl) {
            resultEl.textContent = `${myTeam} ${margin > 0 ? '승리' : margin < 0 ? '패배' : '무승부'}`;
            resultEl.className = `pg-result ${margin > 0 ? 'win' : margin < 0 ? 'lose' : ''}`;
        }
        if (margin < 0 && saved > -margin) { title = '내 판단이었다면 이 경기 잡았다!'; sub = `감독이 내준 ${saved}점, 내 선택이었다면 막았어요`; tone = 'gold'; }
        else if (margin < 0 && saved === -margin) { title = '내 판단이었다면 동점까지 갔다!'; sub = `감독이 내준 ${saved}점, 내 선택이었다면 막았어요`; tone = 'gold'; }
        else if (margin < 0 && saved > 0) { title = '아쉬운 패배'; sub = `내 판단이었다면 ${saved}점은 막았어요`; tone = 'bad'; }
        else if (margin < 0) { title = '아쉬운 패배'; sub = tacticLine; tone = 'bad'; }
        else if (margin > 0) { title = hit > miss ? '승리! 감독 못지않은 눈' : '승리!'; sub = saved > 0 ? `내 판단이었다면 ${saved}점 더 막았어요` : tacticLine; tone = 'good'; }
        else { title = '무승부'; sub = saved > 0 ? `내 판단이었다면 ${saved}점 막고 이겼어요` : tacticLine; tone = saved > 0 ? 'gold' : ''; }
    } else {
        if (resultEl) { resultEl.textContent = ''; resultEl.className = 'pg-result'; }
        const rate = hit + miss ? Math.round(hit / (hit + miss) * 100) : 0;
        if (!hit && !miss) { title = '이번 경기는 지켜보기만 했어요'; sub = skip ? `자리 비움 ${skip}번` : '위기 작전이 없었어요'; }
        else if (rate >= 60) { title = '감독보다 날카로웠어요!'; sub = `작전 ${hit + miss}번 중 ${hit}번 적중`; tone = 'good'; }
        else { title = '다음엔 더 잘할 수 있어요'; sub = `작전 ${hit + miss}번 중 ${hit}번 적중`; tone = 'bad'; }
    }
    set('pg-verdict-title', title);
    set('pg-verdict-sub', sub);
    const verdict = document.getElementById('pg-verdict');
    if (verdict) verdict.className = `pg-verdict ${tone}`;

    const delta = (s.manager_score ?? 2000) - (s.start_score ?? s.manager_score ?? 2000);
    set('pg-delta', `${delta > 0 ? '+' : ''}${delta}P`);
    const deltaEl = document.getElementById('pg-delta');
    if (deltaEl) deltaEl.className = delta > 0 ? 'up' : delta < 0 ? 'down' : '';
    set('post-total-score', `${Number(s.manager_score ?? 2000).toLocaleString()}P`);
    const badge = document.getElementById('post-grade-badge');
    if (badge) {
        badge.textContent = s.manager_grade || 'D';
        badge.className = `pg-grade grade-${(s.manager_grade || 'd').toLowerCase()}`;
    }
    const titles = { S: 'S급 전설의 감독', A: 'A급 명장', B: 'B급 베테랑 감독', C: 'C급 주전 감독', D: 'D급 초짜 감독' };
    set('post-grade-title', titles[s.manager_grade] || '');

    const list = document.getElementById('pg-log-list');
    if (list) {
        const label = (c, ph) => c === 'CHANGE' ? (ph ? '대타' : '교체') : c === 'KEEP' ? (ph ? '그대로' : '유지') : '자리 비움';
        list.innerHTML = log.length ? log.map(t => {
            const ph = t.kind === 'PH';
            const who = ph ? `대타 · ${t.pitcher}${t.new_pitcher && t.new_pitcher !== t.pitcher ? ' → ' + t.new_pitcher : ''}` : `${t.pitcher} vs ${t.batter}`;
            return `<div class="pg-log-row">
                <span class="pg-log-inn">${t.inning_str}</span>
                <span class="pg-log-who">${who}</span>
                <span class="pg-log-choice">나 ${label(t.my_choice, ph)} · 감독 ${label(t.manager_choice, ph)}</span>
                <span class="pg-log-res ${t.result === 'OUT' ? 'out' : 'on'}">${t.result === 'OUT' ? '아웃' : '출루'}</span>
                <b class="pg-log-delta ${t.score_delta > 0 ? 'up' : t.score_delta < 0 ? 'down' : ''}">${t.score_delta > 0 ? '+' : t.score_delta < 0 ? '' : '±'}${t.score_delta}</b>
            </div>`;
        }).join('') : '<div class="pg-log-empty">이번 경기는 작전이 없었어요</div>';
    }
}

function resetMatchAndLobby() {
    clientPitchSeq = 0;
    const streamContainer = document.getElementById('text-stream') || document.getElementById('naver-live-feed');
    if (streamContainer) {
        streamContainer.innerHTML = '';
    }
    // 테스트 시즌: 경기가 끝났으면 다음 날로 넘어가 새 상대와 경기
    if (window._testDay && currentGameState && currentGameState.game_over) {
        switchView('pregame-view');
        fetch('/api/test/next_day', { method: 'POST' })
            .then(r => r.json())
            .then(res => { showToast(`테스트 ${res.test_day}일차로 넘어왔어요`); loadLobbyData(); })
            .catch(() => {});
        return;
    }
    // 지금 보던 경기의 두 팀 그대로 초기화 (기본값 삼성·한화로 바뀌지 않도록)
    fetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ home_team: currentHomeTeam, away_team: currentAwayTeam, home_pitcher: currentHomePitcher, away_pitcher: currentAwayPitcher })
    }).catch(() => {});
    switchView('pregame-view');
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
    if (code === 'ERROR') return { cls: 'hit', label: '실책 출루' };
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

    igCheckPlayResult(s);
    igRenderTacticPill(s);
}

// 그라운드 (위에서 내려다본 구장)
const IG_FIELD_POS = {
    P: [200, 206], C: [200, 292], '1B': [286, 176], '2B': [240, 146], SS: [160, 146],
    '3B': [114, 176], LF: [94, 100], CF: [200, 64], RF: [306, 100]
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
        // 1루수·3루수 이름은 위쪽에 (베이스 위 주자와 겹치지 않게)
        const ly = (f.role === '1B' || f.role === '3B') ? y - 14 : y + 21;
        const label = `<text x="${x}" y="${ly}" class="ig-fname">${f.name}</text>`;
        return `<g class="ig-f"><circle cx="${x}" cy="${y}" r="8.5" fill="${defColor}"/>${label}</g>`;
    }).join('');

    // 주자 이름은 수비수 이름과 겹치지 않는 바깥쪽에: 1루는 오른쪽 아래, 2루는 위, 3루는 왼쪽 아래
    const RUN_LABEL = { b1: [16, 16, 'start'], b2: [0, -16, 'middle'], b3: [-16, 16, 'end'] };
    const runners = [['b1', s.runner_1b, s.runner_1b_name], ['b2', s.runner_2b, s.runner_2b_name], ['b3', s.runner_3b, s.runner_3b_name]].filter(r => r[1]);
    const rHtml = runners.map(([b, , name]) => {
        const [x, y] = IG_BASES[b];
        const [dx, dy, anchor] = RUN_LABEL[b];
        const label = name ? `<text x="${x + dx}" y="${y + dy}" class="ig-fname ig-run-name" style="text-anchor:${anchor}">${name}</text>` : '';
        return `<g class="ig-run"><circle cx="${x}" cy="${y}" r="8" fill="${offColor}"/><circle cx="${x}" cy="${y}" r="11" class="ig-run-ring"/>${label}</g>`;
    }).join('');

    // 타석에 선 타자: 우타자는 홈플레이트 왼쪽(3루 쪽), 좌타자는 오른쪽(1루 쪽)
    let batterHtml = '';
    if (s.batter && !s.game_over) {
        const left = s.batter_side !== 'L';
        const bx = left ? 178 : 222, by = 266;
        batterHtml = `<g class="ig-bat">
            <circle cx="${bx}" cy="${by}" r="13" class="ig-bat-ring"/>
            <circle cx="${bx}" cy="${by}" r="9" fill="${offColor}"/>
            <text x="${left ? bx - 15 : bx + 15}" y="${by + 4}" class="ig-fname ig-bat-name" style="text-anchor:${left ? 'end' : 'start'}">${s.batter}</text>
        </g>`;
    }

    const base = (k, on) => {
        const [x, y] = IG_BASES[k];
        return `<rect x="${x - 6}" y="${y - 6}" width="12" height="12" transform="rotate(45 ${x} ${y})" class="ig-base ${on ? 'on' : ''}"/>`;
    };
    const [hx, hy] = IG_BASES.home;

    setHtmlIfChanged(box, `<svg viewBox="14 8 372 312" preserveAspectRatio="xMidYMid meet" class="ig-svg" role="img" aria-label="그라운드 수비 배치">
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
        ${batterHtml}
    </svg>`);
}

// 타석 결과가 새로 나오면 그라운드 가운데에 큰 글씨로 잠깐 보여줌
function igPlayBanner(summary) {
    const t = summary || '';
    if (t.includes('끝내기')) return { cls: 'hr', big: 'WALK-OFF!' };
    if (t.includes('홈런')) return { cls: 'hr', big: 'HOME RUN!' };
    if (t.includes('3루타')) return { cls: 'hit', big: '3BASE HIT!' };
    if (t.includes('2루타')) return { cls: 'hit', big: '2BASE HIT!' };
    if (t.includes('안타') || t.includes('1루타')) return { cls: 'hit', big: 'HIT!' };
    if (t.includes('볼넷')) return { cls: 'walk', big: '4 BALL' };
    if (t.includes('실책')) return { cls: 'hit', big: 'ERROR!' };
    if (t.includes('사구')) return { cls: 'walk', big: 'DEAD BALL' };
    if (t.includes('병살')) return { cls: 'out', big: 'DOUBLE PLAY!' };
    if (t.includes('희생플라이')) return { cls: 'sac', big: 'SAC FLY' };
    if (t.includes('삼진')) return { cls: 'out', big: 'STRIKE OUT!' };
    if (t.includes('아웃')) return { cls: 'out', big: 'OUT!' };
    return null;
}

function igCheckPlayResult(s) {
    const done = (s.batter_sessions || []).find(b => b.play_summary);
    const key = done ? `${done.session_id}|${done.play_summary}` : '';
    // 처음 그릴 때(입장 직후)는 지난 결과를 다시 띄우지 않음
    if (window._igLastPlayKey === undefined) { window._igLastPlayKey = key; return; }
    if (!done || key === window._igLastPlayKey) return;
    window._igLastPlayKey = key;
    const ingame = document.getElementById('ingame-view');
    const stage = document.querySelector('#ingame-view .ig-stage');
    const b = igPlayBanner(done.play_summary);
    if (!b || !stage || !ingame || !ingame.classList.contains('active')) return;

    const sub = done.play_summary.split(':').slice(1).join(':').replace(/!+$/, '').trim();
    const t = s.tactic_resolution;
    let tacticLine = '';
    if (t) {
        const d = t.score_delta || 0;
        if (t.skipped) {
            tacticLine = `<em class="ig-banner-tactic skip"><b>자리 비움</b><i>±0</i></em>`;
        } else {
            tacticLine = `<em class="ig-banner-tactic ${d > 0 ? 'good' : 'bad'}"><b>${d > 0 ? '작전 성공' : '작전 실패'}</b><i>${d > 0 ? '+' : ''}${d}</i></em>`;
            igFlashPoints(d);
        }
    }
    stage.querySelectorAll('.ig-banner, .ig-reveal').forEach(el => el.remove());
    const el = document.createElement('div');
    el.className = `ig-banner ${b.cls} ${t ? 'with-tactic' : ''}`;
    el.innerHTML = `<strong>${b.big}</strong><span>${done.batter_name || ''} · ${sub}</span>${tacticLine}`;
    stage.appendChild(el);
    const ms = t ? 2900 : 1900;
    window._igBannerUntil = Date.now() + ms;
    setTimeout(() => el.remove(), ms);
}

// PLAY BALL! 뒤 5초 카운트다운 후 1구 (그 뒤로는 15초마다)
function igFirstPitchCountdown(sec) {
    clearInterval(window._igFirstPitchTimer);
    let left = sec;
    const show = () => {
        const box = document.getElementById('ig-last');
        if (box) box.innerHTML = `<div class="ig-last-line"><span class="ig-chip etc">경기 시작</span><span class="ig-last-text">${left}초 뒤 첫 투구</span></div>`;
    };
    show();
    window._igFirstPitchTimer = setInterval(() => {
        left--;
        const ingame = document.getElementById('ingame-view');
        // 그 사이 직접 투구했거나 화면을 나가면 카운트다운 중단
        if (gameHasStarted(currentGameState) || !(ingame && ingame.classList.contains('active'))) {
            clearInterval(window._igFirstPitchTimer);
            return;
        }
        if (left <= 0) {
            clearInterval(window._igFirstPitchTimer);
            triggerStep();
            return;
        }
        show();
    }, 1000);
}

function igShowPlayBall() {
    const stage = document.querySelector('#ingame-view .ig-stage');
    if (!stage) return;
    stage.querySelectorAll('.ig-banner').forEach(el => el.remove());
    const el = document.createElement('div');
    el.className = 'ig-banner hr';
    el.innerHTML = '<strong>PLAY BALL!</strong><span>경기 시작</span>';
    stage.appendChild(el);
    window._igBannerUntil = Date.now() + 1900;
    setTimeout(() => el.remove(), 1900);
}

// 감독 점수 칸을 잠깐 반짝 (+/-)
function igFlashPoints(delta) {
    const el = document.getElementById('live-score-val');
    if (!el) return;
    el.classList.remove('flash-up', 'flash-down');
    void el.offsetWidth;
    el.classList.add(delta > 0 ? 'flash-up' : 'flash-down');
}

// 작전 제출 직후: 내 선택과 실제 감독의 선택을 그라운드 가운데에 잠깐 공개
function igShowTacticReveal(res) {
    const stage = document.querySelector('#ingame-view .ig-stage');
    if (!stage || !res) return;
    const skipped = res.my_choice === 'SKIP';
    const isPH = res.kind === 'PH';
    const L = c => isPH ? (c === 'CHANGE' ? '대타' : '그대로') : (c === 'CHANGE' ? '교체' : '유지');
    const mine = skipped ? '자리 비움' : L(res.my_choice);
    const mgr = L(res.actual_manager_choice);
    const same = mine === mgr;
    const change = res.actual_manager_choice === 'CHANGE' && res.new_pitcher && res.new_pitcher !== res.old_pitcher
        ? `<div class="ig-reveal-change">${res.old_pitcher} → <b>${res.new_pitcher}</b></div>` : '';
    stage.querySelectorAll('.ig-reveal').forEach(el => el.remove());
    const el = document.createElement('div');
    el.className = 'ig-reveal';
    el.innerHTML = `<div class="ig-reveal-row">
            <div><span>나의 선택</span><strong>${mine}</strong></div>
            <i class="${skipped ? 'skip' : same ? 'same' : 'diff'}">${skipped ? '·' : same ? '=' : '≠'}</i>
            <div><span>실제 감독</span><strong>${mgr}</strong></div>
        </div>${change}<p>${skipped ? '감독님 화장실 가셨나요?<br>이번 작전은 점수 변동 없음' : '다음 타석 결과로 채점돼요'}</p>`;
    stage.appendChild(el);
    window._igBannerUntil = Date.now() + 2600;
    setTimeout(() => el.remove(), 2600);
}

// 채점 기다리는 동안 그라운드 아래 작은 표시
function igRenderTacticPill(s) {
    const stage = document.querySelector('#ingame-view .ig-stage');
    if (!stage) return;
    let pill = document.getElementById('ig-tactic-pill');
    const pt = s && s.pending_tactic;
    if (!pt) { if (pill) pill.remove(); return; }
    if (!pill) {
        pill = document.createElement('div');
        pill.id = 'ig-tactic-pill';
        pill.className = 'ig-tactic-pill';
        stage.appendChild(pill);
    }
    const L = c => pt.kind === 'PH' ? (c === 'CHANGE' ? '대타' : '그대로') : (c === 'CHANGE' ? '교체' : '유지');
    const txt = pt.my_choice === 'SKIP'
        ? `자리 비움 · 감독 ${L(pt.actual_manager_choice)} (점수 변동 없음)`
        : `작전 채점 중 · 나 ${L(pt.my_choice)} / 감독 ${L(pt.actual_manager_choice)}`;
    if (pill.textContent !== txt) pill.textContent = txt;
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
    setHtmlIfChanged(box, `<div class="ig-last-line"><span class="ig-chip ${k.cls}">${k.label}</span><span class="ig-last-text">${[`${last.seq}구`, last.speed_type].filter(Boolean).join(' · ')}</span></div>
        <div class="ig-pdots">${dots}</div>`);
}

// 중계 기록 시트
let igLogTab = 'all';

let igSheetMode = 'lineup';

function igSheetView(mode) {
    igSheetMode = mode;
    document.querySelectorAll('.ig-seg-btn').forEach(b => b.classList.toggle('active', b.dataset.view === mode));
    const lineup = document.getElementById('ig-lineup-view');
    const tabs = document.getElementById('ig-log-tabs');
    const list = document.getElementById('ig-log-list');
    if (lineup) lineup.hidden = mode !== 'lineup';
    if (tabs) tabs.hidden = mode !== 'log';
    if (list) list.hidden = mode !== 'log';
    if (mode === 'lineup') renderIngameLineups(currentGameState);
    else renderIngameLog(currentGameState);
}

// 두 팀 실제 타순 (지금 타석의 타자 강조)
const IG_POS_KO = { C: '포수', '1B': '1루', '2B': '2루', '3B': '3루', SS: '유격', LF: '좌익', CF: '중견', RF: '우익', DH: '지명' };
function renderIngameLineups(s) {
    const box = document.getElementById('ig-lineup-view');
    if (!box || !s || !s.lineups) return;
    const away = normalizeTeamShort(s.away_team) || s.away_team;
    const home = normalizeTeamShort(s.home_team) || s.home_team;
    const offense = s.is_top !== false ? away : home;
    const col = team => {
        const lu = s.lineups[team] || s.lineups[team === away ? s.away_team : s.home_team] || [];
        return `<div class="ig-lu-col">
            <div class="ig-lu-team">${teamLogoHtml(team)}<b>${team}</b>${team === offense ? '<em>공격</em>' : ''}</div>
            ${lu.map((p, i) => `<div class="ig-lu-line ${team === offense && p.name === s.batter ? 'now' : ''}">
                    <i>${i + 1}</i><b>${p.name}</b><small>${IG_POS_KO[p.pos] || p.pos}</small>
                </div>`).join('')}
        </div>`;
    };
    setHtmlIfChanged(box, `<div class="ig-lu-cols">${col(away)}${col(home)}</div>`);
}

function openIngameLog() {
    const sheet = document.getElementById('ig-log-sheet');
    const bg = document.getElementById('ig-log-bg');
    if (!sheet) return;
    igSheetView(igSheetMode);
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
    if (sheet && sheet.classList.contains('open')) {
        if (igSheetMode === 'lineup') renderIngameLineups(s);
        else renderIngameLog(s);
    }
}
function setupSmartAutoScroll() {}
function initCanvas() {}

function drawBaseballField(s) {
    if (!s) s = currentGameState;
    if (!s) return;
    renderIngameField(s);
    renderIngameLast(s);
}


// ================= 미니게임 (3x3, 게임마다 하루 1번 · 도전 10P · 성공 최대 +20P) =================
// 칸 번호별 게임 { title, open(slot) } — 게임 파일(static/mg-*.js)이 채워 넣음
// 게임은 mgStartChallenge(slot)로 도전을 시작하고, 끝나면 finishMinigame(slot, success, reward)를 부름 (reward 0~20)
const MINIGAMES = {};
let _mgState = null;

function loadMinigames() {
    const grid = document.getElementById('mg-grid');
    if (grid && !_mgState) renderMinigames(null);
    fetch('/api/minigames')
        .then(r => r.json())
        .then(d => { if (d.status === 'success') { _mgState = d; renderMinigames(d); } })
        .catch(() => {});
}

function renderMinigames(d) {
    const grid = document.getElementById('mg-grid');
    if (!grid) return;
    if (d) {
        const sc = document.getElementById('mg-score');
        if (sc) sc.textContent = `${Number(d.score ?? 2000).toLocaleString()}P`;
        const day = document.getElementById('mg-day');
        if (day) day.textContent = d.free ? '테스트 기간 · 무료로 마음껏 연습' : d.test_day ? `테스트 ${d.test_day}일차 · 게임마다 하루 1번` : '게임마다 하루 1번 도전';
        const rule = document.getElementById('mg-rule');
        if (rule) setHtmlIfChanged(rule, d.free
            ? '<div><span>테스트 기간</span><b>무료</b></div><div><span>도전 횟수</span><b>무제한</b></div><div><span>포인트</span><b>반영 안 됨</b></div>'
            : '<div><span>도전</span><b>-10P</b></div><div><span>성공 시</span><b class="up">최대 +20P</b></div><div><span>횟수</span><b>하루 1번</b></div>');
    }
    const slots = (d && d.slots) || Array.from({ length: 9 }, (_, i) => ({ slot: i + 1, status: 'ready' }));
    grid.innerHTML = slots.map(s => {
        const g = MINIGAMES[s.slot];
        let cls = 'soon', chip = '준비 중';
        if (g) {
            if (s.status === 'success') { cls = 'done ok'; chip = `성공 +${s.reward}P`; }
            else if (s.status === 'fail') { cls = 'done'; chip = '실패'; }
            else if (s.status === 'playing') { cls = 'done'; chip = '도전 종료'; }
            else { cls = 'ready'; chip = d && d.free ? '연습 · 무료' : '도전 · 10P'; }
        }
        return `<button class="mg-card ${cls}" onclick="openMinigame(${s.slot})">
            <span class="mg-no">${String(s.slot).padStart(2, '0')}</span>
            <span class="mg-title">${g ? g.title : `미니게임 ${s.slot}`}</span>
            <span class="mg-chip">${chip}</span>
        </button>`;
    }).join('');
}

function openMinigame(slot) {
    const g = MINIGAMES[slot];
    if (!g) { showToast('준비 중인 미니게임이에요. 곧 열려요.'); return; }
    const rec = _mgState && !_mgState.free && _mgState.slots.find(x => x.slot === slot);
    if (rec && rec.status !== 'ready') { showToast('오늘은 이미 도전했어요. 내일 다시 도전하세요.'); return; }
    g.open(slot);
}

// 도전 시작 (10P 차감). 성공하면 true
function mgStartChallenge(slot) {
    return fetch('/api/minigames/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slot })
    })
        .then(r => r.json())
        .then(d => {
            if (d.status !== 'success') { showToast(d.message || '도전할 수 없어요.'); loadMinigames(); return false; }
            _mgState = d; renderMinigames(d);
            return true;
        })
        .catch(() => { showToast('연결이 불안정해요. 다시 시도해 주세요.'); return false; });
}

// 도전 끝 (성공이면 보상 지급). quiet이면 게임 화면이 결과를 보여 주므로 알림 생략
function finishMinigame(slot, success, reward, quiet) {
    return fetch('/api/minigames/finish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot, success: !!success, reward: reward || 0 })
    })
        .then(r => r.json())
        .then(d => {
            if (d.status !== 'success') return d;
            _mgState = d; renderMinigames(d);
            const sc = document.getElementById('lobby-my-score');
            if (sc) sc.innerText = `${Number(d.score).toLocaleString()}P`;
            if (!quiet) {
                const rec = d.slots.find(x => x.slot === slot);
                showToast(rec && rec.status === 'success' ? `성공! +${rec.reward}P` : '아쉽게 실패했어요.');
            }
            return d;
        })
        .catch(() => {});
}
