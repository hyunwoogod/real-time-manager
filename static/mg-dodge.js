// ================= 미니게임 1: 볼보이의 야구공 피하기 =================
// 파울라인 옆 간이의자에 앉은 볼보이에게 강습 타구가 정면으로 날아옴.
// 볼보이는 의자를 들고 피함: 땅볼 → 점프 / 몸쪽 → 아무 옆으로 / 왼쪽·오른쪽 → 반대쪽으로. 목숨 3개.
// 투수 템포는 일정하고, 타구 속도는 공마다 무작위 (강습 ~ 느린 타구)
// 보상: 피한 공 5개 +10P, 10개 +15P, 15개 이상 +20P (5개 미만 실패)

// 판정 여유: 공이 도착한 뒤 조금 늦게 눌러도 인정 (ms)
const DODGE_GRACE = 200;
const DODGE_TIERS = [[15, 20], [10, 15], [5, 10]];
const mgFree = () => !!(typeof _mgState !== 'undefined' && _mgState && _mgState.free);

function dodgeReward(n) {
    for (const [cnt, p] of DODGE_TIERS) if (n >= cnt) return p;
    return 0;
}

// 마스코트 그림체(굵은 남색 외곽선 · 빨강/남색 투톤 모자 M · 진한 눈썹 · 줄무늬 유니폼)의 볼보이
const BALLBOY_SVG = `
<svg class="bb" viewBox="0 0 200 290" aria-hidden="true">
  <defs>
    <pattern id="bb-stripe" width="9" height="10" patternUnits="userSpaceOnUse">
      <rect width="9" height="10" fill="#d42a3c"/><rect x="6.5" width="1.6" height="10" fill="#7f1d2d"/>
    </pattern>
  </defs>
  <g stroke="#17183b" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">
    <!-- 바닥 그림자 -->
    <ellipse class="bb-shadow" cx="100" cy="279" rx="62" ry="9" fill="rgba(0,0,0,0.35)" stroke="none"/>
    <!-- 간이의자 (앉아 있을 때) -->
    <g class="bb-stool-sit">
      <path d="M70 212 L130 274 M130 212 L70 274" stroke="#9aa6b8" stroke-width="7"/>
      <rect x="34" y="198" width="132" height="17" rx="7" fill="#1f7a55"/>
      <path d="M40 206 h120" stroke="#2fa673" stroke-width="3"/>
    </g>
    <g class="bb-body">
      <!-- 다리: 앉은 자세 / 선 자세 -->
      <g class="bb-legs-sit">
        <path d="M60 188 h80 v18 q0 12 -12 12 h-56 q-12 0 -12 -12z" fill="#24346e"/>
        <path d="M66 212 l20 2 l-8 40 h-22z M134 212 l-20 2 l8 40 h22z" fill="#24346e"/>
        <path d="M48 252 h34 q6 0 6 8 v6 h-42 v-6 q0 -8 2 -8z M118 252 h34 q2 0 2 8 v6 h-42 v-6 q0 -8 6 -8z" fill="#1c1d33"/>
        <path d="M46 266 h42 M112 266 h42" stroke="#e7ecf5" stroke-width="4"/>
      </g>
      <g class="bb-legs-stand">
        <path d="M66 188 h68 l-4 70 h-24 l-6 -48 l-6 48 h-24z" fill="#24346e"/>
        <path d="M56 254 h36 q6 0 6 8 v6 h-44 v-6 q0 -8 2 -8z M108 254 h36 q2 0 2 8 v6 h-44 v-6 q0 -8 6 -8z" fill="#1c1d33"/>
      </g>
      <!-- 몸통: 줄무늬 유니폼 + 남색 소매 -->
      <path d="M60 140 q4 -16 22 -18 h36 q18 2 22 18 l4 52 h-88z" fill="url(#bb-stripe)"/>
      <path d="M86 122 l14 18 l14 -18" fill="none" stroke="#24346e" stroke-width="5"/>
      <rect x="56" y="186" width="88" height="10" rx="3" fill="#24346e"/>
      <!-- 팔: 쉬는 자세 / 막기 / 점프·피하기(만세) -->
      <g class="bb-arms-rest">
        <path d="M62 134 q-16 14 -12 60" fill="none" stroke="#24346e" stroke-width="17"/>
        <path d="M138 134 q16 14 12 60" fill="none" stroke="#24346e" stroke-width="17"/>
        <circle cx="52" cy="200" r="11" fill="#f6c39b"/><circle cx="148" cy="200" r="11" fill="#f6c39b"/>
      </g>
      <g class="bb-arms-up">
        <path d="M62 136 q-30 -30 -26 -100" fill="none" stroke="#24346e" stroke-width="17"/>
        <path d="M138 136 q30 -30 26 -100" fill="none" stroke="#24346e" stroke-width="17"/>
      </g>
      <!-- 머리 -->
      <g class="bb-head">
        <ellipse cx="100" cy="94" rx="50" ry="45" fill="#f8cba4"/>
        <!-- 양귀 헬멧: 빨강 쉘 + 남색 옆판 · 양쪽 귀덮개 · M -->
        <path d="M42 116 C32 62 46 22 100 21 C154 22 168 62 158 116 Q150 124 138 118 L136 90 Q100 78 64 90 L62 118 Q50 124 42 116 Z" fill="#d42a3c"/>
        <path d="M124 26 C150 34 166 60 158 116 Q150 124 138 118 L136 90 Q130 86 124 85 Z" fill="#24346e"/>
        <path d="M60 40 Q80 26 104 27" fill="none" stroke="#ffffff" stroke-width="5" opacity="0.45"/>
        <circle cx="52" cy="102" r="6" fill="#17183b" stroke-width="2"/><circle cx="148" cy="102" r="6" fill="#17183b" stroke-width="2"/>
        <circle cx="52" cy="102" r="1.8" fill="#9aa6b8" stroke="none"/><circle cx="148" cy="102" r="1.8" fill="#9aa6b8" stroke="none"/>
        <text x="96" y="66" text-anchor="middle" font-size="26" font-weight="900" font-family="Arial Black, Arial, sans-serif"
              fill="#d42a3c" stroke="#ffffff" stroke-width="2.5" paint-order="stroke">M</text>
        <path d="M60 84 Q100 72 140 84 Q138 93 100 93 Q62 93 60 84Z" fill="#24346e"/>
        <!-- 얼굴: 기본(결의) -->
        <g class="bb-face-normal">
          <path d="M66 96 L89 103 M134 96 L111 103" stroke-width="6"/>
          <ellipse cx="79" cy="112" rx="8" ry="10" fill="#1e2a5a" stroke="none"/>
          <ellipse cx="121" cy="112" rx="8" ry="10" fill="#1e2a5a" stroke="none"/>
          <circle cx="82" cy="108" r="3" fill="#fff" stroke="none"/><circle cx="124" cy="108" r="3" fill="#fff" stroke="none"/>
          <path d="M92 131 Q100 126 108 131" fill="none" stroke-width="3.5"/>
        </g>
        <!-- 얼굴: 깜짝 -->
        <g class="bb-face-alert">
          <path d="M66 92 Q77 84 89 90 M134 92 Q123 84 111 90" fill="none" stroke-width="5"/>
          <circle cx="79" cy="111" r="11" fill="#fff"/><circle cx="121" cy="111" r="11" fill="#fff"/>
          <circle cx="79" cy="112" r="4.5" fill="#1e2a5a" stroke="none"/><circle cx="121" cy="112" r="4.5" fill="#1e2a5a" stroke="none"/>
          <ellipse cx="100" cy="132" rx="7" ry="8" fill="#9b1c2c" stroke-width="3"/>
        </g>
        <!-- 얼굴: 맞음 -->
        <g class="bb-face-hit">
          <path d="M71 104 l16 14 M87 104 l-16 14 M113 104 l16 14 M129 104 l-16 14" stroke-width="5"/>
          <path d="M88 132 q6 -6 12 0 q6 6 12 0" fill="none" stroke-width="3.5"/>
        </g>
        <ellipse cx="66" cy="124" rx="7" ry="4" fill="#f59e9e" stroke="none" opacity="0.6"/>
        <ellipse cx="134" cy="124" rx="7" ry="4" fill="#f59e9e" stroke="none" opacity="0.6"/>
      </g>
    </g>
    <!-- 머리 위로 든 간이의자 (점프 · 피하기) -->
    <g class="bb-stool-hold">
      <path d="M58 -34 L142 14 M142 -34 L58 14" stroke="#9aa6b8" stroke-width="6"/>
      <rect x="22" y="8" width="156" height="16" rx="7" fill="#1f7a55"/>
      <path d="M28 16 h144" stroke="#2fa673" stroke-width="3"/>
      <circle cx="36" cy="28" r="11" fill="#f6c39b"/><circle cx="164" cy="28" r="11" fill="#f6c39b"/>
    </g>
    <!-- 맞았을 때 별 -->
    <g class="bb-stars" fill="#fde047" stroke-width="2.5">
      <path d="M40 30 l4 9 9 1 -7 6 2 9 -8 -5 -8 5 2 -9 -7 -6 9 -1z"/>
      <path d="M160 22 l3 7 7 1 -5 5 1 7 -6 -4 -6 4 1 -7 -5 -5 7 -1z"/>
    </g>
  </g>
  <!-- 깜짝 말풍선 -->
  <g class="bb-bang">
    <rect x="146" y="2" width="34" height="38" rx="10" fill="#fff" stroke="#17183b" stroke-width="3.5"/>
    <text x="163" y="33" text-anchor="middle" font-size="30" font-weight="900" fill="#e11d48" font-family="Arial Black, Arial, sans-serif">!</text>
  </g>
</svg>`;

const DODGE_ACTIONS = {
    left: { label: '피하기', icon: '<path d="M15 5l-7 7 7 7"/>', ms: 600 },
    jump: { label: '점프', icon: '<path d="M12 19V6M6 11l6-6 6 6"/>', ms: 700 },
    right: { label: '피하기', icon: '<path d="M9 5l7 7-7 7"/>', ms: 600 },
};
// 공 종류 → 살아남는 동작
const DODGE_BALLS = {
    ground: { need: ['jump'], hint: '점프!', call: '땅볼이 옵니다!' },
    chest: { need: ['left', 'right'], hint: '옆으로 피하기!', call: '몸쪽으로 공이 옵니다!' },
    left: { need: ['right'], hint: '오른쪽으로 피하기!', call: '왼쪽으로 공이 옵니다!' },
    right: { need: ['left'], hint: '왼쪽으로 피하기!', call: '오른쪽으로 공이 옵니다!' },
};

const DodgeGame = {
    el: null, slot: 1, running: false,

    open(slot) {
        this.slot = slot;
        if (!this.el) this.build();
        this.showIntro();
        this.el.classList.add('active');
    },

    build() {
        const el = document.createElement('div');
        el.className = 'dg';
        el.innerHTML = `
            <div class="dg-top">
                <button class="dg-x" aria-label="닫기">×</button>
                <div class="dg-title">볼보이의 야구공 피하기</div>
                <div class="dg-lives"></div>
            </div>
            <div class="dg-hud"><span>피한 공 <b class="dg-count">0</b></span><span class="dg-next"></span></div>
            <div class="dg-stage">
                <div class="dg-sky"><i></i><i></i><i></i></div>
                <div class="dg-stands"></div>
                <div class="dg-grass"></div>
                <div class="dg-dirt"></div>
                <div class="dg-foul"></div>
                <div class="dg-mound"></div>
                <div class="dg-pitcher"><svg viewBox="0 0 40 60"><g fill="#0b1224"><circle cx="20" cy="10" r="6"/><path d="M13 18h14l2 20h-5l-2 20h-4l-2-20-2 20h-4l-2-20h-3z"/></g><path class="dg-parm" d="M27 21 L36 12" stroke="#0b1224" stroke-width="4.5" stroke-linecap="round"/><path class="dg-glove" d="M13 21 L6 28" stroke="#0b1224" stroke-width="4.5" stroke-linecap="round"/></svg></div>
                <div class="dg-batter"><svg viewBox="0 0 40 60"><g fill="#0b1224" stroke="none"><circle cx="20" cy="10" r="6"/><path d="M13 18h14l2 20h-5l-2 20h-4l-2-20-2 20h-4l-2-20h-3z"/></g><path class="dg-bat" d="M24 22 L38 6" stroke="#c08a52" stroke-width="3.5" stroke-linecap="round"/></svg></div>
                <div class="dg-crack">딱!</div>
                <div class="dg-ring"></div>
                <div class="dg-bshadow"></div>
                <div class="dg-ball"></div>
                <div class="dg-hint"></div>
                <div class="dg-call"></div>
                <div class="dg-boy st-sit">${BALLBOY_SVG}</div>
                <div class="dg-flash"></div>
                <div class="dg-panel"></div>
            </div>
            <div class="dg-pad">
                ${Object.entries(DODGE_ACTIONS).map(([k, a]) => `
                    <button class="dg-btn dg-${k}" data-act="${k}">
                        <svg viewBox="0 0 24 24">${a.icon}</svg><span>${a.label}</span>
                    </button>`).join('')}
            </div>`;
        document.getElementById('app').appendChild(el);
        this.el = el;
        const $ = s => el.querySelector(s);
        this.$ = { stage: $('.dg-stage'), boy: $('.dg-boy'), ball: $('.dg-ball'), shadow: $('.dg-bshadow'),
            ring: $('.dg-ring'), hint: $('.dg-hint'), call: $('.dg-call'), panel: $('.dg-panel'), count: $('.dg-count'),
            next: $('.dg-next'), lives: $('.dg-lives'), batter: $('.dg-batter'), pitcher: $('.dg-pitcher'), crack: $('.dg-crack'), flash: $('.dg-flash') };
        $('.dg-x').onclick = () => this.close();
        el.querySelectorAll('.dg-btn').forEach(b => {
            b.addEventListener('pointerdown', e => { e.preventDefault(); this.act(b.dataset.act); });
        });
        this._key = e => {
            if (!this.el.classList.contains('active')) return;
            const k = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'jump', ' ': 'jump' }[e.key];
            if (k) { e.preventDefault(); this.act(k); }
        };
        document.addEventListener('keydown', this._key);
    },

    panel(html) {
        this.$.panel.innerHTML = html;
        this.$.panel.classList.toggle('show', !!html);
    },

    showIntro() {
        this.reset();
        this.panel(`
            <div class="dg-card">
                <h3>볼보이의 야구공 피하기</h3>
                <p>파울라인 밖 볼보이에게 타구가 날아와요.<br>강습도, 느린 공도 있어요. 의자를 들고 피하세요!</p>
                <ul class="dg-rules">
                    <li><b>땅볼</b><span>점프</span></li>
                    <li><b>왼쪽 · 오른쪽 공</b><span>반대쪽으로 피하기</span></li>
                    <li><b>몸쪽 공</b><span>아무 옆으로나 피하기</span></li>
                </ul>
                <div class="dg-reward">
                    <div><span>5개</span><b>+10P</b></div><div><span>10개</span><b>+15P</b></div><div><span>15개</span><b>+20P</b></div>
                </div>
                <p class="dg-small">${mgFree() ? '테스트 기간 · 무료 · 무제한 연습 (포인트는 반영 안 돼요)' : '목숨 3개 · 도전하면 10P가 빠져요 · 하루 1번'}</p>
                <button class="dg-go">${mgFree() ? '시작하기' : '도전하기 · 10P'}</button>
            </div>`);
        this.$.panel.querySelector('.dg-go').onclick = () => this.begin();
    },

    begin() {
        const go = this.$.panel.querySelector('.dg-go');
        if (go) { go.disabled = true; go.textContent = '준비 중...'; }
        mgStartChallenge(this.slot).then(ok => {
            if (!ok) { this.close(true); return; }
            this.panel('');
            this.countdown(3);
        });
    },

    countdown(n) {
        this.panel(n > 0 ? `<div class="dg-count-big">${n}</div>` : '<div class="dg-count-big go">PLAY BALL</div>');
        if (n > 0) setTimeout(() => this.countdown(n - 1), 700);
        else setTimeout(() => { this.panel(''); this.start(); }, 650);
    },

    reset() {
        cancelAnimationFrame(this._raf);
        clearTimeout(this._actT); clearTimeout(this._nextT); clearTimeout(this._poseT);
        this.running = false; this.over = false;
        this.n = 0; this.lives = 3; this.ballObj = null; this.acts = []; this.action = null; this.actionUntil = 0;
        this.setPose('sit');
        this.$.ball.style.opacity = 0; this.$.shadow.style.opacity = 0; this.$.ring.className = 'dg-ring';
        this.$.hint.className = 'dg-hint';
        this.$.call.className = 'dg-call';
        this.renderHud();
    },

    renderHud() {
        this.$.count.textContent = this.n;
        this.$.lives.innerHTML = [0, 1, 2].map(i => `<i class="${i < this.lives ? 'on' : ''}"></i>`).join('');
        const next = [...DODGE_TIERS].reverse().find(([c]) => this.n < c);
        this.$.next.textContent = next ? `${next[0] - this.n}개 더 피하면 +${next[1]}P` : '최대 보상 +20P 달성';
    },

    setPose(p) {
        this.$.boy.className = `dg-boy st-${p}`;
    },

    start() {
        this.running = true;
        this.scheduleNext(500);
    },

    scheduleNext(delay) {
        this._nextT = setTimeout(() => this.launch(), delay);
    },

    // 1) 투수 와인드업 → 2) 공이 홈플레이트로 → 3) 타자가 침 → 4) 타구가 볼보이에게
    launch() {
        if (!this.running) return;
        const n = this.n;
        const type = n < 4 ? ['ground', 'chest', 'left', 'right'][n] : ['ground', 'chest', 'left', 'right'][Math.floor(Math.random() * 4)];
        // 타구 속도: 공마다 무작위 (강습 ~ 느린 타구). 갈수록 강습이 섞일 확률이 높아짐
        const slow = Math.max(1050, 1750 - n * 30), fast = Math.max(520, 880 - n * 18);
        const dur = Math.round(fast + (slow - fast) * Math.pow(Math.random(), 1 + n * 0.06));
        const pdur = 480; // 투구 템포는 항상 같음
        this.ballObj = { type, dur, pdur, phase: 'windup', judged: false };
        this.$.pitcher.classList.remove('throw'); void this.$.pitcher.offsetWidth; this.$.pitcher.classList.add('throw');
        // 와인드업 뒤 공을 놓음
        this._nextT = setTimeout(() => {
            if (!this.running || this.ballObj?.phase !== 'windup') return;
            this.ballObj.phase = 'pitch'; this.ballObj.t0 = performance.now();
            this.$.ball.style.opacity = 1; this.$.shadow.style.opacity = 0;
            this.loop();
        }, 420);
    },

    // 타자가 공을 침: 스윙 · 딱! · 볼보이 깜짝 · 도착 지점 표시
    contact(b) {
        b.phase = 'hit'; b.t0 = b.t0 + b.pdur; // 화면 갱신이 늦어도 타격 시각은 정확하게
        const type = b.type, n = this.n;
        this.$.batter.classList.remove('swing'); void this.$.batter.offsetWidth; this.$.batter.classList.add('swing');
        // 강습이면 큰 '딱!!', 느린 타구면 '툭'
        const speed = b.dur < 800 ? 'hard' : b.dur > 1350 ? 'soft' : '';
        this.$.crack.textContent = speed === 'hard' ? '딱!!' : speed === 'soft' ? '툭' : '딱!';
        this.$.crack.className = 'dg-crack'; void this.$.crack.offsetWidth; this.$.crack.className = `dg-crack show ${speed}`;
        if (!this.action) {
            this.setPose('alert');
            clearTimeout(this._poseT);
            this._poseT = setTimeout(() => { if (!this.action && this.running) this.setPose('sit'); }, 420);
        }
        const g = this.geom(), tg = g.targets[type], r = (type === 'ground' ? 60 : 46) * g.s;
        Object.assign(this.$.ring.style, { width: `${r}px`, height: `${type === 'ground' ? r * 0.4 : r}px`,
            transform: `translate(${tg.x - r / 2}px, ${(type === 'ground' ? g.gy - 4 * g.s : tg.y) - (type === 'ground' ? r * 0.2 : r / 2)}px)` });
        this.$.ring.className = `dg-ring show ${type === 'ground' ? 'flat' : ''}`;
        this.$.hint.style.top = `${(type === 'ground' ? g.gy - 40 * g.s : tg.y - 52 * g.s)}px`;
        // 처음 몇 개는 무엇을 눌러야 하는지 알려 줌
        if (n < 4) { this.$.hint.textContent = DODGE_BALLS[type].hint; this.$.hint.className = 'dg-hint show'; }
        // 화면 위에 크게: 어느 쪽으로 공이 오는지
        this.$.call.textContent = DODGE_BALLS[type].call;
        this.$.call.className = 'dg-call'; void this.$.call.offsetWidth; this.$.call.className = `dg-call show c-${type}`;
    },

    geom() {
        const st = this.$.stage.getBoundingClientRect(), bb = this.$.boy.getBoundingClientRect();
        const W = st.width, H = st.height;
        const vp = { x: W * 0.5, y: H * 0.27 };
        const L = bb.left - st.left, T = bb.top - st.top, w = bb.width, h = bb.height;
        const cx = L + w / 2, gy = T + h * 0.96, s = w / 170;
        const targets = {
            ground: { x: cx + 4 * s, y: T + h * 0.88 },
            chest: { x: cx, y: T + h * 0.56 },
            left: { x: cx - w * 0.46, y: T + h * 0.42 },
            right: { x: cx + w * 0.46, y: T + h * 0.42 },
        };
        const mound = { x: W * 0.24 + 6, y: H * 0.255 };   // 투수 손 (와인드업 뒤 공을 놓는 위치)
        const plate = { x: vp.x + 4, y: vp.y - H * 0.035 }; // 타자가 공을 맞히는 위치
        return { W, H, vp, gy, bx: cx, s, targets, mound, plate };
    },

    loop() {
        cancelAnimationFrame(this._raf);
        const step = now => {
            const b = this.ballObj;
            if (!b) return;
            const g = this.geom();
            if (b.phase === 'pitch') {
                // 투구: 투수 손 → 홈플레이트 (작은 공, 살짝 포물선)
                const p = Math.min(1, (now - b.t0) / b.pdur);
                const px = g.mound.x + (g.plate.x - g.mound.x) * p;
                const py = g.mound.y + (g.plate.y - g.mound.y) * p - Math.sin(p * Math.PI) * 6;
                const sz = 5 * g.s;
                const bs0 = this.$.ball.style;
                bs0.width = bs0.height = `${sz}px`;
                bs0.transform = `translate(${px - sz / 2}px, ${py - sz / 2}px)`;
                if (p >= 1) this.contact(b);
                this._raf = requestAnimationFrame(step);
                return;
            }
            if (b.phase !== 'hit') return;
            this.$.shadow.style.opacity = 0.6;
            let t = (now - b.t0) / b.dur;
            const tg = g.targets[b.type];
            // 원근: 멀리서는 느리게, 가까워질수록 빠르고 크게
            const e = Math.pow(Math.max(0, t), 1.9);
            // 왼쪽·오른쪽 공은 처음부터 그쪽 길로 날아옴 (끝에서 꺾이지 않게)
            const ex = b.type === 'left' || b.type === 'right' ? Math.pow(Math.max(0, t), 1.05) : e;
            let x = g.plate.x + (tg.x - g.plate.x) * ex;
            let y = g.plate.y + (tg.y - g.plate.y) * e;
            const shY = g.vp.y + 6 + (g.gy - g.vp.y) * e;
            if (b.type === 'ground') y -= Math.abs(Math.sin(t * Math.PI * 3.2)) * 26 * g.s * (0.3 + e);
            if (b.result === 'hit' && t > 1) {
                const k = t - 1; x += k * 160 * g.s * (b.dir || 1); y += k * k * 500 * g.s - k * 180 * g.s;
            }
            const size = (6 + 40 * e) * g.s;
            const bs = this.$.ball.style;
            bs.width = bs.height = `${size}px`;
            bs.transform = `translate(${x - size / 2}px, ${y - size / 2}px) rotate(${t * 900}deg)`;
            const ss = this.$.shadow.style;
            ss.width = `${size * 1.1}px`; ss.height = `${size * 0.35}px`;
            ss.transform = `translate(${x - size * 0.55}px, ${shY - size * 0.17}px)`;
            ss.opacity = b.result && t > 1 ? 0 : 0.6;

            if (!b.judged && now >= b.t0 + b.dur + DODGE_GRACE) this.judge(b);
            if (t > 1.55) { this.endBall(); return; }
            this._raf = requestAnimationFrame(step);
        };
        this._raf = requestAnimationFrame(step);
    },

    act(a) {
        if (!this.running || this.over) return;
        const now = performance.now();
        this.action = a; this.actionUntil = now + DODGE_ACTIONS[a].ms;
        this.acts = (this.acts || []).filter(x => x.end > now - 2000).concat([{ a, start: now, end: this.actionUntil }]);
        this.setPose(a);
        this.el.querySelector(`.dg-${a}`)?.classList.add('press');
        clearTimeout(this._actT);
        this._actT = setTimeout(() => {
            this.action = null;
            this.el.querySelectorAll('.dg-btn.press').forEach(x => x.classList.remove('press'));
            if (this.running && !this.over) this.setPose('sit');
        }, DODGE_ACTIONS[a].ms);
    },

    judge(b) {
        b.judged = true;
        this.$.ring.className = 'dg-ring';
        this.$.hint.className = 'dg-hint';
        this.$.call.className = 'dg-call';
        const need = DODGE_BALLS[b.type].need;
        // 공이 도착한 그 순간에 알맞은 동작 중이었는지 (화면 갱신 속도와 무관)
        // 동작을 '공 도착 전 동작 시간 이내' ~ '도착 후 조금 뒤' 사이에 시작했으면 성공
        const impact = b.t0 + b.dur;
        const ok = (this.acts || []).some(x => need.includes(x.a)
            && x.start >= impact - DODGE_ACTIONS[x.a].ms && x.start <= impact + DODGE_GRACE);
        if (ok) {
            this.n += 1;
            b.result = 'pass';
            this.flash('good');
        } else {
            b.result = 'hit'; b.dir = b.type === 'right' ? 1 : -1;
            this.lives -= 1;
            clearTimeout(this._actT); this.action = null;
            this.setPose('hit');
            this.flash('bad');
            this.$.stage.classList.remove('shake'); void this.$.stage.offsetWidth; this.$.stage.classList.add('shake');
            clearTimeout(this._poseT);
            this._poseT = setTimeout(() => { if (this.running) this.setPose('sit'); }, 700);
        }
        this.renderHud();
    },

    flash(kind) {
        const f = this.$.flash;
        f.className = 'dg-flash'; void f.offsetWidth; f.className = `dg-flash ${kind}`;
    },

    endBall() {
        this.ballObj = null;
        this.$.ball.style.opacity = 0; this.$.shadow.style.opacity = 0;
        if (this.lives <= 0) { this.gameOver(); return; }
        this.scheduleNext(600); // 투수 템포 일정
    },

    gameOver() {
        this.running = false; this.over = true;
        clearTimeout(this._nextT);
        const reward = dodgeReward(this.n);
        this.panel(`<div class="dg-card"><h3>경기 종료</h3><p>결과를 저장하는 중...</p></div>`);
        finishMinigame(this.slot, reward > 0, reward, true).then(() => {
            this.panel(`
                <div class="dg-card">
                    <h3>${reward > 0 ? '성공!' : '아쉽게 실패'}</h3>
                    <div class="dg-result"><span>피한 공</span><b>${this.n}개</b></div>
                    <div class="dg-gain ${reward > 0 ? 'up' : ''}">${reward > 0 ? `+${reward}P` : '보상 없음'}</div>
                    <p class="dg-small">${mgFree() ? '테스트 기간이라 포인트는 반영되지 않아요' : reward > 0 ? '내일 다시 도전할 수 있어요' : '5개 이상 피하면 성공이에요 · 내일 다시 도전하세요'}</p>
                    ${mgFree() ? '<button class="dg-go dg-again">다시 하기</button><button class="dg-sub">닫기</button>' : '<button class="dg-go">확인</button>'}
                </div>`);
            const again = this.$.panel.querySelector('.dg-again');
            if (again) {
                again.onclick = () => { this.reset(); this.panel(''); this.countdown(3); };
                this.$.panel.querySelector('.dg-sub').onclick = () => this.close(true);
            } else this.$.panel.querySelector('.dg-go').onclick = () => this.close(true);
        });
    },

    close(force) {
        if (this.running && !force) {
            if (!confirm('지금 나가면 이번 도전이 여기서 끝나요. 나갈까요?')) return;
            this.running = false;
            cancelAnimationFrame(this._raf);
            const reward = dodgeReward(this.n);
            finishMinigame(this.slot, reward > 0, reward);
        }
        this.reset();
        this.panel('');
        this.el.classList.remove('active');
    },
};

if (typeof MINIGAMES !== 'undefined') {
    MINIGAMES[1] = { title: '볼보이의 야구공 피하기', open: slot => DodgeGame.open(slot) };
}
