// 작전타임 3D 중계 화면
// 서버가 보내는 투구 결과(last_pitch)대로 투구·타격·타구·주루를 3D로 그림.
// app.js에서: B3D.ensure(stage, opts) → B3D.sync(state) / B3D.play(state).then(UI 갱신)
// 3D를 못 쓰는 환경(오래된 기기, 인터넷 끊김)에서는 이 파일이 실패해도 기존 2D 그라운드가 그대로 보임.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const B3D = { ready: false, busy: false };
window.B3D = B3D;

// ---------------- 공용 도구 ----------------
const ang = (deg) => deg * Math.PI / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// 같은 투구는 언제 봐도 같은 모습이 되도록 (번호로 만드는 가짜 난수)
function hrand(serial, k) {
    let x = (serial * 374761393 + k * 668265263) >>> 0;
    x = Math.imul(x ^ (x >>> 13), 1274126177) >>> 0;
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
const hr = (serial, k, a, b) => a + hrand(serial, k) * (b - a);

// 방향: 홈플레이트(0,0,0), 중견수 쪽이 -z, 1루 쪽이 +x. 각도 45°=1루선, 90°=중견, 135°=3루선
const dirOf = (deg) => new THREE.Vector3(Math.cos(ang(deg)), 0, -Math.sin(ang(deg)));
function wallR(deg) {
    const d = ((deg % 360) + 360) % 360;
    let off = Math.abs(d - 90); if (off > 180) off = 360 - off;
    if (off <= 45) return 98 + 24 * Math.cos(ang(off * 2));
    return 98 - 74 * Math.pow((off - 45) / 135, 0.8);
}
const BASE = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(19.4, 0, -19.4), new THREE.Vector3(0, 0, -38.8), new THREE.Vector3(-19.4, 0, -19.4), new THREE.Vector3(0, 0, 0)];
const FIELD = { '1B': [18, -24], '2B': [9, -34], 'SS': [-9, -33], '3B': [-18, -23], 'LF': [-46, -72], 'CF': [0, -92], 'RF': [46, -72] };
const POS_KO = { '1루수': '1B', '2루수': '2B', '유격수': 'SS', '3루수': '3B', '좌익수': 'LF', '중견수': 'CF', '우익수': 'RF' };
const DIR_DEG = { '좌전': 118, '중전': 90, '우전': 62, '좌중간': 106, '우중간': 74, '좌익선상': 131 };

// ---------------- 장면 ----------------
let renderer, scene, camera, host, stageEl, opts = {};
let tagEl, tagSpd, tagType, tagRes, camEl = null, zoneEl;
let pitcher, catcher, ump, batter, batPivot, ball, trail, trailGeo;
const fielders = {};
const runners = [];
const trailPts = [];
let BAT = {};

function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
    return t;
}
function ringGeo(rIn, rOut, y0, y1, a0, a1, seg) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= seg; i++) {
        const d = a0 + (a1 - a0) * i / seg, R = wallR(d), v = dirOf(d);
        const p0 = v.clone().multiplyScalar(R + rIn), p1 = v.clone().multiplyScalar(R + rOut);
        pos.push(p0.x, y0, p0.z, p1.x, y1, p1.z); uv.push(i / seg * 40, 0, i / seg * 40, 1);
        if (i < seg) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals(); return g;
}
function wallGeo(a0, a1, h, seg, off = 0) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= seg; i++) {
        const d = a0 + (a1 - a0) * i / seg, p = dirOf(d).multiplyScalar(wallR(d) + off);
        pos.push(p.x, 0, p.z, p.x, h, p.z); uv.push((1 - i / seg) * 60, 0, (1 - i / seg) * 60, 1);
        if (i < seg) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals(); return g;
}

function buildField() {
    // 하늘 (저녁 경기)
    {
        const t = canvasTex(4, 256, (x) => {
            const gr = x.createLinearGradient(0, 0, 0, 256);
            gr.addColorStop(0, '#050b18'); gr.addColorStop(0.45, '#0f2347'); gr.addColorStop(0.62, '#2b4a7a'); gr.addColorStop(1, '#0b1426');
            x.fillStyle = gr; x.fillRect(0, 0, 4, 256);
        });
        scene.add(new THREE.Mesh(new THREE.SphereGeometry(500, 24, 12), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false })));
    }
    scene.add(new THREE.HemisphereLight(0xbcd2ff, 0x2a3a1a, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-40, 80, 30); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -110, near: 10, far: 250 });
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffe7c4, 0.7); fill.position.set(50, 60, -80); scene.add(fill);

    const grassTex = canvasTex(256, 256, (x, w, h) => {
        for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#2f7d3a' : '#378a43'; x.fillRect(0, i * h / 8, w, h / 8); }
        for (let i = 0; i < 2500; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    }, [14, 14]);
    grassTex.rotation = ang(45);
    const flat = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true; scene.add(m); return m; };
    flat(new THREE.CircleGeometry(200, 48), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.95 }), 0);
    const dirt = new THREE.MeshStandardMaterial({ color: 0xb5754a, roughness: 1 });
    flat(new THREE.CircleGeometry(39, 48, ang(42), ang(96)), dirt, 0.01);
    {
        const s = new THREE.Shape(); const k = 17.2;
        s.moveTo(0, 1.8); s.lineTo(k, k + 1.2); s.lineTo(0, 2 * k + 0.4); s.lineTo(-k, k + 1.2); s.closePath();
        flat(new THREE.ShapeGeometry(s), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.95 }), 0.02);
    }
    flat(new THREE.CircleGeometry(4.2, 32), dirt, 0.03);
    const mound = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.9, 0.25, 32), dirt);
    mound.position.set(0, 0.12, -18.44); mound.receiveShadow = true; scene.add(mound);
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    { const r = new THREE.Mesh(new THREE.BoxGeometry(0.61, 0.03, 0.15), white); r.position.set(0, 0.26, -18.44); scene.add(r); }
    for (const k of [1, 2, 3]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.38), white); b.position.copy(BASE[k]).setY(0.05); b.rotation.y = ang(45); scene.add(b); }
    {
        const s = new THREE.Shape(); s.moveTo(-0.215, 0); s.lineTo(0.215, 0); s.lineTo(0.215, 0.215); s.lineTo(0, 0.43); s.lineTo(-0.215, 0.215); s.closePath();
        const hp = flat(new THREE.ShapeGeometry(s), white, 0.04); hp.rotation.z = Math.PI;
    }
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xf4f4f4 });
    for (const d of [45, 135]) {
        const len = wallR(d); const m = new THREE.Mesh(new THREE.PlaneGeometry(0.1, len), lineMat);
        m.rotation.x = -Math.PI / 2; m.rotation.z = ang(d - 90); m.position.copy(dirOf(d).multiplyScalar(len / 2)).setY(0.045); scene.add(m);
    }
    for (const sx of [-1, 1]) {
        const l = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.22, 1.83)), new THREE.LineBasicMaterial({ color: 0xffffff }));
        l.rotation.x = -Math.PI / 2; l.position.set(sx * 0.95, 0.05, 0); scene.add(l);
    }
    const track = new THREE.Mesh(ringGeo(-4.5, 0, 0.02, 0.02, 0, 360, 120), new THREE.MeshStandardMaterial({ color: 0x9c6a45, roughness: 1, side: THREE.DoubleSide }));
    track.receiveShadow = true; scene.add(track);
    const padTex = canvasTex(256, 64, (x, w, h) => {
        x.fillStyle = '#163d2a'; x.fillRect(0, 0, w, h); x.fillStyle = '#ffd34d'; x.fillRect(0, 0, w, 4);
        x.fillStyle = 'rgba(255,255,255,.8)'; x.font = 'bold 20px sans-serif'; x.fillText('작전타임', 86, 40);
    }, [1, 1]);
    padTex.wrapS = THREE.RepeatWrapping;
    scene.add(new THREE.Mesh(wallGeo(0, 360, 3, 120), new THREE.MeshStandardMaterial({ map: padTex, side: THREE.DoubleSide, roughness: 0.8 })));
    scene.add(new THREE.Mesh(wallGeo(80, 100, 9, 10, 1.5), new THREE.MeshStandardMaterial({ color: 0x0f1e17, side: THREE.DoubleSide })));
    const crowdTex = canvasTex(1024, 256, (x, w, h) => {
        x.fillStyle = '#1b2433'; x.fillRect(0, 0, w, h);
        const cols = ['#ffffff', '#e6e6e6', '#2b4f8f', '#ffd34d', '#b8c2cf', '#e05252', '#f39c3d', '#3aa36b'];
        for (let r = 0; r < 16; r++) {
            x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, r * 16 + 12, w, 3);
            for (let i = 0; i < 160; i++) { x.fillStyle = cols[(Math.random() * cols.length) | 0]; x.fillRect(i * 6.4 + Math.random() * 2, r * 16 + 2 + Math.random() * 4, 4, 7); }
        }
    });
    crowdTex.wrapS = THREE.RepeatWrapping;
    const crowdMat = new THREE.MeshStandardMaterial({ map: crowdTex, roughness: 1, side: THREE.DoubleSide });
    for (const [a0, a1] of [[-75, 78], [102, 255]]) { const m = new THREE.Mesh(ringGeo(2, 34, 3, 26, a0, a1, 70), crowdMat); m.receiveShadow = true; scene.add(m); }
    for (const d of [20, 62, 118, 160, 220, 320]) {
        const p = dirOf(d).multiplyScalar(wallR(d) + 36);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 40, 8), new THREE.MeshStandardMaterial({ color: 0x5b6573 }));
        pole.position.set(p.x, 20, p.z); scene.add(pole);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 1), new THREE.MeshBasicMaterial({ color: 0xfff6d8 }));
        lamp.position.set(p.x, 41, p.z); lamp.lookAt(0, 0, 0); scene.add(lamp);
    }
}

// ---------------- 선수 ----------------
function makePlayer(glove) {
    const g = new THREE.Group();
    const mats = {
        jersey: new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.7 }),
        pants: new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.7 }),
        cap: new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.7 }),
    };
    const skin = new THREE.MeshStandardMaterial({ color: 0xf1c7a1, roughness: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const body = new THREE.Group(); g.add(body);
    const legs = [];
    for (const sx of [-1, 1]) {
        const leg = new THREE.Group(); leg.position.set(sx * 0.12, 0.92, 0); body.add(leg);
        const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.68, 3, 8), mats.pants); m.position.y = -0.44; leg.add(m);
        const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.26), dark); shoe.position.set(0, -0.88, 0.05); leg.add(shoe);
        legs.push(leg);
    }
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.42, 3, 10), mats.jersey); torso.position.y = 1.25; body.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), skin); head.position.y = 1.7; body.add(head);
    const capTop = new THREE.Mesh(new THREE.SphereGeometry(0.138, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), mats.cap); capTop.position.y = 1.72; body.add(capTop);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 12, 1, false, -Math.PI / 2, Math.PI), mats.cap); brim.position.set(0, 1.72, 0.1); body.add(brim);
    const arms = [];
    for (const sx of [-1, 1]) {
        const arm = new THREE.Group(); arm.position.set(sx * 0.3, 1.48, 0); body.add(arm);
        const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.48, 3, 8), mats.jersey); m.position.y = -0.3; arm.add(m);
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), glove && sx === 1 ? new THREE.MeshStandardMaterial({ color: 0x6b3a1e }) : skin); hand.position.y = -0.6; arm.add(hand);
        arms.push(arm);
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return { g, body, legs, lArm: arms[0], rArm: arms[1], mats };
}
let stripeTex = null;
function getStripeTex() {
    if (!stripeTex) {
        stripeTex = canvasTex(128, 32, (x, w, h) => {
            x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
            x.fillStyle = '#1a1a1a'; for (let i = 0; i < 8; i++) x.fillRect(i * 16 + 7, 0, 2.2, h);
        }, [1, 1]);
    }
    return stripeTex;
}
function kit(p, k) {
    const st = k.stripe ? getStripeTex() : null;
    for (const key of ['jersey', 'pants']) {
        const m = p.mats[key];
        m.color.set(k[key]);
        if (m.map !== st) { m.map = st; m.needsUpdate = true; }
    }
    p.mats.cap.color.set(k.cap);
}
// 포수·심판 마스크 (얼굴 앞 검은 틀 + 가로 창살), 포수는 가슴 보호대도
function addMask(p, chest) {
    const black = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.5, metalness: 0.3 });
    const mask = new THREE.Group(); mask.position.set(0, 1.69, 0.1); p.body.add(mask);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.27, 0.035), black); mask.add(frame);
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), black); pad.position.set(0, 0.02, -0.1); pad.scale.set(1, 1.05, 1); mask.add(pad);
    for (const y of [-0.07, 0, 0.07]) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.018, 0.03), black); bar.position.set(0, y, 0.035); mask.add(bar); }
    const throat = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), black); throat.position.set(0, -0.17, 0.02); mask.add(throat);
    if (chest) {
        const cp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.46, 0.1), black); cp.position.set(0, 1.25, 0.17); p.body.add(cp);
        for (const sx of [-1, 1]) { const shin = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.5, 0.08), black); shin.position.set(0, -0.6, 0.08); p.legs[sx < 0 ? 0 : 1].add(shin); }
    }
    mask.traverse(o => { if (o.isMesh) o.castShadow = true; });
}
const facing = (p, t) => Math.atan2(t.x - p.x, t.z - p.z);
const HOMEPLATE = new THREE.Vector3();

function buildPlayers() {
    pitcher = makePlayer(true); pitcher.g.position.set(0, 0.25, -18.44); scene.add(pitcher.g);
    catcher = makePlayer(true); catcher.g.position.set(0, 0, 1.25); catcher.g.rotation.y = Math.PI; catcher.g.scale.y = 0.62; scene.add(catcher.g); addMask(catcher, true);
    catcher.lArm.rotation.x = -1.2; catcher.rArm.rotation.x = -1.4;
    ump = makePlayer(false); kit(ump, { jersey: 0x1a1d24, pants: 0x4a4f58, cap: 0x1a1d24 }); addMask(ump, false);
    ump.g.position.set(0, 0, 2.3); ump.g.rotation.y = Math.PI; ump.g.scale.y = 0.8; scene.add(ump.g);
    for (const [k, [x, z]] of Object.entries(FIELD)) {
        const p = makePlayer(true); p.home = new THREE.Vector3(x, 0, z); scene.add(p.g); fielders[k] = p;
    }
    batter = makePlayer(false); scene.add(batter.g);
    batPivot = new THREE.Group(); batPivot.position.set(0.05, 1.3, 0.05); batter.body.add(batPivot);
    const bat = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.018, 0.86, 10), new THREE.MeshStandardMaterial({ color: 0xd9b07a, roughness: 0.5 }));
    bat.position.y = 0.48; bat.castShadow = true; batPivot.add(bat);
    batter.lArm.rotation.set(-1.0, 0, 0.5); batter.rArm.rotation.set(-1.1, 0, -0.5);
    for (let i = 0; i < 3; i++) { const r = makePlayer(false); r.g.visible = false; scene.add(r.g); runners.push(r); }

    ball = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.55 }));
    ball.castShadow = true; ball.visible = false; scene.add(ball);
    trailGeo = new THREE.BufferGeometry(); trailGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(14 * 3), 3));
    trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
    trail.frustumCulled = false; trail.visible = false; scene.add(trail);
}
function pushTrail(p) {
    trailPts.unshift(p.clone()); if (trailPts.length > 14) trailPts.pop();
    const a = trailGeo.attributes.position;
    for (let i = 0; i < 14; i++) { const q = trailPts[Math.min(i, trailPts.length - 1)]; a.setXYZ(i, q.x, q.y, q.z); }
    a.needsUpdate = true; trail.visible = true;
}
function hideBall() { ball.visible = false; trail.visible = false; trailPts.length = 0; ball.scale.setScalar(1); }

// 타자 자세: 우타자는 3루 쪽(-x)에서 +x를 봄, 좌타자는 반대
const Y = new THREE.Vector3(0, 1, 0);
const qFrom = (x, y, z) => new THREE.Quaternion().setFromUnitVectors(Y, new THREE.Vector3(x, y, z).normalize());
function setBatterSide(side) {
    const L = side === 'L', m = L ? -1 : 1;
    batter.side = L ? 'L' : 'R';
    batter.spot = new THREE.Vector3(L ? 0.95 : -0.95, 0, 0.05);
    batter.g.position.copy(batter.spot); batter.g.rotation.set(0, L ? -Math.PI / 2 : Math.PI / 2, 0);
    BAT = { stance: qFrom(-0.55 * m, 0.85, -0.15), contact: qFrom(0.05 * m, 0.05, 1), follow: qFrom(0.75 * m, 0.35, -0.4) };
    batPivot.quaternion.copy(BAT.stance); batPivot.visible = true;
    batter.body.rotation.set(0, 0, 0); batter.legs.forEach(l => l.rotation.x = 0);
    batter.g.visible = true;
}

// ---------------- 카메라 ----------------
let camMode = 'cf';
const camLook = new THREE.Vector3();
function cfFov() {
    const a = camera.aspect || 1.6;
    // 세로로 긴 화면에서도 투수·타자·포수가 좌우로 다 들어오게
    const need = 2 * Math.atan(Math.tan(ang(2.7) / 2) / a) * 180 / Math.PI;
    return Math.max(3.3, need);
}
function setCF() {
    camMode = 'cf'; camera.position.set(1.4, 10, -112); camera.fov = cfFov(); camera.updateProjectionMatrix();
    camLook.set(0, 0.95, -2); camera.lookAt(camLook); if (camEl) camEl.textContent = '중계 카메라';
}
function setHigh(from) {
    camMode = 'high'; camera.position.set(-6, 20, 30); camera.fov = 48; camera.updateProjectionMatrix();
    camLook.copy(from); camera.lookAt(camLook); if (camEl) camEl.textContent = '타구 추적';
}
function trackBall(p, t, far) {
    camLook.lerp(p, 0.35); camera.lookAt(camLook);
    camera.fov = lerp(48, far ? 22 : 32, ease(Math.min(1, t * 3))); camera.updateProjectionMatrix();
}

// ---------------- 애니메이션 ----------------
const tweens = [];
let TS = 1;   // 시간 배속 (밀린 투구가 있으면 빠르게)
const tween = (dur, fn) => new Promise(res => tweens.push({ t0: performance.now(), dur: Math.max(1, dur * 1000 / TS), fn, res }));
const wait = (s) => tween(s, () => {});

async function windup() {
    const p = pitcher;
    await tween(0.55, t => { const e = ease(t); p.legs[0].rotation.x = -1.3 * e; p.body.rotation.y = 0.6 * e; p.rArm.rotation.x = 0.6 * e; p.lArm.rotation.x = -0.6 * e; });
    await tween(0.32, t => {
        const e = ease(t); p.legs[0].rotation.x = lerp(-1.3, 0.25, e); p.body.rotation.y = lerp(0.6, -0.2, e); p.body.position.z = 0.45 * e;
        p.rArm.rotation.x = lerp(0.6, -2.9, e); p.lArm.rotation.x = lerp(-0.6, -1.4, e);
    });
}
async function followThrough() {
    const p = pitcher;
    await tween(0.25, t => { const e = ease(t); p.rArm.rotation.x = lerp(-2.9, 1.0, e); p.body.rotation.x = 0.35 * e; p.lArm.rotation.x = lerp(-1.4, 0.3, e); });
    await tween(0.5, t => {
        const e = ease(t); p.legs[0].rotation.x = lerp(0.25, 0, e); p.body.rotation.set(lerp(0.35, 0, e), lerp(-0.2, 0, e), 0);
        p.body.position.z = lerp(0.45, 0, e); p.rArm.rotation.x = lerp(1.0, 0, e); p.lArm.rotation.x = lerp(0.3, 0, e);
    });
}
async function swing() {
    const dur = 0.42, c = 0.45, m = batter.side === 'L' ? -1 : 1;
    await tween(dur, t => {
        const q = t < c ? BAT.stance.clone().slerp(BAT.contact, ease(t / c)) : BAT.contact.clone().slerp(BAT.follow, ease((t - c) / (1 - c)));
        batPivot.quaternion.copy(q); batter.body.rotation.y = -0.9 * m * Math.min(1, t / c);
    });
    await tween(0.45, t => { batPivot.quaternion.copy(BAT.follow.clone().slerp(BAT.stance, ease(t))); batter.body.rotation.y = lerp(-0.9 * m, 0, ease(t)); });
}

// 투구 종류별 휘는 정도 (투수 쪽에서 본 방향은 우투 기준, 좌투면 좌우 반대)
function pitchProfile(desc) {
    const m = String(desc || '').match(/(\d+)\s*km\/h\s*(.*)/);
    const spd = m ? +m[1] : 140, type = m ? m[2].trim() : '직구';
    let ctrl = [0, 0.35, 0];
    if (/슬라이더|커터/.test(type)) ctrl = [0.55, 0.25, 0];
    else if (/커브/.test(type)) ctrl = [0.15, 1.05, 0];
    else if (/체인지업|포크|스플리터/.test(type)) ctrl = [-0.3, 0.55, 0];
    else if (/투심|싱커/.test(type)) ctrl = [-0.25, 0.3, 0];
    return { spd, type, ctrl };
}
// 서버의 투구 위치(pz_x, pz_y: 존 안은 ±0.65)를 미터로
function pitchLoc(lp) {
    const x = clamp((lp.pz_x || 0) / 0.65 * 0.2, -0.6, 0.6);
    const y = clamp(0.78 - (lp.pz_y || 0) / 0.65 * 0.27, 0.18, 1.45);
    return [x, y];
}

function showTag(spd, type, res, color) {
    if (!tagEl) return;
    tagSpd.textContent = spd + 'km/h'; tagType.textContent = type;
    tagRes.textContent = res; tagRes.style.background = color;
    tagEl.classList.add('show');
    clearTimeout(showTag._t); showTag._t = setTimeout(() => tagEl.classList.remove('show'), 3200);
}

// 스트라이크 존 (투수 쪽에서 본 모습 = 중계 화면과 같은 방향)
function markColor(p) {
    const c = p.code;
    if (c === 'BALL') return '#3fd07a';
    if (c === 'STRIKE' || c === 'FOUL') return '#ffc531';
    if ((p.play && p.play.kind === 'K') || String(p.result || '').includes('삼진')) return '#ffc531';
    return '#6cb8ff';
}
function zoneAdd(p, isLast) {
    if (!zoneEl) return;
    const [x, y] = pitchLoc(p);
    // 상자: 가로 22~52px(존 ±0.215m), 세로 22~66px(0.48~1.08m)
    const left = clamp(37 + (-x / 0.215) * 15, 8, 66), top = clamp(66 - ((y - 0.48) / 0.6) * 44, 8, 84);
    const m = document.createElement('div'); m.className = 'mk' + (isLast ? ' last' : '');
    m.style.left = left + 'px'; m.style.top = top + 'px'; m.style.background = markColor(p);
    m.textContent = p.seq || '';
    zoneEl.appendChild(m);
}
function zoneSet(pitches) {
    if (!zoneEl) return;
    zoneEl.querySelectorAll('.mk').forEach(m => m.remove());
    (pitches || []).forEach(p => zoneAdd(p, false));
}

// 주자 이동: 이번 공 전 주자 → 공 후 주자 (이름으로 맞춤). 못 찾은 주자는 득점 또는 아웃
function basesOf(obj) { return { 1: obj && (obj[1] || obj['1']) || null, 2: obj && (obj[2] || obj['2']) || null, 3: obj && (obj[3] || obj['3']) || null }; }
function pathPoint(from, to, t) {
    // 베이스를 차례로 따라 이동 (from, to: 0=홈, 1·2·3루, 4=홈)
    const seg = (to - from) * t, i = Math.min(to - 1, from + Math.floor(seg)), f = seg - Math.floor(seg);
    if (t >= 1) return BASE[to].clone();
    return BASE[i].clone().lerp(BASE[i + 1], f);
}
function runnerOffset(b) { return b === 1 ? new THREE.Vector3(0.9, 0, 0.6) : b === 2 ? new THREE.Vector3(-0.7, 0, -0.7) : b === 3 ? new THREE.Vector3(-0.9, 0, 0.6) : new THREE.Vector3(); }
function placeRunners(bases, offenseKit) {
    const b = basesOf(bases);
    [1, 2, 3].forEach((k, i) => {
        const r = runners[i]; r.g.visible = !!b[k]; r.name = b[k];
        if (offenseKit) kit(r, offenseKit);
        r.g.position.copy(BASE[k]).add(runnerOffset(k)); r.g.rotation.y = facing(BASE[k], BASE[k + 1]);
        r.legs.forEach(l => l.rotation.x = 0); r.g.scale.setScalar(1);
    });
}
function animateRunners(lp, dur, batterTarget) {
    const before = basesOf(lp.bases_before), after = basesOf(lp.bases_after);
    const where = (name) => [1, 2, 3].find(k => after[k] === name) || 0;
    const play = lp.play || {};
    let runs = play.runs || 0;
    const moves = [];
    [3, 2, 1].forEach(k => {
        const name = before[k]; if (!name) return;
        const r = runners[k - 1];
        let to = where(name), out = false;
        if (!to) { if (runs > 0) { to = 4; runs--; } else { to = Math.min(4, k + 1); out = true; } }
        if (to !== k) moves.push({ fig: r, from: k, to, out });
    });
    if (batterTarget !== null && batterTarget !== undefined) {
        let to = batterTarget, out = false;
        if (to === 'auto') { to = where(lp.batter); if (!to) { if (play.kind === 'HOMERUN') to = 4; else { to = 1; out = true; } } }
        batPivot.visible = false;
        moves.push({ fig: batter, from: 0, to, out, isBatter: true });
    }
    if (!moves.length) return Promise.resolve();
    return tween(dur, t => {
        for (const m of moves) {
            const tt = Math.min(1, t * (m.isBatter ? 1 : 1.1));
            const p = pathPoint(m.from, m.to, tt);
            m.fig.g.position.set(p.x, 0, p.z);
            const nxt = BASE[Math.min(4, m.from + Math.ceil((m.to - m.from) * tt + 0.001))];
            m.fig.g.rotation.y = facing(m.fig.g.position, nxt);
            const sw = tt < 1 ? Math.sin(t * dur * 14) * 0.7 : 0;
            m.fig.legs[0].rotation.x = sw; m.fig.legs[1].rotation.x = -sw;
            if (tt >= 1 && (m.out || m.to === 4)) m.fig.g.visible = m.isBatter ? m.fig.g.visible && !m.out && m.to !== 4 : false;
        }
    });
}

// ---------------- 투구 하나 그리기 ----------------
let lastSerial = -1;
let lastState = null;
let pendingSync = null;
const queue = [];

// 구단별 유니폼 (상의 · 바지 · 모자)
const TEAM_KITS = {
    'LG':  { jersey: 0xf6f6f6, pants: 0xf6f6f6, cap: 0x151515, stripe: true },   // 흰색 + 검은 세로 줄무늬
    '한화': { jersey: 0xf37321, pants: 0xf2f2f2, cap: 0x1b1b1b },
    'NC':  { jersey: 0x1a9a9a, pants: 0xf2f2f2, cap: 0x13324f },
    '삼성': { jersey: 0x1f5fc4, pants: 0xf2f2f2, cap: 0x1f5fc4 },
    '롯데': { jersey: 0x7cc3f0, pants: 0xf2f2f2, cap: 0x0f2a5c },
    'KT':  { jersey: 0x161616, pants: 0xf2f2f2, cap: 0x161616 },
    '키움': { jersey: 0x7a1e3a, pants: 0xf2f2f2, cap: 0x7a1e3a },
    '두산': { jersey: 0x14204a, pants: 0xf2f2f2, cap: 0x14204a },
    'KIA': { jersey: 0xd3262e, pants: 0x161616, cap: 0x161616 },
    'SSG': { jersey: 0xd52b35, pants: 0xf4f4f4, cap: 0xd52b35 },
};
function teamKit(name) {
    const short = (opts.short && opts.short(name)) || name;
    if (TEAM_KITS[short]) return TEAM_KITS[short];
    const c = (opts.color && opts.color(name)) || '#888888';
    return { jersey: c, pants: 0xf2f2f2, cap: c };
}
function kits(state, isTop) {
    const H = teamKit(state.home_team), A = teamKit(state.away_team);
    return isTop ? { off: A, def: H } : { off: H, def: A };
}
function resetFielders() {
    for (const f of Object.values(fielders)) {
        f.g.position.copy(f.home); f.g.rotation.y = facing(f.home, HOMEPLATE);
        f.lArm.rotation.x = -0.4; f.rArm.rotation.x = -0.4; f.legs.forEach(l => l.rotation.x = 0);
    }
}
function applySync(s) {
    lastState = s;
    const k = kits(s, s.is_top !== false);
    [pitcher, catcher, ...Object.values(fielders)].forEach(p => kit(p, k.def));
    kit(batter, k.off);
    resetFielders();
    pitcher.body.rotation.set(0, 0, 0); pitcher.body.position.set(0, 0, 0); pitcher.legs.forEach(l => l.rotation.x = 0);
    pitcher.rArm.rotation.x = 0; pitcher.lArm.rotation.x = 0;
    setBatterSide(s.batter_side);
    batter.g.visible = !s.game_over;
    placeRunners({ 1: s.runner_1b ? (s.runner_1b_name || '주자') : null, 2: s.runner_2b ? (s.runner_2b_name || '주자') : null, 3: s.runner_3b ? (s.runner_3b_name || '주자') : null }, k.off);
    hideBall(); setCF();
    const sess = (s.batter_sessions || [])[0];
    zoneSet(sess && sess.pitches);
}

async function animatePitch(job) {
    const { lp, state, resolve } = job;
    const k = kits(state, lp.is_top !== false);
    [pitcher, catcher, ...Object.values(fielders)].forEach(p => kit(p, k.def));
    kit(batter, k.off);
    resetFielders(); setCF();
    setBatterSide(lp.batter_side);
    placeRunners(lp.bases_before, k.off);

    const serial = lp.serial || 0;
    const P = pitchProfile(lp.speed_type);
    const [px, py] = pitchLoc(lp);
    const play = lp.play, kind = play && play.kind;
    const code = lp.code;
    const inZone = Math.abs(px) <= 0.23 && py >= 0.48 && py <= 1.08;
    const inPlay = !!play && !['K', 'WALK'].includes(kind);
    let swings = code === 'FOUL' || inPlay;
    if (code === 'STRIKE' || kind === 'K') swings = kind === 'K' ? (play.dir === '헛스윙') : (!inZone || hrand(serial, 1) < 0.4);

    await windup();
    const hand = lp.throws === 'L' ? 1 : -1;
    const start = new THREE.Vector3(0.45 * hand, 2.0, -17.2);
    const end = new THREE.Vector3(px, py, inPlay ? -0.25 : 1.15);
    const c = P.ctrl;
    const ctrl = start.clone().lerp(end, 0.5).add(new THREE.Vector3(c[0] * -hand, c[1], c[2]));
    const flight = (17.5 / (P.spd / 3.6)) * 1.5;
    ball.visible = true; trailPts.length = 0;
    followThrough();
    if (swings) setTimeout(() => swing(), Math.max(0, (flight - 0.42 * 0.45) * 1000 / TS));
    await tween(flight, t => {
        const a = start.clone().lerp(ctrl, t), b = ctrl.clone().lerp(end, t), p = a.lerp(b, t);
        ball.position.copy(p); pushTrail(p);
    });

    // 투구 결과 자막
    let res = '볼', color = '#3fd07a';
    if (code === 'STRIKE' || kind === 'K') { res = swings ? '헛스윙' : '루킹 스트라이크'; color = '#ffc531'; if (kind === 'K') res = swings ? '헛스윙 삼진' : '루킹 삼진'; }
    else if (code === 'FOUL') { res = '파울'; color = '#ffc531'; }
    else if (kind === 'WALK') { res = '볼넷'; color = '#3fd07a'; }
    else if (inPlay) { res = '타격'; color = '#6cb8ff'; }
    showTag(P.spd, P.type, res, color);
    zoneAdd(lp, true);

    if (!inPlay) {
        if (code === 'FOUL') {
            const s0 = ball.position.clone(), s1 = new THREE.Vector3(hr(serial, 2, -5, 5), 0, hr(serial, 3, 12, 20));
            resolve();
            await tween(0.8, t => { const p = s0.clone().lerp(s1, t); p.y = lerp(s0.y, 0.1, t) + 7 * Math.sin(Math.PI * t); ball.position.copy(p); pushTrail(p); });
        } else {
            resolve();
            await wait(0.25);
        }
        hideBall();
        if (kind === 'WALK') await animateRunners(lp, 2.2, 1);
        return;
    }
    await battedBall(lp, end, resolve);
}

async function battedBall(lp, from, resolve) {
    const serial = lp.serial || 0, play = lp.play, kind = play.kind;
    let deg = 90, dist = 50, apex = 6, groundBall = false, catchIt = false, fielderKey = null, lineDrive = false;
    const posKey = POS_KO[play.pos] || 'SS', ofKey = POS_KO[play.of] || 'CF';
    const spot = (key) => new THREE.Vector3(...[FIELD[key][0], 0, FIELD[key][1]]);
    const degTo = (v) => Math.atan2(-v.z, v.x) * 180 / Math.PI;

    if (kind === 'GROUND' || kind === 'ERROR') {
        fielderKey = posKey; const s = spot(posKey); deg = degTo(s) + hr(serial, 4, -4, 4); dist = s.length() - 2; apex = 0.8; groundBall = true; catchIt = kind === 'GROUND';
    } else if (kind === 'LINE') {
        fielderKey = posKey; const s = spot(posKey); deg = degTo(s) + hr(serial, 4, -3, 3); dist = s.length() - 1; apex = 1.6; lineDrive = true; catchIt = true;
    } else if (kind === 'FLY') {
        fielderKey = ofKey; const s = spot(ofKey); deg = degTo(s) + hr(serial, 4, -8, 8); dist = s.length() + hr(serial, 5, -14, 6); apex = hr(serial, 6, 20, 28); catchIt = true;
    } else if (kind === 'SINGLE') {
        deg = (DIR_DEG[play.dir] || 90) + hr(serial, 4, -5, 5); dist = hr(serial, 5, 50, 62); apex = hr(serial, 6, 5, 9);
    } else if (kind === 'DOUBLE') {
        deg = (DIR_DEG[play.dir] || 74) + hr(serial, 4, -3, 3); dist = wallR(deg) - 4; apex = hr(serial, 6, 12, 17);
    } else if (kind === 'TRIPLE') {
        deg = 72 + hr(serial, 4, -3, 3); dist = wallR(deg) - 2; apex = 15;
    } else if (kind === 'HOMERUN') {
        deg = hr(serial, 4, 60, 120); dist = Math.max(play.dist || 115, wallR(deg) + 8); apex = hr(serial, 6, 26, 33);
    }
    const land = dirOf(deg).multiplyScalar(dist);
    if (!fielderKey) {   // 안타: 가장 가까운 외야수가 쫓아감
        let bd = 1e9; for (const [k2, f] of Object.entries(fielders)) { const d = f.home.distanceTo(land); if (d < bd && ['LF', 'CF', 'RF'].includes(k2)) { bd = d; fielderKey = k2; } }
    }
    const fielder = fielders[fielderKey];
    const dur = groundBall ? dist / 26 : lineDrive ? 0.55 : dist / 30 + apex / 14 + 0.5;
    const far = dist > 55;

    if (!groundBall && !lineDrive) { setHigh(from); ball.scale.setScalar(2.2); }
    else { setHigh(from); camera.fov = 40; camera.updateProjectionMatrix(); }

    const fStart = fielder.g.position.clone();
    const catchSpot = kind === 'HOMERUN' ? dirOf(deg).multiplyScalar(wallR(deg) - 1.5) : land.clone();
    // 타자와 주자는 맞는 순간부터 뛰기 시작 (아웃이면 공 잡힌 뒤 멈춤)
    const runDur = kind === 'HOMERUN' ? 6.5 : kind === 'TRIPLE' ? 5.5 : kind === 'DOUBLE' ? 4.5 : 3.6;
    const runP = (kind === 'FLY' || kind === 'LINE') ? null : animateRunners(lp, runDur, 'auto');
    const p0 = from.clone();
    await tween(dur, t => {
        const p = p0.clone().lerp(land, t);
        if (groundBall) p.y = 0.08 + Math.abs(Math.sin(t * Math.PI * 4)) * apex * (1 - t);
        else p.y = lerp(p0.y, lineDrive ? 1.5 : 0.9, t) + apex * 4 * t * (1 - t);
        ball.position.copy(p); pushTrail(p);
        trackBall(p, t, far);
        if (kind !== 'HOMERUN' || t < 0.85) {
            const fp = fStart.clone().lerp(catchSpot, ease(Math.min(1, t * 1.15)));
            fielder.g.position.set(fp.x, 0, fp.z);
            fielder.g.rotation.y = facing(fielder.g.position, catchSpot.distanceTo(fielder.g.position) > 0.5 ? catchSpot : HOMEPLATE);
            const sw = Math.sin(t * dur * 14) * 0.6 * (1 - t); fielder.legs[0].rotation.x = sw; fielder.legs[1].rotation.x = -sw;
        }
    });

    if (catchIt) {
        fielder.lArm.rotation.x = -2.6; fielder.legs.forEach(l => l.rotation.x = 0);
        resolve();
        if (kind === 'GROUND') {
            // 1루로 송구 (병살이면 2루 거쳐 1루)
            const targets = (play.outs_added || 1) >= 2 ? [BASE[2], BASE[1]] : [BASE[1]];
            let from2 = ball.position.clone().setY(1.2);
            for (const tg of targets) {
                const to2 = tg.clone().setY(1.2);
                await tween(0.55, t => { const p = from2.clone().lerp(to2, t); p.y += 2.2 * Math.sin(Math.PI * t); ball.position.copy(p); pushTrail(p); trackBall(p, 0.4, false); });
                from2 = to2;
            }
        } else {
            // 뜬공·직선타: 잡은 뒤 주자 진루(희생플라이 등)
            await Promise.all([wait(0.6), animateRunners(lp, 2.6, null)]);
        }
        await (runP || Promise.resolve());
        hideBall();
        await wait(0.5);
        return;
    }
    // 안타·실책·홈런
    resolve();
    if (kind === 'ERROR') {
        // 공이 수비수 뒤로 빠짐
        const s0 = ball.position.clone(), s1 = s0.clone().add(dirOf(deg).multiplyScalar(9));
        await tween(0.7, t => { const p = s0.clone().lerp(s1, t); p.y = 0.08; ball.position.copy(p); pushTrail(p); });
    } else if (kind !== 'HOMERUN') {
        // 외야수가 공을 잡아 내야로 던짐
        const s0 = ball.position.clone(), s1 = s0.clone().add(dirOf(deg).multiplyScalar(kind === 'SINGLE' ? 4 : 2)).setY(0.1);
        await tween(0.5, t => { const p = s0.clone().lerp(s1, t); ball.position.copy(p); pushTrail(p); const fp = fielder.g.position.clone().lerp(s1, t); fielder.g.position.set(fp.x, 0, fp.z); });
        const to = BASE[2].clone().setY(1.5), s2 = s1.clone().setY(1.6);
        await tween(1.0, t => { const p = s2.clone().lerp(to, t); p.y += 6 * Math.sin(Math.PI * t); ball.position.copy(p); pushTrail(p); trackBall(p, 1, false); });
    }
    hideBall();
    await (runP || Promise.resolve());
    await wait(0.6);
}

async function runQueue() {
    if (B3D.busy) return;
    B3D.busy = true;
    while (queue.length) {
        const job = queue.shift();
        TS = queue.length ? 3 : 1;
        let resolved = false;
        const res = job.resolve; job.resolve = () => { if (!resolved) { resolved = true; res(); } };
        try { await animatePitch(job); } catch (e) { console.warn('3D 중계 오류', e); }
        job.resolve();
        lastSerial = Math.max(lastSerial, job.lp.serial || 0);
        if (!queue.length) { applySync(pendingSync || job.state); pendingSync = null; }
    }
    TS = 1;
    B3D.busy = false;
}

// ---------------- 바깥에서 쓰는 함수 ----------------
B3D.ensure = function (stage, options) {
    if (B3D.failed) return false;
    if (options) opts = options;
    if (!B3D.ready) {
        try { build(stage); B3D.ready = true; }
        catch (e) { console.warn('3D 중계를 켤 수 없어요', e); B3D.failed = true; return false; }
    }
    if (stage && stage !== stageEl) attach(stage);
    return true;
};
// 애니메이션 없이 지금 상태로 맞춤 (처음 들어올 때·새로고침 뒤)
B3D.sync = function (s) {
    if (!B3D.ready || !s) return;
    if (B3D.busy || queue.length) { pendingSync = s; return; }
    lastSerial = Math.max(lastSerial, s.pitch_serial || 0);
    applySync(s);
};
// 새 투구를 그림. 돌려주는 Promise는 '결과가 보이는 순간'(공이 미트에 들어가거나 타구가 떨어질 때) 끝남
B3D.play = function (s) {
    if (!B3D.ready || !s) return Promise.resolve();
    const lp = s.last_pitch;
    if (!lp || (lp.serial || 0) <= lastSerial || queue.some(j => j.lp.serial === lp.serial)) { B3D.sync(s); return Promise.resolve(); }
    return new Promise(resolve => { queue.push({ lp, state: s, resolve }); runQueue(); });
};

function attach(stage) {
    stageEl = stage;
    stage.classList.add('b3d-on');
    stage.prepend(host);
    resize();
}

function build(stage) {
    const css = document.createElement('style');
    css.textContent = `
    .ig-stage.b3d-on { background: #0b111b; }
    .ig-stage.b3d-on .ig-field { display: none !important; }
    .ig-stage.b3d-on .ig-last { z-index: 2; }
    .b3d { position: absolute; inset: 0; z-index: 0; }
    .b3d canvas { width: 100% !important; height: 100% !important; display: block; }
    .b3d-tag { position: absolute; left: 10px; bottom: 10px; z-index: 1; background: rgba(10,16,28,.9); border-radius: 8px; padding: 5px 10px;
        font-weight: 800; font-size: 13px; display: flex; gap: 7px; align-items: center; color: #e8edf3;
        opacity: 0; transform: translateY(6px); transition: .25s; pointer-events: none; }
    .b3d-tag.show { opacity: 1; transform: none; }
    .b3d-tag .spd { color: #ffd34d; font-variant-numeric: tabular-nums; }
    .b3d-tag .res { font-size: 11.5px; padding: 1px 7px; border-radius: 5px; color: #0b111b; }
    .b3d-zone { position: absolute; right: 10px; bottom: 10px; z-index: 1; width: 74px; height: 92px; border-radius: 10px;
        background: rgba(10,16,28,.78); pointer-events: none; }
    .b3d-zone .box { position: absolute; left: 22px; right: 22px; top: 22px; bottom: 26px; border: 1.5px solid rgba(255,255,255,.8);
        display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
    .b3d-zone .box i { border: .5px dashed rgba(255,255,255,.18); }
    .b3d-zone .mk { position: absolute; width: 15px; height: 15px; border-radius: 50%; transform: translate(-50%, -50%);
        font-size: 9px; font-weight: 900; color: #0b111b; display: flex; align-items: center; justify-content: center;
        box-shadow: 0 0 0 1.5px rgba(10,16,28,.9); }
    .b3d-zone .mk.last { animation: b3dPop .35s ease-out; }
    @keyframes b3dPop { from { transform: translate(-50%, -50%) scale(1.8); } to { transform: translate(-50%, -50%) scale(1); } }`;
    document.head.appendChild(css);

    host = document.createElement('div'); host.className = 'b3d';
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    host.appendChild(renderer.domElement);
    tagEl = document.createElement('div'); tagEl.className = 'b3d-tag';
    tagEl.innerHTML = '<span class="spd"></span><span class="typ"></span><span class="res"></span>';
    tagSpd = tagEl.querySelector('.spd'); tagType = tagEl.querySelector('.typ'); tagRes = tagEl.querySelector('.res');
    zoneEl = document.createElement('div'); zoneEl.className = 'b3d-zone';
    zoneEl.innerHTML = '<div class="box"><i></i><i></i><i></i><i></i></div>';
    host.appendChild(tagEl); host.appendChild(zoneEl);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1a33);
    scene.fog = new THREE.Fog(0x0d1a33, 220, 420);
    camera = new THREE.PerspectiveCamera(3.3, 1.6, 1, 1000);
    buildField(); buildPlayers(); resetFielders(); setBatterSide('R'); setCF();

    if (window.ResizeObserver) new ResizeObserver(resize).observe(host);
    window.addEventListener('resize', resize);
    requestAnimationFrame(loop);
    // 화면이 잠깐 가려져 rAF가 멈춰도 진행이 막히지 않게
    setInterval(() => { if (performance.now() - lastFrame > 150) frame(performance.now()); }, 60);
    attach(stage);
}

function resize() {
    if (!host || !renderer) return;
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    if (camMode === 'cf') camera.fov = cfFov();
    camera.updateProjectionMatrix();
}

let lastFrame = 0;
function frame(now) {
    lastFrame = now;
    for (let i = tweens.length - 1; i >= 0; i--) {
        const tw = tweens[i]; const t = Math.min(1, (now - tw.t0) / tw.dur);
        tw.fn(t); if (t >= 1) { tweens.splice(i, 1); tw.res(); }
    }
    const visible = host && host.isConnected && host.offsetParent !== null && document.visibilityState === 'visible';
    if (!visible) return;
    const k = Math.sin(now / 400) * 0.03;
    for (const f of Object.values(fielders)) f.body.rotation.z = k;
    renderer.render(scene, camera);
}
function loop(now) { frame(now); requestAnimationFrame(loop); }

// 이 파일이 늦게 불러와졌으면, 지금 경기 화면에 바로 3D를 켬
try { if (typeof window.drawBaseballField === 'function') window.drawBaseballField(); } catch (e) { /* 무시 */ }
