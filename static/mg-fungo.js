// ================= 미니게임 2: 지옥의 펑고 =================
// 유격수 자리에서 홈을 바라봄. 코치가 펑고로 땅볼을 왼쪽·정면·오른쪽으로 쳐 줌.
// 공 방향 버튼을 누르고 있으면 그쪽으로 가서 포구 → 누른 채로 게이지가 오르내림 → 가운데 빨간 구역에서 손을 떼면 정확한 송구(아웃).
// 빨간 구역 밖에서 떼면 악송구, 버튼을 안 누르거나 다른 방향이면 공이 빠짐 = 실책. 실책 3개면 끝.
// 보상: 아웃 5개 +10P, 10개 +15P, 15개 이상 +20P (볼보이 게임과 같음)

const FUNGO_TIERS = [[15, 20], [10, 15], [5, 10]];
const FUNGO_JUDGE_DELAY = 40;          // 도착 판정 타이머 여유 (ms) — 늦게 누른 것은 인정하지 않음
const FUNGO_FIELDER = { x: -9.5, y: 31 }; // 유격수 위치 (m)
const FUNGO_REACH = 1.19;              // 다이빙해서 잡는 거리 (m) — 다이빙 후 글러브 위치와 맞춤

function fungoReward(n) {
    for (const [cnt, p] of FUNGO_TIERS) if (n >= cnt) return p;
    return 0;
}

function fungoCam() {
    const F = FUNGO_FIELDER, d = Math.hypot(F.x, F.y), ux = -F.x / d, uy = -F.y / d;
    return { C: { x: F.x - ux * 4.0, y: F.y - uy * 4.0, z: 2.4 }, look: { x: 0, y: 0 }, lookY: 0.3, vfov: 74 }; // 다이빙해도 화면 안에 들어오는 거리
}

// 내야수 뒷모습 (마스코트 그림체: 빨강·남색 모자, 줄무늬 유니폼, 글러브)
const FIELDER_SVG = `
<svg class="bb" viewBox="-230 -200 660 490" aria-hidden="true">
  <defs>
    <symbol id="fb-glove" viewBox="0 0 40 40">
      <path d="M8 30 C3 22 4 12 8 8 C10 4 14 4 16 7 L18 4 C20 1 24 1 26 4 L28 7 C31 4 36 6 35 11 L35 24 C35 33 28 38 20 38 C14 38 10 35 8 30Z" fill="#dd7a2c" stroke="#17183b" stroke-width="3" stroke-linejoin="round"/>
      <path d="M14 11 L14 24 M21 8 L21 24 M28 10 L28 24" stroke="#8a3c12" stroke-width="2.2" stroke-linecap="round"/>
    </symbol>
    <pattern id="fb-stripe-h" width="10" height="9" patternUnits="userSpaceOnUse">
      <rect width="10" height="9" fill="#d42a3c"/><rect y="6.5" width="10" height="1.6" fill="#7f1d2d"/>
    </pattern>
    <pattern id="fb-stripe" width="9" height="10" patternUnits="userSpaceOnUse">
      <rect width="9" height="10" fill="#d42a3c"/><rect x="6.5" width="1.6" height="10" fill="#7f1d2d"/>
    </pattern>
  </defs>
  <g stroke="#17183b" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">
    <ellipse cx="100" cy="279" rx="70" ry="9" fill="rgba(0,0,0,0.35)" stroke="none"/>
    <!-- 다이빙 캐치: 몸은 땅과 수평, 글러브 팔만 공 쪽으로 쭉, 반대 팔은 가슴 아래로 접고, 다리는 뒤로 (한쪽 무릎 굽힘), 고개 들어 공 보기 -->
    <g class="fb-dive-wrap"><g class="fb-dive">
      <ellipse cx="60" cy="276" rx="150" ry="10" fill="rgba(0,0,0,0.32)" stroke="none"/>
      <path d="M160 236 L252 220" fill="none" stroke="#24346e" stroke-width="24"/>
      <path d="M160 248 Q206 266 234 246" fill="none" stroke="#24346e" stroke-width="22"/>
      <path d="M248 206 l22 -4 l4 24 l-22 4z M228 238 l20 -8 l8 20 l-20 8z" fill="#1c1d33"/>
      <rect x="36" y="210" width="134" height="54" rx="24" fill="url(#fb-stripe-h)"/>
      <rect x="150" y="210" width="12" height="54" rx="3" fill="#24346e"/>
      <text class="fb-num-l" x="100" y="250" text-anchor="middle" font-size="36" font-weight="900" font-family="Arial Black, Arial, sans-serif"
            fill="#fff" stroke="#24346e" stroke-width="3" paint-order="stroke" transform="rotate(-90 100 238)">6</text>
      <text class="fb-num-r" x="100" y="250" text-anchor="middle" font-size="36" font-weight="900" font-family="Arial Black, Arial, sans-serif"
            fill="#fff" stroke="#24346e" stroke-width="3" paint-order="stroke" transform="translate(200 0) scale(-1 1) rotate(-90 100 238)">6</text>
      <path d="M62 256 Q40 274 72 276" fill="none" stroke="#24346e" stroke-width="16"/>
      <circle cx="76" cy="274" r="10" fill="#f6c39b"/>
      <path d="M46 222 Q-14 210 -84 230" fill="none" stroke="#24346e" stroke-width="17"/>
      <use href="#fb-glove" x="-136" y="204" width="56" height="56"/>
      <circle cx="16" cy="226" r="30" fill="#f6c39b"/>
      <path d="M-12 222 C-14 190 14 182 34 192 C46 200 46 214 42 222 Z" fill="#d42a3c"/>
      <path d="M-12 222 C-14 202 -4 192 8 188 L12 222 Z" fill="#24346e"/>
      <path d="M14 236 Q30 246 42 232" fill="#3a2418" stroke-width="3"/>
      <circle cx="40" cy="232" r="8" fill="#f6c39b"/>
    </g></g>
    <ellipse class="fb-dust fb-dust-l" cx="0" cy="266" rx="120" ry="18" fill="rgba(214,170,110,0.75)" stroke="none"/>
    <ellipse class="fb-dust fb-dust-r" cx="200" cy="266" rx="120" ry="18" fill="rgba(214,170,110,0.75)" stroke="none"/>
    <g class="fb-body">
      <!-- 다리: 낮게 벌린 수비 자세 -->
      <g class="fb-legs-ready">
      <path d="M58 186 h84 l14 50 l-6 30 h-24 l-4 -34 l-22 -10 l-22 10 l-4 34 h-24 l-6 -30 z" fill="#24346e"/>
      <path d="M42 262 h36 v12 h-36z M122 262 h36 v12 h-36z" fill="#1c1d33"/>
      </g>
      <g class="fb-legs-dive">
        <path d="M64 186 h72 l-6 72 h-26 l-4 -40 l-4 40 h-26z" fill="#24346e"/>
        <path d="M70 256 h30 v14 h-30z M100 256 h30 v14 h-30z" fill="#1c1d33"/>
      </g>
      <!-- 등: 줄무늬 유니폼 · 등번호 6 -->
      <path d="M58 128 q4 -16 22 -18 h40 q18 2 22 18 l6 62 h-96z" fill="url(#fb-stripe)"/>
      <path d="M84 112 q16 6 32 0" fill="none" stroke="#24346e" stroke-width="6"/>
      <text x="100" y="176" text-anchor="middle" font-size="42" font-weight="900" font-family="Arial Black, Arial, sans-serif"
            fill="#fff" stroke="#24346e" stroke-width="3" paint-order="stroke">6</text>
      <rect x="54" y="186" width="92" height="10" rx="3" fill="#24346e"/>
      <!-- 팔: 준비 / 왼쪽 / 오른쪽(역모션) / 정면 / 송구 준비 / 송구 -->
      <g class="fa fa-ready">
        <path d="M60 132 q-14 30 -4 70" fill="none" stroke="#24346e" stroke-width="17"/>
        <use href="#fb-glove" x="34" y="186" width="44" height="44"/>
        <path d="M140 132 q14 30 4 70" fill="none" stroke="#24346e" stroke-width="17"/>
        <circle cx="144" cy="206" r="11" fill="#f6c39b"/>
      </g>
      <g class="fa fa-dive">
        <path d="M62 136 q-20 -60 6 -142" fill="none" stroke="#24346e" stroke-width="17"/>
        <path d="M138 136 q20 -60 -6 -142" fill="none" stroke="#24346e" stroke-width="17"/>
        <circle cx="130" cy="-8" r="11" fill="#f6c39b"/>
        <use href="#fb-glove" x="44" y="-44" width="58" height="58"/>
      </g>
      <g class="fa fa-center">
        <path d="M60 132 q4 50 34 90" fill="none" stroke="#24346e" stroke-width="17"/>
        <path d="M140 132 q-4 50 -24 86" fill="none" stroke="#24346e" stroke-width="17"/>
        <circle cx="116" cy="220" r="11" fill="#f6c39b"/>
        <use href="#fb-glove" x="72" y="210" width="50" height="50"/>
      </g>
      <!-- 송구: 글러브 팔은 1루(왼쪽)를 가리키고, 던지는 팔은 공을 귀 옆까지 'ㄴ'자로 → 떼면 팔이 위로 돌아 1루 쪽으로 -->
      <g class="fa fa-throw">
        <g class="fb-garm">
          <path d="M60 132 q-34 -8 -70 -2" fill="none" stroke="#24346e" stroke-width="17"/>
          <use href="#fb-glove" x="-34" y="104" width="44" height="44"/>
        </g>
        <g class="fb-tarm">
          <path d="M140 132 L178 126 L174 78" fill="none" stroke="#24346e" stroke-width="17"/>
          <circle cx="174" cy="70" r="11" fill="#f6c39b"/>
          <circle cx="172" cy="58" r="8" fill="#ffffff" stroke-width="2.5"/>
        </g>
      </g>
      <!-- 머리 뒤: 귀 · 뒷머리 · 모자 (빨강·남색) -->
      <g class="fb-head">
        <circle cx="54" cy="92" r="10" fill="#f6c39b"/><circle cx="146" cy="92" r="10" fill="#f6c39b"/>
        <rect x="84" y="100" width="32" height="20" rx="7" fill="#f0bb92"/>
        <path d="M56 84 Q100 126 144 84 L142 102 Q100 128 58 102 Z" fill="#3a2418"/>
        <path d="M50 88 C44 40 60 22 100 21 C140 22 156 40 150 88 Q100 74 50 88 Z" fill="#d42a3c"/>
        <path d="M76 25 C56 32 46 52 50 88 Q62 84 76 82 Z" fill="#24346e"/>
        <path d="M86 86 Q100 70 114 86 Z" fill="#3a2418" stroke-width="3"/>
        <path d="M118 32 Q138 40 144 56" fill="none" stroke="#ffffff" stroke-width="5" opacity="0.4"/>
        <circle cx="100" cy="22" r="5" fill="#24346e"/>
      </g>
    </g>
  </g>
</svg>`;

const FUNGO_DIRS = {
    left: { label: '왼쪽', when: '왼쪽 땅볼일 때', icon: '<path d="M15 5l-7 7 7 7"/>', call: '왼쪽 땅볼!' },
    center: { label: '정면', when: '정면 땅볼일 때', icon: '<path d="M12 5v14M6 13l6 6 6-6"/>', call: '정면 땅볼!' },
    right: { label: '오른쪽', when: '오른쪽 땅볼일 때', icon: '<path d="M9 5l7 7-7 7"/>', call: '오른쪽 땅볼!' },
};

const FungoGame = {
    el: null, slot: 2,

    open(slot) {
        this.slot = slot;
        if (!this.el) this.build();
        this.showIntro();
        this.el.classList.add('active');
        this.layoutField();
        requestAnimationFrame(() => this.layoutField());
    },

    build() {
        const el = document.createElement('div');
        el.className = 'dg fg';
        el.innerHTML = `
            <div class="dg-top">
                <button class="dg-x" aria-label="닫기">×</button>
                <div class="dg-title">지옥의 펑고</div>
                <div class="fg-errs"></div>
            </div>
            <div class="dg-hud"><span>아웃 <b class="fg-count">0</b></span><span class="dg-next fg-next"></span></div>
            <div class="dg-stage">
                <div class="dg-scene">
                    <canvas class="dg-field fg-field"></canvas>
                    <div class="dg-sky"><i></i><i></i><i></i></div>
                    <div class="dg-fig fg-coach"><svg viewBox="0 0 40 60"><g fill="#0b1224"><circle cx="20" cy="10" r="6"/><path d="M13 18h14l2 20h-5l-2 20h-4l-2-20-2 20h-4l-2-20h-3z"/></g><path class="dg-bat" d="M24 22 L38 6" stroke="#c08a52" stroke-width="3" stroke-linecap="round"/></svg></div>
                    <div class="dg-fig fg-first"><svg viewBox="0 0 40 60"><g fill="#0b1224"><circle cx="20" cy="10" r="6"/><path d="M13 18h14l2 20h-5l-2 20h-4l-2-20-2 20h-4l-2-20h-3z"/></g><circle cx="33" cy="20" r="5" fill="#7c4a1e"/></svg></div>
                </div>
                <div class="dg-crack fg-crack">딱!</div>
                <div class="dg-bshadow fg-shadow"></div>
                <div class="dg-ball fg-ball"></div>
                <div class="dg-hint fg-hint"></div>
                <div class="dg-call fg-call"></div>
                <div class="fg-gauge"><div class="fg-bar"><i class="fg-red"></i><b class="fg-needle"></b></div><span>빨간 구역에서 손을 떼세요</span></div>
                <div class="fg-boy st-ready">${FIELDER_SVG}</div>
                <div class="dg-flash fg-flash"></div>
                <div class="dg-panel fg-panel"></div>
            </div>
            <div class="dg-pad fg-pad">
                ${Object.entries(FUNGO_DIRS).map(([k, a]) => `
                    <button class="dg-btn fg-${k}" data-dir="${k}">
                        <svg viewBox="0 0 24 24">${a.icon}</svg><span>${a.label}</span><small class="dg-when">${a.when}</small>
                    </button>`).join('')}
            </div>`;
        document.getElementById('app').appendChild(el);
        this.el = el;
        const $ = s => el.querySelector(s);
        this.$ = { stage: $('.dg-stage'), boy: $('.fg-boy'), ball: $('.fg-ball'), shadow: $('.fg-shadow'), hint: $('.fg-hint'),
            call: $('.fg-call'), panel: $('.fg-panel'), count: $('.fg-count'), next: $('.fg-next'), errs: $('.fg-errs'),
            gauge: $('.fg-gauge'), red: $('.fg-red'), needle: $('.fg-needle'), coach: $('.fg-coach'), crack: $('.fg-crack'), flash: $('.fg-flash') };
        $('.dg-x').onclick = () => this.close();
        // 누르고 있기 · 떼기 (손가락이 버튼 밖으로 나가도 떼기로)
        el.querySelectorAll('.fg-pad .dg-btn').forEach(b => {
            b.addEventListener('pointerdown', e => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (_) {} this.press(b.dataset.dir); });
            const up = e => { e.preventDefault(); this.release(b.dataset.dir); };
            b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
            b.addEventListener('contextmenu', e => e.preventDefault());
        });
        const keyDir = { ArrowLeft: 'left', ArrowDown: 'center', ArrowUp: 'center', ArrowRight: 'right' };
        document.addEventListener('keydown', e => {
            if (!this.el.classList.contains('active') || e.repeat) return;
            const d = keyDir[e.key]; if (d) { e.preventDefault(); this.press(d); }
        });
        document.addEventListener('keyup', e => {
            if (!this.el.classList.contains('active')) return;
            const d = keyDir[e.key]; if (d) { e.preventDefault(); this.release(d); }
        });
        window.addEventListener('resize', () => { if (this.el.classList.contains('active')) this.layoutField(); });
    },

    // 야구장(빈 관중석 · 야간 연습) + 유격수 · 코치 · 1루수 자리 계산
    layoutField() {
        const cv = this.el.querySelector('.fg-field');
        const fp = drawStadium(cv, { cam: fungoCam(), crowd: false });
        if (!fp) return;
        const cam = makeCamera(fp.W, fp.H, fungoCam());
        this.cam = cam; this.fp = fp;
        const F = FUNGO_FIELDER, pf = cam.proj(F.x, F.y, 0);
        // 유격수 그림: 몸통(0~200, 0~290)을 1.6m 높이로, 발이 땅 위 자리에 오게
        const bodyH = 1.6 * cam.f / pf.z, elH = bodyH * 490 / 290, elW = bodyH * 660 / 290;
        Object.assign(this.$.boy.style, { width: `${elW}px`, height: `${elH}px`, left: `${pf.x - elW * 330 / 660}px`, top: `${pf.y - elH * 478 / 490}px` });
        const place = (e, x, y, hM, ratio, flip) => {
            const p = cam.proj(x, y, 0), h = Math.max(8, hM * 1.8 * cam.f / p.z), w = h * ratio;
            Object.assign(e.style, { left: `${p.x - w / 2}px`, top: `${p.y - h}px`, width: `${w}px`, height: `${h}px`, transform: flip ? 'scaleX(-1)' : 'none' });
        };
        place(this.$.coach, 0.7, -0.4, 1.85, 0.66, true);
        place(this.el.querySelector('.fg-first'), 19.0, 19.9, 1.85, 0.66);
        const hp = cam.proj(0.3, 0.3, 1.2);
        Object.assign(this.$.crack.style, { left: `${hp.x}px`, top: `${hp.y - 30}px`, transform: 'translateX(-50%)' });
    },

    panel(html) { this.$.panel.innerHTML = html; this.$.panel.classList.toggle('show', !!html); },

    showIntro() {
        this.reset();
        this.panel(`
            <div class="dg-card">
                <h3>지옥의 펑고</h3>
                <p>코치가 쉬지 않고 땅볼을 쳐요.<br>잡고, 게이지를 맞춰 1루로 정확히 던지세요!</p>
                <ul class="dg-rules">
                    <li><b>1. 포구</b><span>공 방향 버튼을 누르고 있기</span></li>
                    <li><b>2. 게이지</b><span>누른 채로 기다리기</span></li>
                    <li><b>3. 송구</b><span>빨간 구역에서 손 떼기</span></li>
                </ul>
                <div class="dg-reward">
                    <div><span>5아웃</span><b>+10P</b></div><div><span>10아웃</span><b>+15P</b></div><div><span>15아웃</span><b>+20P</b></div>
                </div>
                <p class="dg-small">${mgFree() ? '테스트 기간 · 무료 · 무제한 연습 (포인트는 반영 안 돼요)' : '실책 3개면 끝 · 도전하면 10P가 빠져요 · 하루 1번'}</p>
                <button class="dg-go">${mgFree() ? '시작하기' : '도전하기 · 10P'}</button>
            </div>`);
        this.$.panel.querySelector('.dg-go').onclick = () => this.begin();
    },

    begin() {
        const go = this.$.panel.querySelector('.dg-go');
        if (go) { go.disabled = true; go.textContent = '준비 중...'; }
        mgStartChallenge(this.slot).then(ok => {
            if (!ok) { this.close(true); return; }
            this.panel(''); this.countdown(3);
        });
    },

    countdown(n) {
        this.panel(n > 0 ? `<div class="dg-count-big">${n}</div>` : '<div class="dg-count-big go">펑고 시작!</div>');
        if (n > 0) setTimeout(() => this.countdown(n - 1), 700);
        else setTimeout(() => { this.panel(''); this.running = true; this.schedule(500); }, 650);
    },

    reset() {
        cancelAnimationFrame(this._raf);
        [this._t1, this._t2, this._t3, this._callT].forEach(clearTimeout);
        this.running = false; this.over = false;
        this.outs = 0; this.errors = 0; this.ball = null; this.hold = null; this.state = 'idle';
        this.setPose('ready');
        this.$.ball.style.opacity = 0; this.$.shadow.style.opacity = 0;
        this.$.gauge.classList.remove('show'); this.$.hint.className = 'dg-hint fg-hint'; this.$.call.className = 'dg-call fg-call';
        this.el.querySelectorAll('.fg-pad .dg-btn').forEach(b => b.classList.remove('press'));
        this.renderHud();
    },

    renderHud() {
        this.$.count.textContent = this.outs;
        this.$.errs.innerHTML = [0, 1, 2].map(i => `<i class="${i < this.errors ? 'on' : ''}">E</i>`).join('');
        const next = [...FUNGO_TIERS].reverse().find(([c]) => this.outs < c);
        this.$.next.textContent = next ? `${next[0] - this.outs}아웃 더 잡으면 +${next[1]}P` : '최대 보상 +20P 달성';
    },

    setPose(p) { this.$.boy.className = `fg-boy st-${p}`; },

    say(text, kind, ms = 900) {
        const c = this.$.call;
        c.textContent = text; c.className = 'dg-call fg-call'; void c.offsetWidth; c.className = `dg-call fg-call show ${kind || ''}`;
        clearTimeout(this._callT); this._callT = setTimeout(() => { c.className = 'dg-call fg-call'; }, ms);
    },

    schedule(ms) { this._t1 = setTimeout(() => this.hit(), ms); },

    // 코치가 펑고를 침
    hit() {
        if (!this.running) return;
        if (!this.cam) this.layoutField();
        const n = this.outs, dirs = ['left', 'center', 'right'];
        const dir = n < 3 ? dirs[[0, 2, 1][n]] : dirs[Math.floor(Math.random() * 3)];
        // 갈수록 빨라짐 (공마다 조금씩 다름)
        const dur = Math.max(520, 1000 - n * 30) * (0.88 + Math.random() * 0.24); // 땅볼 속도 (처음 약 1초에 도착, 갈수록 빨라짐)
        const R = this.cam.R, F = FUNGO_FIELDER;
        const side = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
        const tgt = { x: F.x + R.x * FUNGO_REACH * side, y: F.y + R.y * FUNGO_REACH * side };
        this.ball = { dir, dur, t0: performance.now(), from: { x: 0.4, y: 0.8 }, tgt, done: false };
        this.state = 'incoming';
        this.$.coach.classList.remove('swing'); void this.$.coach.offsetWidth; this.$.coach.classList.add('swing');
        this.$.crack.classList.remove('show'); void this.$.crack.offsetWidth; this.$.crack.classList.add('show');
        this.say(FUNGO_DIRS[dir].call, `c-${dir === 'center' ? 'chest' : dir}`, dur);
        if (n < 3) { this.$.hint.textContent = `${FUNGO_DIRS[dir].label} 버튼을 누르고 있으세요`; this.$.hint.className = 'dg-hint fg-hint show'; }
        this.$.ball.style.opacity = 1; this.$.shadow.style.opacity = 0.6;
        // 도착 순간 + 여유 시간에 포구 판정 (화면 갱신 속도와 무관)
        this._t2 = setTimeout(() => this.judgeCatch(), dur + FUNGO_JUDGE_DELAY);
        this.loop();
    },

    loop() {
        cancelAnimationFrame(this._raf);
        const step = now => {
            const b = this.ball;
            if (!b) return;
            const t = (now - b.t0) / b.dur;
            if (b.phase === 'throw') { this.drawThrow(now); this._raf = requestAnimationFrame(step); return; }
            // 도착했을 때 맞는 방향을 누르고 있으면 바로 포구 (공이 글러브 속으로 → 뒤로 빠지지 않음)
            if (t >= 1 && !b.done && this.hold && this.hold.dir === b.dir) this.judgeCatch();
            if (b.caught && t >= 1) { this.$.ball.style.opacity = 0; this.$.shadow.style.opacity = 0; return; }
            // 땅볼: 통통 튀다가 굴러옴 (빠지면 그대로 뒤로)
            const tt = Math.min(t, 1.6);
            const x = b.from.x + (b.tgt.x - b.from.x) * tt, y = b.from.y + (b.tgt.y - b.from.y) * tt;
            const z = 0.04 + 1.5 * Math.pow(Math.max(0, 1 - tt), 1.6) * Math.abs(Math.sin(Math.PI * 4 * Math.min(tt, 1)));
            this.drawBall(x, y, z);
            if (t > 1.6) { this.$.ball.style.opacity = 0; this.$.shadow.style.opacity = 0; return; }
            this._raf = requestAnimationFrame(step);
        };
        this._raf = requestAnimationFrame(step);
    },

    drawBall(x, y, z) {
        const p = this.cam.proj(x, y, z), g = this.cam.proj(x, y, 0);
        if (p.z < 0.8) { this.$.ball.style.opacity = 0; this.$.shadow.style.opacity = 0; return; }
        const size = Math.max(4, 0.074 * 4 * this.cam.f / p.z);
        const bs = this.$.ball.style;
        bs.width = bs.height = `${size}px`;
        bs.transform = `translate(${p.x - size / 2}px, ${p.y - size / 2}px) rotate(${performance.now() * 0.8}deg)`;
        const ss = this.$.shadow.style;
        ss.width = `${size * 1.1}px`; ss.height = `${size * 0.35}px`;
        ss.transform = `translate(${g.x - size * 0.55}px, ${g.y - size * 0.17}px)`;
    },

    press(dir) {
        if (!this.running || this.over) return;
        if (this.hold) return;                       // 한 번에 버튼 하나만
        if (this.state !== 'incoming') return;       // 공이 오는 중에만 (송구 중·대기 중엔 무시)
        if (this.ball && performance.now() > this.ball.t0 + this.ball.dur) return; // 공이 이미 지나갔으면 무시
        this.hold = { dir, start: performance.now() };
        this.el.querySelector(`.fg-${dir}`)?.classList.add('press');
        this.el.querySelector('.fg-pad').classList.add('locked');
        this.setPose(dir);
    },

    release(dir) {
        if (!this.hold || this.hold.dir !== dir) return;
        this.el.querySelectorAll('.fg-pad .dg-btn').forEach(b => b.classList.remove('press'));
        this.el.querySelector('.fg-pad').classList.remove('locked');
        const wasCharging = this.state === 'charging';
        this.hold = null;
        if (wasCharging) { this.throwBall(); return; }
        if (this.state === 'incoming') this.setPose('ready'); // 잡기 전에 손을 떼면 제자리로
    },

    judgeCatch() {
        const b = this.ball;
        if (!b || b.done) return;
        b.done = true;
        this.$.hint.className = 'dg-hint fg-hint';
        const arrive = b.t0 + b.dur;
        // 공이 도착하기 전부터 맞는 방향 버튼을 누르고 있어야만 포구 (공이 지나간 뒤 누르면 실책)
        const ok = !!this.hold && this.hold.dir === b.dir && this.hold.start <= arrive;
        if (ok) {
            b.caught = true;
            this.state = 'charging';
            this.setPose('throw');
            this.$.call.className = 'dg-call fg-call'; // 포구 알림 끄고 게이지에 집중
            this.startGauge();
        } else {
            this.error('빠졌다! 실책');
        }
    },

    // 게이지: 누르고 있는 동안 0 → 100 → 0 오르내림. 가운데 빨간 구역은 갈수록 좁아지고 바늘은 빨라짐
    startGauge() {
        const n = this.outs;
        // 처음엔 천천히(한 번 왕복 2.6초) · 빨간 구역 넓게(28%), 아웃이 늘수록 조금씩 어려워짐
        const half = Math.max(5, 14 - n * 0.6);                         // 빨간 구역 반폭: 아웃이 늘수록 좁아짐
        const center = half + 4 + Math.random() * (92 - 2 * half);      // 위치는 매번 무작위
        this.gauge = { t0: performance.now(), period: Math.max(1500, 2600 - n * 60), half, center };
        this.$.red.style.left = `${center - half}%`; this.$.red.style.width = `${half * 2}%`;
        this.$.gauge.classList.add('show');
        const tick = () => {
            if (this.state !== 'charging') return;
            this.$.needle.style.left = `${this.gaugeValue()}%`;
            this._graf = requestAnimationFrame(tick);
        };
        tick();
        // 너무 오래 누르고 있으면 자동으로 던짐
        this._t3 = setTimeout(() => { if (this.state === 'charging') { this.hold = null; this.el.querySelectorAll('.fg-pad .dg-btn').forEach(b => b.classList.remove('press')); this.el.querySelector('.fg-pad').classList.remove('locked'); this.throwBall(); } }, 4500);
    },

    gaugeValue() {
        const g = this.gauge, ph = ((performance.now() - g.t0) % g.period) / g.period;
        return ph < 0.5 ? ph * 200 : (1 - ph) * 200;
    },

    throwBall() {
        clearTimeout(this._t3); cancelAnimationFrame(this._graf);
        const v = this.gaugeValue(), good = Math.abs(v - this.gauge.center) <= this.gauge.half;
        const strong = v > this.gauge.center;
        this.$.needle.style.left = `${v}%`;
        this.$.hint.className = 'dg-hint fg-hint';
        this.state = 'throwing';
        this.setPose('throw throwing');
        setTimeout(() => this.$.gauge.classList.remove('show'), 350);
        // 공이 1루로 날아감 (악송구면 크게 벗어남)
        const F = FUNGO_FIELDER, R = this.cam.R;
        const to = good ? { x: 19.0, y: 19.9, z: 1.3 }
            : (strong ? { x: 21.5, y: 14.5, z: 4.5 } : { x: 15.5, y: 23.5, z: 0 }); // 너무 세게: 높이 / 약하게: 원바운드 옆으로
        // 팔이 1루 쪽으로 내려오는 순간(0.18초 뒤) 공을 놓음
        this.ball = { phase: 'throw', t0: performance.now() + 180, dur: 650, from: { x: F.x - R.x * 0.3, y: F.y - R.y * 0.3, z: 1.8 }, to, good };
        this.loop();
        setTimeout(() => {
            this.$.ball.style.opacity = 0; this.$.shadow.style.opacity = 0;
            if (good) {
                this.outs += 1;
                this.say('나이스 송구! 아웃', 'c-catch', 900);
                this.flash('good');
                this.renderHud();
                this.next();
            } else {
                this.error(strong ? '악송구! (너무 셌어요)' : '악송구! (너무 약했어요)');
            }
        }, 860);
    },

    drawThrow(now) {
        const b = this.ball, t = Math.min(1, (now - b.t0) / b.dur);
        if (t < 0) { this.$.ball.style.opacity = 0; this.$.shadow.style.opacity = 0; return; }
        this.$.ball.style.opacity = 1; this.$.shadow.style.opacity = 0.5;
        const x = b.from.x + (b.to.x - b.from.x) * t, y = b.from.y + (b.to.y - b.from.y) * t;
        const z = b.from.z + (b.to.z - b.from.z) * t + Math.sin(Math.PI * t) * (b.good ? 1.2 : 2.4);
        this.drawBall(x, y, Math.max(0.05, z));
    },

    error(msg) {
        this.errors += 1;
        this.state = 'idle';
        this.hold = null;
        this.el.querySelectorAll('.fg-pad .dg-btn').forEach(b => b.classList.remove('press'));
        this.el.querySelector('.fg-pad').classList.remove('locked');
        this.$.gauge.classList.remove('show');
        this.setPose('ready');
        this.say(msg, 'c-err', 1000);
        this.flash('bad');
        this.$.stage.classList.remove('shake'); void this.$.stage.offsetWidth; this.$.stage.classList.add('shake');
        this.renderHud();
        if (this.errors >= 3) { setTimeout(() => this.gameOver(), 900); return; }
        this.next();
    },

    next() {
        this.state = 'idle';
        setTimeout(() => { if (this.running) this.setPose('ready'); }, 450);
        this.schedule(Math.max(700, 1300 - this.outs * 30)); // 지옥: 다음 펑고가 점점 빨리
    },

    flash(kind) { const f = this.$.flash; f.className = 'dg-flash fg-flash'; void f.offsetWidth; f.className = `dg-flash fg-flash ${kind}`; },

    gameOver() {
        this.running = false; this.over = true;
        [this._t1, this._t2].forEach(clearTimeout);
        const reward = fungoReward(this.outs);
        this.panel(`<div class="dg-card"><h3>훈련 종료</h3><p>결과를 저장하는 중...</p></div>`);
        finishMinigame(this.slot, reward > 0, reward, true).then(() => {
            this.panel(`
                <div class="dg-card">
                    <h3>${reward > 0 ? '훈련 성공!' : '아쉽게 실패'}</h3>
                    <div class="dg-result"><span>잡은 아웃</span><b>${this.outs}개</b></div>
                    <div class="dg-gain ${reward > 0 ? 'up' : ''}">${reward > 0 ? `+${reward}P` : '보상 없음'}</div>
                    <p class="dg-small">${mgFree() ? '테스트 기간이라 포인트는 반영되지 않아요' : reward > 0 ? '내일 다시 도전할 수 있어요' : '5아웃 이상이면 성공이에요 · 내일 다시 도전하세요'}</p>
                    ${mgFree() ? '<button class="dg-go fg-again">다시 하기</button><button class="dg-sub">닫기</button>' : '<button class="dg-go">확인</button>'}
                </div>`);
            const again = this.$.panel.querySelector('.fg-again');
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
            const reward = fungoReward(this.outs);
            finishMinigame(this.slot, reward > 0, reward);
        }
        this.reset();
        this.panel('');
        this.el.classList.remove('active');
    },
};

if (typeof MINIGAMES !== 'undefined') {
    MINIGAMES[2] = { title: '지옥의 펑고', open: slot => FungoGame.open(slot) };
}
