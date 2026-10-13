// ================= 미니게임 1: 볼보이의 야구공 피하기 =================
// 파울라인 옆 간이의자에 앉은 볼보이에게 강습 타구가 정면으로 날아옴.
// 볼보이는 글러브를 끼고 있음: 땅볼 → 다리 벌려 점프 / 몸쪽 → 글러브로 잡기 / 왼쪽·오른쪽 → 반대쪽으로 피하기 (의자 들고). 목숨 3개.
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
// 뒷모습 (홈플레이트를 바라봄): 양귀 헬멧 뒤통수 · 등번호 · 앞에 보이는 접이식 의자 등받이
const BALLBOY_SVG = `
<svg class="bb" viewBox="-90 -200 380 490" aria-hidden="true">
  <defs>
    <symbol id="bb-glove" viewBox="0 0 40 40">
      <path d="M8 30 C3 22 4 12 8 8 C10 4 14 4 16 7 L18 4 C20 1 24 1 26 4 L28 7 C31 4 36 6 35 11 L35 24 C35 33 28 38 20 38 C14 38 10 35 8 30Z" fill="#dd7a2c" stroke="#17183b" stroke-width="3" stroke-linejoin="round"/>
      <path d="M14 11 L14 24 M21 8 L21 24 M28 10 L28 24" stroke="#8a3c12" stroke-width="2.2" stroke-linecap="round"/>
    </symbol>
    <pattern id="bb-stripe" width="9" height="10" patternUnits="userSpaceOnUse">
      <rect width="9" height="10" fill="#d42a3c"/><rect x="6.5" width="1.6" height="10" fill="#7f1d2d"/>
    </pattern>
  </defs>
  <g stroke="#17183b" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">
    <ellipse class="bb-shadow" cx="100" cy="279" rx="62" ry="9" fill="rgba(0,0,0,0.35)" stroke="none"/>
    <!-- 의자 앞쪽(먼 쪽): 앉는 판 · 앞다리 -->
    <g class="bb-stool-sit">
      <path d="M48 208 L42 270 M152 208 L158 270" stroke="#8b95a8" stroke-width="6"/>
      <rect x="40" y="198" width="120" height="14" rx="6" fill="#1d2230"/>
    </g>
    <g class="bb-body">
      <!-- 다리: 앉음 / 다리 벌려 점프 / 섬 -->
      <g class="bb-legs-sit">
        <path d="M62 190 h76 v22 q0 8 -8 8 h-60 q-8 0 -8 -8z" fill="#24346e"/>
        <path d="M70 216 h22 v38 h-22z M108 216 h22 v38 h-22z" fill="#24346e"/>
        <path d="M66 252 h30 v14 h-30z M104 252 h30 v14 h-30z" fill="#1c1d33"/>
      </g>
      <g class="bb-legs-jump">
        <path d="M64 188 h72 v14 q0 9 -9 11 h-54 q-9 -2 -9 -11z" fill="#24346e"/>
        <path d="M78 206 L30 228 M122 206 L170 228" stroke="#24346e" stroke-width="22"/>
        <path d="M10 222 q2 -8 12 -8 h10 l2 14 h-22z M190 222 q-2 -8 -12 -8 h-10 l-2 14 h22z" fill="#1c1d33"/>
      </g>
      <g class="bb-legs-stand">
        <path d="M66 188 h68 l-4 70 h-24 l-6 -48 l-6 48 h-24z" fill="#24346e"/>
        <path d="M58 254 h36 v14 h-36z M106 254 h36 v14 h-36z" fill="#1c1d33"/>
      </g>
      <!-- 등: 줄무늬 유니폼 · 이름 · 등번호 -->
      <path d="M60 140 q4 -16 22 -18 h36 q18 2 22 18 l4 52 h-88z" fill="url(#bb-stripe)"/>
      <path d="M82 123 q18 7 36 0" fill="none" stroke="#24346e" stroke-width="6"/>
      <text x="100" y="140" text-anchor="middle" font-size="10" font-weight="900" font-family="Arial Black, Arial, sans-serif" fill="#fff" stroke="none" letter-spacing="1">BALLBOY</text>
      <text x="100" y="170" text-anchor="middle" font-size="30" font-weight="900" font-family="Arial Black, Arial, sans-serif"
            fill="#fff" stroke="#24346e" stroke-width="3" paint-order="stroke">00</text>
      <rect x="56" y="186" width="88" height="10" rx="3" fill="#24346e"/>
      <!-- 팔: 쉬는 자세 (왼손 글러브 = 뒤에서 보면 화면 왼쪽) -->
      <g class="bb-arms-rest">
        <path d="M62 134 q-16 14 -12 60" fill="none" stroke="#24346e" stroke-width="17"/>
        <path d="M138 134 q16 14 12 60" fill="none" stroke="#24346e" stroke-width="17"/>
        <use href="#bb-glove" x="30" y="180" width="40" height="40"/>
        <circle cx="148" cy="200" r="11" fill="#f6c39b"/>
      </g>
      <!-- 잡기: 글러브를 앞으로 쭉 (머리 옆으로 보임) -->
      <g class="bb-arms-catch">
        <path d="M62 136 q-30 -44 10 -104" fill="none" stroke="#24346e" stroke-width="17"/>
        <path d="M138 134 q16 14 12 60" fill="none" stroke="#24346e" stroke-width="17"/>
        <circle cx="148" cy="200" r="11" fill="#f6c39b"/>
      </g>
      <g class="bb-arms-up">
        <path d="M62 136 q-34 -40 -24 -150" fill="none" stroke="#24346e" stroke-width="17"/>
        <path d="M138 136 q34 -40 22 -150" fill="none" stroke="#24346e" stroke-width="17"/>
      </g>
      <!-- 머리 뒤통수: 목 · 뒷머리 · 양귀 헬멧 -->
      <g class="bb-head">
        <rect x="84" y="108" width="32" height="22" rx="7" fill="#f0bb92"/>
        <path d="M58 90 Q100 126 142 90 L140 110 Q100 134 60 110 Z" fill="#3a2418"/>
        <path d="M42 112 C32 58 46 22 100 21 C154 22 168 58 158 112 Q150 122 138 116 L136 98 Q100 112 64 98 L62 116 Q50 122 42 112 Z" fill="#d42a3c"/>
        <path d="M76 25 C52 32 34 58 42 112 Q50 122 62 116 L64 98 Q70 101 76 102 Z" fill="#24346e"/>
        <path d="M118 34 Q140 42 148 60" fill="none" stroke="#ffffff" stroke-width="5" opacity="0.4"/>
        <circle cx="52" cy="100" r="5.5" fill="#17183b" stroke-width="2"/><circle cx="148" cy="100" r="5.5" fill="#17183b" stroke-width="2"/>
      </g>
      <!-- 잡기: 머리 쪽으로 오는 공을 받는 글러브 (머리 위 가운데) -->
      <use class="bb-catch-glove" href="#bb-glove" x="66" y="-18" width="68" height="68"/>
    </g>
    <!-- 의자 등받이 (볼보이 등 앞, 카메라 쪽) -->
    <g class="bb-stool-back">
      <path d="M50 182 L46 274 M150 182 L154 274" stroke="#8b95a8" stroke-width="7"/>
      <path d="M50 242 L150 242" stroke="#8b95a8" stroke-width="5"/>
      <rect x="40" y="176" width="120" height="34" rx="10" fill="#1d2230"/>
      <path d="M50 183 q50 -7 100 0" fill="none" stroke="#3a4256" stroke-width="3"/>
    </g>
    <!-- 머리 위로 번쩍 든 접이식 의자 (옆모습) -->
    <g class="bb-stool-hold">
      <path d="M62 -18 L130 16 M138 -18 L70 16" stroke="#8b95a8" stroke-width="6"/>
      <path d="M134 -24 L144 -78" stroke="#8b95a8" stroke-width="6"/>
      <path d="M124 -84 q14 -8 30 2 l-6 40 q-14 -6 -30 -2z" fill="#1d2230"/>
      <path d="M44 -30 q56 -10 116 4 l-2 12 q-58 -10 -114 -4z" fill="#1d2230"/>
      <path d="M62 16 h14 M124 16 h14" stroke="#8b95a8" stroke-width="5"/>
      <use href="#bb-glove" x="22" y="-36" width="36" height="36"/>
      <circle cx="158" cy="-16" r="11" fill="#f6c39b"/>
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
    left: { label: '피하기', when: '오른쪽 공일 때', icon: '<path d="M15 5l-7 7 7 7"/>', ms: 600 },
    jump: { label: '점프', when: '땅볼일 때', icon: '<path d="M12 19V6M6 11l6-6 6 6"/>', ms: 700 },
    catch: { label: '잡기', when: '정면 공일 때', icon: '<path d="M7 13V8a2 2 0 014 0v3M11 10V6a2 2 0 014 0v5M15 9a2 2 0 014 0v4a7 7 0 01-7 7h-1a6 6 0 01-6-6v-1a2 2 0 014 0"/>', ms: 650 },
    right: { label: '피하기', when: '왼쪽 공일 때', icon: '<path d="M9 5l7 7-7 7"/>', ms: 600 },
};
// 공 종류 → 살아남는 동작
const DODGE_BALLS = {
    ground: { need: ['jump'], hint: '점프!', call: '땅볼이 옵니다!' },
    chest: { need: ['catch'], hint: '글러브로 잡기!', call: '정면으로 공이 옵니다!' },
    left: { need: ['right'], hint: '오른쪽으로 피하기!', call: '왼쪽으로 공이 옵니다!' },
    right: { need: ['left'], hint: '왼쪽으로 피하기!', call: '오른쪽으로 공이 옵니다!' },
};

// ---- 야구장 3D 렌더링: 실제 치수의 야구장을 볼보이 바로 뒤 카메라에서 본 모습으로 투영 ----
// 좌표(m): 홈플레이트 원점, +y = 2루(중견수) 방향, +x = 1루 쪽. z = 높이
const CROWD_TEAM = { first: ['#dc2626', '#d42a3c', '#c81e1e'], third: ['#2563eb', '#1d5fd8', '#2a6af0'] };
const CROWD_SKIN = ['#f4c7a1', '#e9b48a', '#d9a06f', '#f7d3b5'];
const CROWD_HAIR = ['#1f1512', '#2b1d16', '#3a2418', '#111111', '#5b3a24'];
const FIELD = {
    base: 27.43, mound: 18.44, infieldR: 29, homeR: 4,
    wallOff: 10,         // 파울라인에서 관중석 펜스까지 (m)
    rowDepth: 0.85, rowRise: 0.42, rows: 26, wallH: 1.1,
    boyS: 46, boyOff: 7,   // 볼보이: 3루 파울라인 따라 46m(3루 지나 좌익수 쪽), 라인 밖 7m (펜스 바로 앞)
    camBack: 4, camH: 7.5, vfov: 76, homeY: 0.3, // 카메라: 볼보이 뒤 4m, 높이 7.5m에서 홈을 바라봄
    figScale: 1.8,         // 선수 그림은 잘 보이게 실제보다 조금 크게
};

// 카메라: cam = { C: 카메라 위치, look: 바라보는 땅 위의 점, lookY: 그 점이 화면 위에서 보일 높이(0~1), vfov }
// cam이 없으면 볼보이 게임 카메라 (3루 지난 파울 지역 볼보이 뒤)
function ballboyCam() {
    const u3 = { x: -Math.SQRT1_2, y: Math.SQRT1_2 }, n3 = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
    const B = { x: u3.x * FIELD.boyS + n3.x * FIELD.boyOff, y: u3.y * FIELD.boyS + n3.y * FIELD.boyOff };
    const dl = Math.hypot(B.x, B.y), d = { x: -B.x / dl, y: -B.y / dl };   // 볼보이 → 홈
    return { C: { x: B.x - d.x * FIELD.camBack, y: B.y - d.y * FIELD.camBack, z: FIELD.camH }, look: { x: 0, y: 0 }, lookY: FIELD.homeY, vfov: FIELD.vfov };
}

function makeCamera(W, H, cam) {
    cam = cam || ballboyCam();
    const C = cam.C;
    const dx0 = cam.look.x - C.x, dy0 = cam.look.y - C.y, dist = Math.hypot(dx0, dy0);
    const d = { x: dx0 / dist, y: dy0 / dist };
    const f = H / (2 * Math.tan(cam.vfov * Math.PI / 360));
    const th = Math.atan2(C.z, dist) + Math.atan(((0.5 - cam.lookY) * H) / f); // 바라보는 점이 화면의 lookY 높이에 오게
    const F = { x: d.x * Math.cos(th), y: d.y * Math.cos(th), z: -Math.sin(th) };
    const R = { x: d.y, y: -d.x, z: 0 };
    const U = { x: R.y * F.z - R.z * F.y, y: R.z * F.x - R.x * F.z, z: R.x * F.y - R.y * F.x };
    const proj = (x, y, z = 0) => {
        const vx = x - C.x, vy = y - C.y, vz = z - C.z;
        const zc = vx * F.x + vy * F.y + vz * F.z;
        return { x: W / 2 + f * (vx * R.x + vy * R.y) / zc, y: H / 2 - f * (vx * U.x + vy * U.y + vz * U.z) / zc, z: zc };
    };
    return { proj, f, horizon: H / 2 - f * Math.tan(th), R, C };
}

function drawStadium(cv, opts = {}) {
    if (!cv) return null;
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!r.width) return null;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    const W = r.width, H = r.height, c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { proj, f, horizon } = makeCamera(W, H, opts.cam);
    const NEAR = 0.6;
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pick = a => a[Math.floor(rnd() * a.length)];
    const SQ = Math.SQRT1_2;
    const sideOf = x => (x > 0 ? 'first' : 'third'); // 가운데 선(x=0) 기준: 1루 쪽 빨강, 3루 쪽 파랑

    // 하늘 · 기본 잔디
    const sky = c.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#040915'); sky.addColorStop(1, '#13264d');
    c.fillStyle = sky; c.fillRect(0, 0, W, H);
    const gr = c.createLinearGradient(0, horizon, 0, H);
    gr.addColorStop(0, '#13692f'); gr.addColorStop(1, '#1d9a4c');
    c.fillStyle = gr; c.fillRect(0, horizon, W, H - horizon);

    // 그리기 목록 (멀리 있는 것부터: 화가 알고리즘)
    const items = [];
    const poly = (pts, color, bias = 0) => {
        const ps = pts.map(p => proj(p[0], p[1], p[2] || 0));
        if (ps.some(p => p.z < NEAR)) return;
        items.push({ d: ps.reduce((m, p) => Math.max(m, p.z), 0) + bias, draw: () => {
            c.fillStyle = color; c.beginPath(); c.moveTo(ps[0].x, ps[0].y);
            for (let i = 1; i < ps.length; i++) c.lineTo(ps[i].x, ps[i].y);
            c.closePath(); c.fill();
        } });
    };
    const ground = (pts, color) => { // 바닥 그림은 관중석보다 항상 먼저
        const ps = pts.map(p => proj(p[0], p[1], 0)).filter(p => p.z > NEAR);
        if (ps.length < 3) return;
        c.fillStyle = color; c.beginPath(); c.moveTo(ps[0].x, ps[0].y);
        for (let i = 1; i < ps.length; i++) c.lineTo(ps[i].x, ps[i].y);
        c.closePath(); c.fill();
    };
    const circlePts = (cx, cy, rad, n = 48) => Array.from({ length: n }, (_, i) => [cx + rad * Math.cos(i / n * 2 * Math.PI), cy + rad * Math.sin(i / n * 2 * Math.PI)]);

    // 1) 내야 흙: 마운드 중심 반경 29m 원 중 페어 지역(두 파울라인 사이)
    const m = { x: 0, y: FIELD.mound };
    const sHit = (() => { const um = SQ * m.y; return um + Math.sqrt(um * um - m.y * m.y + FIELD.infieldR ** 2); })();
    const a3 = Math.atan2(sHit * SQ - m.y, -sHit * SQ), a1 = Math.atan2(sHit * SQ - m.y, sHit * SQ);
    const dirt = [[0, 0], [-sHit * SQ, sHit * SQ]];
    for (let i = 0; i <= 40; i++) { const a = a3 + (a1 - a3) * i / 40; dirt.push([m.x + FIELD.infieldR * Math.cos(a), m.y + FIELD.infieldR * Math.sin(a)]); }
    ground(dirt, '#b9773f');
    // 2) 내야 잔디 (다이아몬드 안쪽) · 마운드 · 홈 주변 흙 · 베이스 주변 흙
    const B = FIELD.base, cy = B * SQ, k = 0.86;
    ground([[0, cy - cy * k], [cy * k, cy], [0, cy + cy * k], [-cy * k, cy]].map(([x, y]) => [x, y]), '#1b8f47');
    ground(circlePts(0, FIELD.mound, 2.9), '#b9773f');
    ground(circlePts(0, 0, FIELD.homeR), '#b9773f');
    [[cy, cy], [0, 2 * cy], [-cy, cy]].forEach(([x, y]) => ground(circlePts(x, y, 2.6), '#b9773f'));
    // 3) 펜스 앞 흙길 (파울 지역, 펜스 따라)
    const track = (u, n, o0, o1, s0, s1, color) => {
        const pts = [];
        for (let s = s0; s <= s1; s += 2) pts.push([u.x * Math.max(s, -o0) + n.x * o0, u.y * Math.max(s, -o0) + n.y * o0]);
        for (let s = s1; s >= s0; s -= 2) pts.push([u.x * Math.max(s, -o1) + n.x * o1, u.y * Math.max(s, -o1) + n.y * o1]);
        ground(pts, color);
    };
    const U3 = { x: -SQ, y: SQ }, N3 = { x: -SQ, y: -SQ }, U1 = { x: SQ, y: SQ }, N1 = { x: SQ, y: -SQ };
    track(U3, N3, FIELD.wallOff - 3.5, FIELD.wallOff, -FIELD.wallOff, 70, '#a86a36');
    track(U1, N1, FIELD.wallOff - 3.5, FIELD.wallOff, -FIELD.wallOff, 110, '#a86a36');
    // 4) 파울라인 · 베이스 · 홈플레이트 · 타석
    const line = (u, s0, s1, w = 0.1) => {
        for (let s = s0; s < s1; s += 1.5) {
            const e = Math.min(s1, s + 1.5), nx = -u.y * w / 2, ny = u.x * w / 2;
            ground([[u.x * s + nx, u.y * s + ny], [u.x * e + nx, u.y * e + ny], [u.x * e - nx, u.y * e - ny], [u.x * s - nx, u.y * s - ny]], '#f8fafc');
        }
    };
    line(U3, 0.3, 110); line(U1, 0.3, 110);
    const bag = (x, y, sz = 0.38) => ground([[x, y - sz], [x + sz, y], [x, y + sz], [x - sz, y]], '#ffffff');
    bag(cy, cy); bag(0, 2 * cy); bag(-cy, cy);
    ground([[-0.22, 0.43], [0.22, 0.43], [0.22, 0.22], [0, 0], [-0.22, 0.22]], '#ffffff');
    const box = (x0, x1, y0, y1) => { const w = 0.06; line({ x: 1, y: 0 }, 0, 0); // 타석 (흰 테두리)
        [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]].forEach(([ax, ay, bx2, by]) => {
            const L = Math.hypot(bx2 - ax, by - ay), ux = (bx2 - ax) / L, uy = (by - ay) / L;
            ground([[ax - uy * w, ay + ux * w], [bx2 - uy * w, by + ux * w], [bx2 + uy * w, by - ux * w], [ax + uy * w, ay - ux * w]], 'rgba(255,255,255,0.9)');
        }); };
    box(-1.37, -0.32, -0.9, 0.9); box(0.32, 1.37, -0.9, 0.9);

    // 5) 관중석: 3루 쪽 · 1루 쪽. 펜스(1.1m) 위로 한 줄에 0.85m씩 물러나며 0.42m씩 높아짐
    //    두 관중석은 홈 뒤 가운데 선(x=0)에서 꺾여 만남
    const stand = (u, n, sMax) => {
        const wo = FIELD.wallOff;
        // 펜스 (패딩)
        for (let s = -wo; s < sMax; s += 3) {
            const e = Math.min(sMax, s + 3);
            const P = t => [u.x * t + n.x * wo, u.y * t + n.y * wo];
            const [ax, ay] = P(s), [bx2, by] = P(e);
            poly([[ax, ay, 0], [bx2, by, 0], [bx2, by, FIELD.wallH], [ax, ay, FIELD.wallH]], '#0f5132', 0.05);
        }
        for (let r2 = 0; r2 < FIELD.rows; r2++) {
            const o0 = wo + r2 * FIELD.rowDepth, o1 = o0 + FIELD.rowDepth;
            const h0 = FIELD.wallH + r2 * FIELD.rowRise, h1 = h0 + FIELD.rowRise;
            const tread = r2 % 2 ? '#22345f' : '#1d2d55';
            for (let s = -o1; s < sMax; s += 3) {
                const e = Math.min(sMax, s + 3);
                const Q = (t, o, h) => [u.x * Math.max(t, -o) + n.x * o, u.y * Math.max(t, -o) + n.y * o, h];
                // 디딤판(앉는 줄) · 다음 줄 단 (세로면)
                poly([Q(s, o0, h0), Q(e, o0, h0), Q(e, o1, h0), Q(s, o1, h0)], tread);
                poly([Q(s, o1, h0), Q(e, o1, h0), Q(e, o1, h1), Q(s, o1, h1)], '#16244a', -0.01);
            }
            // 관중: 0.55m 간격 (연습 장면이면 빈 관중석)
            for (let s = -o0 + 0.3; opts.crowd !== false && s < sMax; s += 0.55) {
                if (rnd() < 0.12) continue;
                const o = o0 + 0.45, wx = u.x * s + n.x * o, wy = u.y * s + n.y * o;
                const p = proj(wx, wy, h0);
                if (p.z < NEAR || p.x < -30 || p.x > W + 30 || p.y < -30 || p.y > H + 30) continue;
                const sz = 0.95 * f / p.z;
                const side = sideOf(wx), shirt = pick(CROWD_TEAM[side]), skin = pick(CROWD_SKIN);
                const hat = rnd() < 0.3 ? CROWD_TEAM[side][0] : pick(CROWD_HAIR), arm = rnd() < 0.05;
                items.push({ d: p.z - 0.02, draw: () => {
                    if (sz < 1.6) { c.fillStyle = shirt; c.fillRect(p.x - sz * 0.4, p.y - sz, Math.max(1, sz * 0.8), Math.max(1, sz)); return; }
                    const bw = sz * 0.5, bh = sz * 0.5;
                    c.fillStyle = shirt; c.beginPath();
                    if (c.roundRect) c.roundRect(p.x - bw / 2, p.y - bh, bw, bh, sz * 0.14); else c.rect(p.x - bw / 2, p.y - bh, bw, bh);
                    c.fill();
                    const hr = sz * 0.15, hy = p.y - bh - hr * 0.8;
                    c.fillStyle = skin; c.beginPath(); c.arc(p.x, hy, hr, 0, Math.PI * 2); c.fill();
                    c.fillStyle = hat; c.beginPath(); c.arc(p.x, hy - hr * 0.15, hr * 1.02, Math.PI, 0); c.fill();
                    if (arm) { c.strokeStyle = skin; c.lineWidth = sz * 0.09; c.beginPath(); c.moveTo(p.x + bw * 0.4, p.y - bh * 0.8); c.lineTo(p.x + bw * 0.55, p.y - bh - sz * 0.42); c.stroke(); }
                } });
            }
        }
        // 맨 위 난간 뒤 벽
        const oT = wo + FIELD.rows * FIELD.rowDepth, hT = FIELD.wallH + FIELD.rows * FIELD.rowRise;
        for (let s = -oT; s < sMax; s += 3) {
            const e = Math.min(sMax, s + 3);
            const Q = (t, h) => [u.x * Math.max(t, -oT) + n.x * oT, u.y * Math.max(t, -oT) + n.y * oT, h];
            poly([Q(s, hT), Q(e, hT), Q(e, hT + 2.2), Q(s, hT + 2.2)], '#0b1328', 0.5);
        }
    };
    stand(U3, N3, 75);
    stand(U1, N1, 120);
    // 외야 펜스 (멀리)
    for (let a = 45; a < 135; a += 3) {
        const R1 = 100, p0 = [R1 * Math.cos(a * Math.PI / 180), R1 * Math.sin(a * Math.PI / 180)], p1 = [R1 * Math.cos((a + 3) * Math.PI / 180), R1 * Math.sin((a + 3) * Math.PI / 180)];
        poly([[...p0, 0], [...p1, 0], [...p1, 3], [...p0, 3]], '#0f5132');
        poly([[...p0, 3], [...p1, 3], [p1[0] * 1.15, p1[1] * 1.15, 14], [p0[0] * 1.15, p0[1] * 1.15, 14]], '#1d2d55');
    }
    items.sort((a, b) => b.d - a.d).forEach(it => it.draw());

    // 사람 그림(투수·타자·포수·심판) 위치와 크기, 공이 지나가는 점
    const at = (x, y, z, hM) => { const p = proj(x, y, z); return { x: p.x, y: p.y, h: hM * FIELD.figScale * f / p.z }; };
    return {
        W, H, proj, f,
        plate0: proj(0, 0, 0),
        contact: proj(-0.2, 0.5, 0.9),
        release: proj(0.3, FIELD.mound - 0.8, 2.1),
        pitcher: at(0, FIELD.mound, 0.25, 1.9),
        batter: at(-0.85, 0.1, 0, 1.85),
        catcher: at(0, -1.1, 0, 1.15),
        ump: at(0, -2.1, 0, 1.85),
    };
}

const DodgeGame = {
    el: null, slot: 1, running: false,

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
        el.className = 'dg';
        el.innerHTML = `
            <div class="dg-top">
                <button class="dg-x" aria-label="닫기">×</button>
                <div class="dg-title">볼보이의 야구공 피하기</div>
                <div class="dg-lives"></div>
            </div>
            <div class="dg-hud"><span>피한 공 <b class="dg-count">0</b></span><span class="dg-next"></span></div>
            <div class="dg-stage">
                <!-- 경기장 그림: 3루 지난 파울 지역에서 홈을 바라봄 (왼쪽 = 경기장, 오른쪽 = 관중석) -->
                <div class="dg-scene">
                    <canvas class="dg-field"></canvas>
                    <div class="dg-sky"><i></i><i></i><i></i></div>
                    <div class="dg-fig dg-ump"><svg viewBox="0 0 40 50"><g fill="#111827"><circle cx="20" cy="9" r="6.5"/><path d="M9 17h22l3 18h-6v13h-6v-10h-4v10h-6V35H6z"/></g></svg></div>
                    <div class="dg-fig dg-catcher"><svg viewBox="0 0 40 40"><g fill="#1f2937"><circle cx="20" cy="9" r="6.5"/><path d="M10 16h20l4 14h-8l2 8h-6l-2-7-2 7h-6l2-8H6z"/></g><circle cx="9" cy="22" r="5" fill="#7c4a1e"/></svg></div>
                    <div class="dg-fig dg-pitcher"><svg viewBox="0 0 40 60"><g fill="#0b1224"><circle cx="20" cy="10" r="6"/><path d="M13 18h14l2 20h-5l-2 20h-4l-2-20-2 20h-4l-2-20h-3z"/></g><path class="dg-parm" d="M27 21 L36 12" stroke="#0b1224" stroke-width="4.5" stroke-linecap="round"/><path class="dg-glove" d="M13 21 L6 28" stroke="#0b1224" stroke-width="4.5" stroke-linecap="round"/></svg></div>
                    <div class="dg-fig dg-batter"><svg viewBox="0 0 40 60"><g fill="#0b1224" stroke="none"><circle cx="20" cy="10" r="6"/><path d="M13 18h14l2 20h-5l-2 20h-4l-2-20-2 20h-4l-2-20h-3z"/></g><path class="dg-bat" d="M24 22 L38 6" stroke="#c08a52" stroke-width="3.5" stroke-linecap="round"/></svg></div>
                </div>
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
                        <svg viewBox="0 0 24 24">${a.icon}</svg><span>${a.label}</span><small class="dg-when">${a.when}</small>
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
            const k = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'jump', ArrowDown: 'catch', ' ': 'catch' }[e.key];
            if (k) { e.preventDefault(); this.act(k); }
        };
        document.addEventListener('keydown', this._key);
        window.addEventListener('resize', () => { if (this.el.classList.contains('active')) this.layoutField(); });
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
                <p>파울라인 밖 볼보이에게 타구가 날아와요.<br>강습도, 느린 공도 있어요. 피하고, 뛰고, 잡으세요!</p>
                <ul class="dg-rules">
                    <li><b>발밑 땅볼</b><span>다리 벌려 점프</span></li>
                    <li><b>정면(머리 쪽) 공</b><span>글러브로 잡기</span></li>
                    <li><b>왼쪽 · 오른쪽 공</b><span>반대쪽으로 피하기</span></li>
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
        if (mgFree()) { mgStartChallenge(this.slot); this.panel(''); this.countdown(3); return; } // 무료 연습: 바로 시작
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
        this.n = 0; this.lives = 3; this.ballObj = null; this.acts = []; this._speedUpAt = 0; this.actionUntil = 0; this.releaseAction();
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
        // 갈수록 빨라짐: 피한 공이 늘수록 전체 속도가 올라가고, 그 안에서 강습·느린 공은 무작위
        const slow = Math.max(650, 1700 - n * 50), fast = Math.max(420, 950 - n * 28);
        const dur = Math.round(fast + (slow - fast) * Math.random());
        const pdur = 480; // 투구 템포는 항상 같음
        this.ballObj = { type, dur, pdur, phase: 'windup', judged: false };
        if (n > 0 && n % 5 === 0 && this._speedUpAt !== n) {
            this._speedUpAt = n;
            this.$.call.textContent = '공이 더 빨라집니다!'; this.$.call.className = 'dg-call show c-speed';
            clearTimeout(this._callT); this._callT = setTimeout(() => { if (this.$.call.classList.contains('c-speed')) this.$.call.className = 'dg-call'; }, 900);
        }
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

    // 야구장을 그리고 투수·타자·포수·심판을 투영된 자리에 세움
    layoutField() {
        const fp = drawStadium(this.el.querySelector('.dg-field'));
        if (!fp) return;
        this.fp = fp;
        const place = (sel, pt, ratio, flip) => {
            const e = this.el.querySelector(sel); if (!e) return;
            const h = Math.max(8, pt.h), w = h * ratio;
            Object.assign(e.style, { left: `${pt.x - w / 2}px`, top: `${pt.y - h}px`, width: `${w}px`, height: `${h}px`, transform: flip ? 'scaleX(-1)' : 'none' });
        };
        place('.dg-ump', fp.ump, 0.8); place('.dg-catcher', fp.catcher, 1);
        place('.dg-pitcher', fp.pitcher, 0.66); place('.dg-batter', fp.batter, 0.66, true);
        Object.assign(this.$.crack.style, { left: `${fp.contact.x}px`, top: `${fp.contact.y - 28}px`, transform: 'translateX(-50%)' });
    },

    geom() {
        const st = this.$.stage.getBoundingClientRect(), bb = this.$.boy.getBoundingClientRect();
        const W = st.width, H = st.height;
        const vp = { x: W * 0.5, y: H * 0.27 };
        // 그림 틀은 동작이 잘리지 않게 넉넉함(-90,-200 ~ 290,290). 볼보이 몸통 영역(0,0 ~ 200,290)으로 환산
        const w = bb.width * 200 / 380, h = bb.height * 290 / 490;
        const L = bb.left - st.left + bb.width * 90 / 380, T = bb.top - st.top + bb.height * 200 / 490;
        const cx = L + w / 2, gy = T + h * 0.96, s = w / 170;
        const targets = {
            ground: { x: cx, y: T + h * 0.95 },             // 발밑
            chest: { x: cx, y: T + h * 0.06 },              // 정면 공: 머리 쪽 (글러브를 머리 위로)
            left: { x: cx - w * 0.46, y: T + h * 0.42 },
            right: { x: cx + w * 0.46, y: T + h * 0.42 },
        };
        const fp = this.fp || {};
        const mound = fp.release || { x: W * 0.24, y: H * 0.34 };   // 투수 손 (3D 투영)
        const plate = fp.contact || { x: W * 0.5, y: H * 0.25 };    // 타자가 공을 맞히는 위치 (3D 투영)
        if (fp.plate0) { vp.x = fp.plate0.x; vp.y = fp.plate0.y; }
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
            if (b.type === 'ground' && !(b.result === 'hit' && t > 1)) {
                // 땅볼: 바닥(그림자 선)을 따라 굴러서 발밑으로, 작게 통통 튐
                const sz0 = (6 + 40 * e) * g.s;
                y = shY - sz0 * 0.5 - Math.abs(Math.sin(t * Math.PI * 3.2)) * 10 * g.s * (0.3 + e) * (1 - Math.min(1, t) * 0.7);
            }
            if (b.result === 'caught' && t > 1) { // 글러브 속에 멈춤
                x = tg.x; y = tg.y;
            } else if (b.result === 'hit' && t > 1) {
                const k = t - 1; x += k * 160 * g.s * (b.dir || 1); y += k * k * 500 * g.s - k * 180 * g.s;
            }
            const size = b.result === 'caught' && t > 1 ? 32 * g.s : (6 + 40 * e) * g.s;
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
        if (this.action) return; // 한 번에 한 동작만: 동작이 끝나기 전에는 다른 버튼을 눌러도 무시
        const now = performance.now();
        this.action = a; this.actionUntil = now + DODGE_ACTIONS[a].ms;
        this.acts = (this.acts || []).filter(x => x.end > now - 2000).concat([{ a, start: now, end: this.actionUntil }]);
        this.setPose(a);
        this.el.querySelector(`.dg-${a}`)?.classList.add('press');
        this.el.querySelector('.dg-pad')?.classList.add('locked');
        clearTimeout(this._actT);
        this._actT = setTimeout(() => {
            this.releaseAction();
            if (this.running && !this.over) this.setPose('sit');
        }, DODGE_ACTIONS[a].ms);
    },

    // 동작이 끝남: 버튼 다시 누를 수 있게
    releaseAction() {
        this.action = null;
        this.el.querySelectorAll('.dg-btn.press').forEach(x => x.classList.remove('press'));
        this.el.querySelector('.dg-pad')?.classList.remove('locked');
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
            b.result = b.type === 'chest' ? 'caught' : 'pass';
            if (b.type === 'chest') {
                this.$.call.textContent = '나이스 캐치!'; this.$.call.className = 'dg-call show c-catch';
                clearTimeout(this._callT); this._callT = setTimeout(() => { this.$.call.className = 'dg-call'; }, 600);
            }
            this.flash('good');
        } else {
            b.result = 'hit'; b.dir = b.type === 'right' ? 1 : -1;
            this.lives -= 1;
            clearTimeout(this._actT); this.releaseAction();
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
            this.running = false; clearTimeout(this._nextT); // 묻는 동안 다음 공은 멈춤
            appConfirm('지금 나가면 이번 도전이 여기서 끝나요. 나갈까요?', { ok: '나가기', danger: true }).then(ok => {
                if (!ok) { this.running = true; if (!this.ballObj) this.scheduleNext(600); return; }
                cancelAnimationFrame(this._raf);
                const reward = dodgeReward(this.n);
                finishMinigame(this.slot, reward > 0, reward);
                this.close(true);
            });
            return;
        }
        this.reset();
        this.panel('');
        this.el.classList.remove('active');
    },
};

if (typeof MINIGAMES !== 'undefined') {
    MINIGAMES[1] = { title: '볼보이의 야구공 피하기', open: slot => DodgeGame.open(slot) };
}
