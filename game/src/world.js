// NEON BAY — world.js
// Builds Coral Bay: a dense avenue/street grid city, beach + animated bay,
// bridge to an island, docks, park with a rotating ferris wheel, market,
// streetlights, signs, boats, birds, clouds, neon. Everything is generated
// from a seeded RNG so the city is identical on every load.
//
// PERFORMANCE: static geometry is merged per material into a handful of big
// meshes (a few dozen draw calls total), so the game stays smooth even in a
// software renderer. Only things that move (wheel, boats, birds, clouds,
// neon signs, water) stay as separate objects.

import { WORLD } from './config.js';
import { mulberry32, clamp, lerp, pick, makeCanvas } from './util.js';

function facadeTexture(rng, base, floors, litRatio) {
  const c = makeCanvas(128, 256), x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, 128, 256);
  const g = x.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(0.5, 'rgba(255,255,255,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 256);
  const cols = 4, rows = Math.max(3, floors);
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const lit = rng() < litRatio;
      const wx = 12 + col * 28, wy = 14 + r * (220 / rows);
      if (lit) {
        x.fillStyle = rng() < 0.7 ? '#ffd98a' : '#9fd8ff';
        x.shadowColor = '#ffca66'; x.shadowBlur = 6;
      } else {
        x.fillStyle = '#1c2733'; x.shadowBlur = 0;
      }
      x.fillRect(wx, wy, 18, 13);
      x.shadowBlur = 0;
      x.strokeStyle = 'rgba(0,0,0,0.45)'; x.strokeRect(wx, wy, 18, 13);
    }
  }
  x.fillStyle = '#20262e'; x.fillRect(0, 232, 128, 24);
  x.fillStyle = '#ffd98a'; x.fillRect(8, 238, 40, 12);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function neonTexture(text, color, w = 256, h = 96) {
  const c = makeCanvas(w, h), x = c.getContext('2d');
  x.clearRect(0, 0, w, h);
  x.font = 'bold 52px Arial, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = color; x.shadowBlur = 22;
  x.strokeStyle = color; x.lineWidth = 3;
  x.strokeText(text, w / 2, h / 2 + 2);
  x.fillStyle = '#ffffff';
  x.shadowBlur = 10;
  x.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function signTexture(text, bg, fg) {
  const c = makeCanvas(256, 64), x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, 256, 64);
  x.fillStyle = fg; x.font = 'bold 34px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Merge many transformed parts into ONE BufferGeometry.
// part = { geo, x, y, z, rx, ry, rz, sx, sy, sz }
function mergeParts(parts) {
  const P = [], N = [], U = [], I = [];
  let vo = 0;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  for (const p of parts) {
    const geo = p.geo;
    e.set(p.rx || 0, p.ry || 0, p.rz || 0);
    q.setFromEuler(e);
    m.compose(
      new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0), q,
      new THREE.Vector3(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1));
    nm.getNormalMatrix(m);
    const pos = geo.attributes.position.array;
    const nor = geo.attributes.normal ? geo.attributes.normal.array : null;
    const uv = geo.attributes.uv ? geo.attributes.uv.array : null;
    for (let i = 0; i < pos.length; i += 3) {
      v.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(m);
      P.push(v.x, v.y, v.z);
    }
    if (nor) for (let i = 0; i < nor.length; i += 3) {
      v.set(nor[i], nor[i + 1], nor[i + 2]).applyMatrix3(nm).normalize();
      N.push(v.x, v.y, v.z);
    } else for (let i = 0; i < pos.length; i += 3) N.push(0, 1, 0);
    if (uv) for (let i = 0; i < uv.length; i++) U.push(uv[i]);
    else for (let i = 0; i < pos.length / 3; i++) U.push(0, 0);
    const idx = geo.index ? geo.index.array : null;
    if (idx) for (let i = 0; i < idx.length; i++) I.push(idx[i] + vo);
    else for (let i = 0; i < pos.length / 3; i += 3) I.push(vo + i, vo + i + 1, vo + i + 2);
    vo += pos.length / 3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  return g;
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 10);
const unitSphere = new THREE.SphereGeometry(1, 10, 8);
const unitPlane = new THREE.PlaneGeometry(1, 1);

export function buildWorld(scene, seed = 1337) {
  const rng = mulberry32(seed);
  const W = WORLD;
  const colliders = [];
  const neonMats = [];
  const lampLights = [];
  const boats = [];
  const birds = [];
  const clouds = [];
  const anim = { water: null, ferris: null, sunSprite: null, moonSprite: null };
  const block = W.block, half = W.half;

  // Per-material part buckets — merged into one mesh each at the end.
  const buckets = new Map(); // material -> parts[]
  function part(mat, geo, o) { if (!buckets.has(mat)) buckets.set(mat, []); buckets.get(mat).push({ geo, ...o }); }
  function box(mat, w, h, d, x, y, z, ry = 0) { part(mat, unitBox, { sx: w, sy: h, sz: d, x, y, z, ry }); }
  function cyl(mat, r, h, x, y, z, seg) { part(mat, unitCyl, { sx: r, sy: h, sz: r, x, y, z }); }

  // ---------- ground & roads ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshLambertMaterial({ color: 0x3d5a3a }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(120, -0.05, 0); ground.receiveShadow = true; scene.add(ground);
  const slab = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 + 40, half * 2 + 40), new THREE.MeshLambertMaterial({ color: 0x4a4d52 }));
  slab.rotation.x = -Math.PI / 2; slab.position.set(0, 0.0, 0); slab.receiveShadow = true; scene.add(slab);

  // Road centre dashes (merged) + crosswalks (merged). Lanes run between
  // the buildings at half-block offsets (23 + 46k), never through them.
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c95a });
  const crossMat = new THREE.MeshBasicMaterial({ color: 0xe8e8e8 });
  for (let i = -10; i <= 10; i++) {
    const c = i * block + block / 2;
    if (c > half || c < -half) continue;
    for (let z = -half; z < half; z += 9) {
      if (Math.abs(z) > 300 && c > 260) continue;
      box(dashMat, 0.5, 0.06, 3, c, 0.03, z, 0);
    }
    for (let x = -half; x < half; x += 9) {
      if (x > 300) continue;
      box(dashMat, 3, 0.06, 0.5, x, 0.03, c, 0);
    }
  }
  for (const [cx, cz] of [[23, 23], [115, 23], [23, 115], [-69, -69], [207, 115]]) {
    for (let k = -2; k <= 2; k++) box(crossMat, 1.1, 0.05, 9, cx + k * 2.2, 0.04, cz);
  }
  // Sidewalks (merged, one material).
  const walkMat = new THREE.MeshLambertMaterial({ color: 0x8d8f94 });
  for (let i = -10; i <= 10; i++) {
    const c = i * block + block / 2;
    if (c > 300 || c < -half) continue;
    part(walkMat, unitPlane, { sx: 3.4, sy: half * 2, sz: 1, x: c + 7.5, y: 0.02, z: 0, rx: -Math.PI / 2 });
  }

  // ---------- beach & bay water ----------
  const sandMat = new THREE.MeshLambertMaterial({ color: 0xd9c08a });
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(160, 920), sandMat);
  sand.rotation.x = -Math.PI / 2; sand.position.set(395, 0.02, 0); sand.receiveShadow = true; scene.add(sand);
  const wet = new THREE.Mesh(new THREE.PlaneGeometry(26, 920), new THREE.MeshLambertMaterial({ color: 0xb59a68 }));
  wet.rotation.x = -Math.PI / 2; wet.position.set(468, 0.03, 0); scene.add(wet);

  const waterCanvas = makeCanvas(256, 256), wx = waterCanvas.getContext('2d');
  wx.fillStyle = '#1d5f7a'; wx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    wx.strokeStyle = `rgba(255,255,255,${0.05 + rng() * 0.16})`;
    wx.lineWidth = 1 + rng() * 2;
    const y = rng() * 256;
    wx.beginPath(); wx.moveTo(rng() * 256, y);
    wx.bezierCurveTo(60, y + 6, 160, y - 6, 256, y + 3); wx.stroke();
  }
  const waterTex = new THREE.CanvasTexture(waterCanvas);
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping; waterTex.repeat.set(10, 12);
  waterTex.colorSpace = THREE.SRGBColorSpace;
  const waterMat = new THREE.MeshPhongMaterial({ map: waterTex, color: 0x3f8fb5, transparent: true, opacity: 0.92, shininess: 120, specular: 0x99ccff });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(340, 1100), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.set(640, 0.12, 0);
  scene.add(water);
  anim.water = waterMat;

  const islMat = new THREE.MeshLambertMaterial({ color: 0x55703f });
  const island = new THREE.Mesh(new THREE.CylinderGeometry(95, 110, 3, 24), islMat);
  island.position.set(W.islandX, 0.4, W.islandZ); island.receiveShadow = true; scene.add(island);
  const islSand = new THREE.Mesh(new THREE.CylinderGeometry(100, 100, 1.2, 24), sandMat);
  islSand.position.set(W.islandX, 0.9, W.islandZ); scene.add(islSand);

  // ---------- bridge ----------
  const bridgeMat = new THREE.MeshLambertMaterial({ color: 0x6b6f75 });
  const towerRed = new THREE.MeshLambertMaterial({ color: 0xd8543c });
  box(bridgeMat, 280, 1.6, 14, 430, 6, W.islandZ);
  for (const px of [340, 400, 460, 520]) {
    box(bridgeMat, 3, 14, 12, px, 0, W.islandZ);
    box(towerRed, 2.4, 26, 2.4, px, 14, W.islandZ - 5);
    box(towerRed, 2.4, 26, 2.4, px, 14, W.islandZ + 5);
  }
  const bridgeGlowMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
  for (let x = 310; x <= 550; x += 20) {
    part(bridgeGlowMat, unitSphere, { sx: 0.35, sy: 0.35, sz: 0.35, x, y: 7.2, z: W.islandZ - 6.5 });
    part(bridgeGlowMat, unitSphere, { sx: 0.35, sy: 0.35, sz: 0.35, x, y: 7.2, z: W.islandZ + 6.5 });
  }

  // ---------- buildings ----------
  const facadeBases = ['#7a6a58', '#5d6b7a', '#8a7f74', '#6e5a6b', '#59665a', '#74604a', '#4f5d6b'];
  const facadeMats = [];
  for (let i = 0; i < 6; i++) {
    const tex = facadeTexture(rng, facadeBases[i % facadeBases.length], 4 + Math.floor(rng() * 6), 0.45);
    facadeMats.push(new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.0 }));
  }
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x2e3134 });
  const glassMat = new THREE.MeshPhongMaterial({ color: 0x88bbdd, shininess: 90, specular: 0xffffff });

  const parkRect = { x0: -170, z0: 20, x1: -70, z1: 120 };
  const inPark = (x, z) => x > parkRect.x0 && x < parkRect.x1 && z > parkRect.z0 && z < parkRect.z1;
  for (let ix = -9; ix <= 6; ix++) {
    for (let iz = -9; iz <= 9; iz++) {
      const cx = ix * block, cz = iz * block;
      if (cx > 250 || inPark(cx, cz)) continue;
      if (rng() < 0.18) continue;
      const distC = Math.hypot(cx, cz);
      const tall = distC < 140 ? 26 + rng() * 55 : 10 + rng() * 22;
      const w = 24 + rng() * 10, d = 24 + rng() * 10;
      const ox = (rng() - 0.5) * 6, oz = (rng() - 0.5) * 6;
      const mat = facadeMats[Math.floor(rng() * facadeMats.length)];
      box(mat, w, tall, d, cx + ox, tall / 2, cz + oz);
      box(roofMat, w + 1, 1.2, d + 1, cx + ox, tall + 0.6, cz + oz);
      if (rng() < 0.6) box(roofMat, 3, 1.6, 2.4, cx + ox + w * 0.2, tall + 2, cz + oz);
      if (tall > 45) box(glassMat, w * 0.5, 3, d * 0.5, cx + ox, tall + 3, cz + oz);
      colliders.push({ x0: cx + ox - w / 2 - 1, z0: cz + oz - d / 2 - 1, x1: cx + ox + w / 2 + 1, z1: cz + oz + d / 2 + 1 });
      if (distC < 200 && rng() < 0.3) {
        const words = ['NEON', 'HOTEL', 'BAR 24H', 'CASINO', 'MOTEL', 'PIZZA'];
        const colors = ['#ff2e88', '#33e0ff', '#ffb347', '#7dff6b', '#ff5a3c'];
        const col = pick(rng, colors);
        const nm = new THREE.MeshBasicMaterial({ map: neonTexture(pick(rng, words), col), transparent: true, side: THREE.DoubleSide });
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(20, 7.5), nm);
        sign.position.set(cx + ox, tall * 0.72, cz + oz + d / 2 + 0.6);
        scene.add(sign);
        neonMats.push(nm);
      }
    }
  }
  box(facadeMats[1], 34, 86, 34, 46, 43, -46);
  box(roofMat, 36, 2, 36, 46, 87, -46);
  colliders.push({ x0: 28, z0: -64, x1: 64, z1: -28 });
  box(facadeMats[3], 30, 64, 30, -46, 32, 138);
  colliders.push({ x0: -62, z0: 122, x1: -30, z1: 154 });

  // ---------- park, ferris wheel, pond, palms ----------
  const parkMat = new THREE.MeshLambertMaterial({ color: 0x4a7a3f });
  const park = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), parkMat);
  park.rotation.x = -Math.PI / 2; park.position.set(-120, 0.06, 70); park.receiveShadow = true; scene.add(park);
  const pond = new THREE.Mesh(new THREE.CircleGeometry(14, 24), new THREE.MeshPhongMaterial({ color: 0x2f7fa8, shininess: 140, specular: 0xccffee }));
  pond.rotation.x = -Math.PI / 2; pond.position.set(-150, 0.08, 100); scene.add(pond);

  const wheel = new THREE.Group();
  wheel.position.set(-120, 26, 46);
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(22, 0.7, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffd166 })));
  const spokeMat = new THREE.MeshBasicMaterial({ color: 0xdddddd });
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.5, 43, 0.5), spokeMat);
    s.rotation.z = (i / 8) * Math.PI; wheel.add(s);
  }
  const cabinColors = [0xff2e88, 0x33e0ff, 0xffb347, 0x7dff6b, 0xb26bff, 0xff5a3c];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const cab = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ color: cabinColors[i % 6], emissive: cabinColors[i % 6], emissiveIntensity: 0.35 }));
    cab.scale.set(3.4, 3, 3); cab.position.set(Math.cos(a) * 22, Math.sin(a) * 22, 0);
    wheel.add(cab);
  }
  scene.add(wheel);
  anim.ferris = wheel;
  const legMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
  box(legMat, 2.5, 28, 2.5, -120, 13, 40, 0.35);
  box(legMat, 2.5, 28, 2.5, -120, 13, 52, -0.35);
  colliders.push({ x0: -132, z0: 34, x1: -108, z1: 58 });

  // Palms: trunks + fronds merged into two meshes (no per-palm sway).
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x2f7a33, side: THREE.DoubleSide });
  function palm(x, z, s = 1) {
    part(trunkMat, unitCyl, { sx: 0.35 * s, sy: 7 * s, sz: 0.35 * s, x, y: 3.5 * s, z, rz: 0.08 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      part(frondMat, unitPlane, {
        sx: 4.4 * s, sy: 1.1 * s, sz: 1,
        x: x + Math.cos(a) * 1.9 * s, y: 7.1 * s, z: z + Math.sin(a) * 1.9 * s,
        ry: -a + Math.PI / 2, rz: 0.5,
      });
    }
  }
  for (let i = 0; i < 14; i++) palm(-160 + rng() * 80, 30 + rng() * 80, 0.9 + rng() * 0.4);
  for (let x = 310; x < 470; x += 18) palm(x, 40 + rng() * 8 - 4, 1 + rng() * 0.3);
  for (let x = 310; x < 470; x += 18) palm(x, -160 + rng() * 10, 1 + rng() * 0.3);
  for (let i = 0; i < 8; i++) palm(W.islandX - 60 + rng() * 120, W.islandZ - 50 + rng() * 100, 0.9 + rng() * 0.5);

  // ---------- docks & pier ----------
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x8a6a44 });
  box(woodMat, 10, 1.2, 130, 348, 1.2, 160);
  colliders.push({ x0: 342, z0: 95, x1: 354, z1: 225 });
  for (let z = 100; z <= 220; z += 12) box(woodMat, 1.4, 2.4, 1.4, 344, 0, 160 + (z - 160));
  box(new THREE.MeshLambertMaterial({ color: 0x7a6a55 }), 26, 10, 18, 330, 5, 240);
  colliders.push({ x0: 316, z0: 230, x1: 344, z1: 250 });
  box(new THREE.MeshLambertMaterial({ color: 0x5a6a7a }), 22, 8, 16, 300, 4, 280);
  colliders.push({ x0: 288, z0: 271, x1: 312, z1: 289 });
  const crateMat = new THREE.MeshLambertMaterial({ color: 0xa88a4f });
  for (let i = 0; i < 12; i++) {
    const s = 2 + rng() * 1.5;
    box(crateMat, s, s, s, 320 + rng() * 22, s / 2, 200 + rng() * 40, rng() * 0.8);
  }

  // ---------- market stalls ----------
  const awnColors = [0xff5a3c, 0x33e0ff, 0xffb347, 0xff2e88, 0x7dff6b];
  for (let i = 0; i < 10; i++) {
    const sx = 130 + (i % 5) * 12, sz = 120 + Math.floor(i / 5) * 14;
    box(woodMat, 6, 2.4, 5, sx, 1.2, sz);
    const am = new THREE.MeshLambertMaterial({ color: awnColors[i % 5], side: THREE.DoubleSide });
    part(am, unitPlane, { sx: 7, sy: 6, sz: 1, x: sx, y: 3.1, z: sz, rx: -Math.PI / 2, rz: 0.12 });
    colliders.push({ x0: sx - 3.4, z0: sz - 2.9, x1: sx + 3.4, z1: sz + 2.9 });
  }

  // ---------- streetlights, signs, traffic lights ----------
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2a2d31 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe6a8 });
  for (let i = -9; i <= 6; i++) {
    for (let j = -9; j <= 9; j += 3) {
      const cx = i * block, cz = j * block;
      if (cx > 280 || inPark(cx, cz)) continue;
      cyl(poleMat, 0.18, 7, cx + 8.4, 3.5, cz + 8.4);
      box(poleMat, 2.6, 0.16, 0.16, cx + 7.2, 6.9, cz + 8.4);
      part(lampMat, unitSphere, { sx: 0.55, sy: 0.55, sz: 0.55, x: cx + 6, y: 6.8, z: cz + 8.4 });
      if (lampLights.length < 10 && ((i + j) % 2 === 0)) {
        const pl = new THREE.PointLight(0xffd9a0, 0, 34, 1.6);
        pl.position.set(cx + 6, 6.6, cz + 8.4);
        scene.add(pl); lampLights.push(pl);
      }
    }
  }
  const stopMat = new THREE.MeshBasicMaterial({ map: signTexture('STOP', '#c22430', '#ffffff'), transparent: true, side: THREE.DoubleSide });
  for (const [sx, sz, name] of [[0, 0, 'NEON AVE'], [92, 92, 'CORAL BLVD'], [-92, 0, 'SUNSET DR'], [184, -92, 'HARBOR ST'], [0, -184, 'PALM ROW']]) {
    cyl(poleMat, 0.12, 3, sx + 8.6, 1.5, sz + 8.6);
    const stop = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), stopMat);
    stop.position.set(sx + 8.6, 3.2, sz + 8.6); stop.rotation.y = Math.PI / 4; scene.add(stop);
    const blade = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.2),
      new THREE.MeshBasicMaterial({ map: signTexture(name, '#1d5c33', '#ffffff'), side: THREE.DoubleSide }));
    blade.position.set(sx + 8.6, 4.4, sz + 8.6); blade.rotation.y = Math.PI / 4; scene.add(blade);
  }
  cyl(poleMat, 0.2, 6.5, 8.6, 3.25, -8.6);
  box(new THREE.MeshLambertMaterial({ color: 0x111111 }), 1, 2.6, 1, 8.6, 6.4, -8.6);
  const tlRed = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  const tlGreen = new THREE.MeshBasicMaterial({ color: 0x22dd44 });
  part(tlRed, unitSphere, { sx: 0.32, sy: 0.32, sz: 0.32, x: 8.6, y: 7.1, z: -8.1 });
  part(tlGreen, unitSphere, { sx: 0.32, sy: 0.32, sz: 0.32, x: 8.6, y: 5.9, z: -8.1 });

  // ---------- boats, birds, clouds, sun/moon ----------
  const boatHullMat = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
  const boatHull2 = new THREE.MeshLambertMaterial({ color: 0x3a6a8a });
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(unitBox, i % 2 ? boatHull2 : boatHullMat);
    hull.scale.set(9, 1.6, 3.4); hull.position.y = 0.6; g.add(hull);
    const cab = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ color: 0x222831 }));
    cab.scale.set(3.4, 1.6, 2.6); cab.position.set(-0.6, 2, 0); g.add(cab);
    const wake = new THREE.Mesh(new THREE.PlaneGeometry(12, 5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
    wake.rotation.x = -Math.PI / 2; wake.position.set(-7, 0.25, 0); g.add(wake);
    g.position.set(500 + rng() * 180, 0.2, -300 + rng() * 600);
    scene.add(g);
    boats.push({ g, speed: 6 + rng() * 5, dir: rng() < 0.5 ? 1 : -1, lane: g.position.z, phase: rng() * 6 });
  }

  const birdMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, side: THREE.DoubleSide });
  for (let f = 0; f < 4; f++) {
    const parts = [];
    for (let i = 0; i < 6; i++) {
      parts.push({ geo: unitPlane, sx: 2.2, sy: 0.7, sz: 1, x: (rng() - 0.5) * 14, y: (rng() - 0.5) * 4, z: (rng() - 0.5) * 10, rz: 0.5 });
    }
    const flock = new THREE.Mesh(mergeParts(parts), birdMat);
    flock.position.set(-200 + rng() * 500, 55 + rng() * 30, -250 + rng() * 500);
    scene.add(flock);
    birds.push({ g: flock, r: 120 + rng() * 120, speed: 0.02 + rng() * 0.02, a: rng() * 6.28, y: flock.position.y });
  }

  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  const cloudParts = [];
  for (let i = 0; i < 12; i++) {
    const cx = -500 + rng() * 1100, cy = 110 + rng() * 50, cz = -450 + rng() * 900;
    for (let k = 0; k < 4; k++) {
      const s = 9 + rng() * 9;
      cloudParts.push({ geo: unitSphere, sx: s, sy: s * 0.45, sz: s, x: cx + k * 10 - 15 + rng() * 6, y: cy + rng() * 3, z: cz + rng() * 8 - 4 });
    }
  }
  const cloudMesh = new THREE.Mesh(mergeParts(cloudParts), cloudMat);
  scene.add(cloudMesh);
  clouds.push({ g: cloudMesh, speed: 1.4 });

  function glowSprite(color, size) {
    const c = makeCanvas(128, 128), x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, color); g.addColorStop(0.35, color + 'aa'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    const m = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false });
    const s = new THREE.Sprite(m); s.scale.set(size, size, 1);
    return s;
  }
  const sun = glowSprite('#ffcf7a', 160);
  scene.add(sun); anim.sunSprite = sun;
  const moon = glowSprite('#dfe8ff', 90);
  scene.add(moon); anim.moonSprite = moon;

  // ---------- flush merged buckets into single meshes ----------
  let mergedCount = 0;
  for (const [mat, parts] of buckets) {
    const mesh = new THREE.Mesh(mergeParts(parts), mat);
    mesh.castShadow = false; mesh.receiveShadow = true;
    scene.add(mesh);
    mergedCount++;
  }

  return {
    colliders, neonMats, lampLights, lampGlows: [], boats, birds, clouds,
    palms: [], anim, facadeMats, mergedCount,
    update(dt, t, timeOfDay, weather) {
      if (anim.water) { anim.water.map.offset.x += dt * 0.008; anim.water.map.offset.y += dt * 0.005; }
      if (anim.ferris) anim.ferris.rotation.z += dt * 0.12;
      for (const b of boats) {
        b.g.position.z = b.lane + Math.sin(t * 0.05 + b.phase) * 40;
        b.g.position.x += b.dir * b.speed * dt;
        if (b.g.position.x > 760) b.g.position.x = 500;
        if (b.g.position.x < 490) b.g.position.x = 750;
        b.g.rotation.y = b.dir > 0 ? 0 : Math.PI;
        b.g.position.y = 0.2 + Math.sin(t * 1.3 + b.phase) * 0.15;
      }
      for (const bd of birds) {
        bd.a += bd.speed * dt;
        bd.g.position.x = Math.cos(bd.a) * bd.r;
        bd.g.position.z = Math.sin(bd.a) * bd.r - 40;
        bd.g.position.y = bd.y + Math.sin(t * 0.7 + bd.a) * 4;
        bd.g.rotation.y = -bd.a;
      }
      for (const c of clouds) {
        c.g.position.x += c.speed * dt;
        if (c.g.position.x > 620) c.g.position.x = -620;
      }
      for (let i = 0; i < neonMats.length; i++) {
        const m = neonMats[i];
        const flick = (i % 5 === 0 && Math.sin(t * 13 + i) > 0.86) ? 0.25 : 1;
        m.opacity = flick;
      }
    },
    blocked(x, z, pad = 0.6) {
      for (const c of colliders) {
        if (x > c.x0 - pad && x < c.x1 + pad && z > c.z0 - pad && z < c.z1 + pad) return true;
      }
      return false;
    },
  };
}
