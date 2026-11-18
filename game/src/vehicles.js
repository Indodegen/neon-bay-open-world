// NEON BAY — vehicles.js
// Vehicle meshes, arcade handling with body roll + pitch, damage/smoke,
// car-vs-car shove, and simple grid traffic AI.
//
// PERFORMANCE: each car is ONE merged mesh with vertex colours (body, cabin,
// wheels, lights all baked in) plus, for police cars only, a separate
// flashing light bar. That keeps ~16 cars at ~16 draw calls.

import { VEHICLES } from './config.js';
import { mulberry32, clamp, angDiff, dist2d, gridRoute, landMaxX } from './util.js';

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 12);

// Merge coloured parts into one vertex-coloured geometry.
// part = { geo, w,h,d or r, x,y,z, ry, color }
function mergeColored(parts) {
  const P = [], N = [], C = [], U = [], I = [];
  let vo = 0;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const v = new THREE.Vector3(), nm = new THREE.Matrix3(), col = new THREE.Color();
  for (const p of parts) {
    const geo = p.geo;
    e.set(0, p.ry || 0, 0); q.setFromEuler(e);
    const sx = p.w ?? p.r ?? 1, sy = p.h ?? p.r ?? 1, sz = p.d ?? p.r ?? 1;
    m.compose(new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0), q, new THREE.Vector3(sx, sy, sz));
    nm.getNormalMatrix(m);
    col.setHex(p.color);
    const pos = geo.attributes.position.array;
    const nor = geo.attributes.normal.array;
    const uv = geo.attributes.uv ? geo.attributes.uv.array : null;
    for (let i = 0; i < pos.length; i += 3) {
      v.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(m);
      P.push(v.x, v.y, v.z);
      C.push(col.r, col.g, col.b);
    }
    for (let i = 0; i < nor.length; i += 3) {
      v.set(nor[i], nor[i + 1], nor[i + 2]).applyMatrix3(nm).normalize();
      N.push(v.x, v.y, v.z);
    }
    if (uv) for (let i = 0; i < uv.length; i++) U.push(uv[i]);
    else for (let i = 0; i < pos.length / 3; i++) U.push(0, 0);
    const idx = geo.index.array;
    for (let i = 0; i < idx.length; i++) I.push(idx[i] + vo);
    vo += pos.length / 3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  return g;
}

export function buildVehicleMesh(type, opts = {}) {
  const def = VEHICLES[type];
  const color = opts.color ?? def.color;
  const dark = 0x10161f, tyre = 0x141414, hub = 0x9aa2ad;
  const parts = [];
  const W = type === 'truck' ? 2.6 : 2.1;
  const L = type === 'truck' ? 6.4 : 4.4;
  const H = type === 'truck' ? 2.4 : 1.35;
  if (type === 'boat') {
    parts.push({ geo: unitBox, w: 2.4, h: 1.0, d: 6.2, x: 0, y: 0.5, z: 0, color });
    parts.push({ geo: unitBox, w: 1.8, h: 1.0, d: 2.2, x: 0, y: 1.4, z: -0.4, color: dark });
    parts.push({ geo: unitBox, w: 0.5, h: 0.8, d: 0.5, x: 0, y: 1.6, z: 2.4, color: 0x888888 });
  } else if (type === 'bike') {
    parts.push({ geo: unitBox, w: 0.7, h: 0.5, d: 3.2, x: 0, y: 0.75, z: 0, color });
    parts.push({ geo: unitBox, w: 0.7, h: 0.6, d: 1.6, x: 0, y: 1.1, z: 0.2, color });
    parts.push({ geo: unitBox, w: 0.6, h: 0.5, d: 0.4, x: 0, y: 1.35, z: -0.9, color: dark });
    for (const wz of [1.5, -1.5]) {
      parts.push({ geo: unitCyl, r: 0.42, h: 0.2, x: 0, y: 0.42, z: wz, color: tyre });
    }
  } else {
    // Beveled look: wide low body + narrower cabin box on top.
    parts.push({ geo: unitBox, w: W, h: H * 0.55, d: L, x: 0, y: H * 0.28, z: 0, color });
    parts.push({ geo: unitBox, w: W * 0.82, h: H * 0.45, d: L * 0.86, x: 0, y: H * 0.72, z: 0, color });
    if (type === 'truck') {
      parts.push({ geo: unitBox, w: 2.5, h: 1.5, d: 2.0, x: 0, y: 2.0, z: 1.9, color: dark });
      parts.push({ geo: unitBox, w: 2.5, h: 1.1, d: 3.6, x: 0, y: 1.5, z: -1.2, color: 0x3a3f45 });
    } else {
      parts.push({ geo: unitBox, w: 1.7, h: 0.62, d: 2.3, x: 0, y: 1.15, z: type === 'sports' ? -0.25 : -0.1, color: dark });
    }
    // Wheels (boxes read fine at this scale and merge cleanly).
    for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
      parts.push({ geo: unitBox, w: 0.34, h: 0.84, d: 0.84, x: wx, y: 0.42, z: wz, color: tyre });
      parts.push({ geo: unitBox, w: 0.36, h: 0.4, d: 0.4, x: wx, y: 0.42, z: wz, color: hub });
    }
    // Headlights + taillights baked in bright vertex colours.
    for (const sx of [-0.7, 0.7]) {
      parts.push({ geo: unitBox, w: 0.4, h: 0.22, d: 0.1, x: sx, y: 0.62, z: L / 2 + 0.02, color: 0xfff2c0 });
      parts.push({ geo: unitBox, w: 0.4, h: 0.22, d: 0.1, x: sx, y: 0.62, z: -L / 2 - 0.02, color: 0xff2a22 });
    }
  }

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const root = new THREE.Group();
  const body = new THREE.Mesh(mergeColored(parts), mat);
  body.castShadow = true;
  root.add(body);

  // Police livery: flashing light bar (the only extra mesh on a police car).
  let lightBar = null;
  if (type === 'police') {
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.x = -0.4; bar.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    blue.position.x = 0.4; bar.add(blue);
    bar.position.set(0, 1.62, 0.1); root.add(bar);
    lightBar = bar;
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    door.position.set(-1.06, 0.75, 0); door.rotation.y = -Math.PI / 2; root.add(door);
  }

  // Headlight glow planes for the player's car / police (visible at night).
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.0 });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.2), glowMat);
  glow.position.set(0, 0.5, L / 2 + 1.4); glow.rotation.x = 0;
  root.add(glow);

  return { root, wheels: [], lightBar, mats: { body: mat, head: glowMat }, smoke: [], glow };
}

export function repaintVehicle(scene, v, color) {
  // Vertex-coloured bodies can't be retinted via the material, so rebuild
  // the mesh with the new colour, keeping position, heading, speed and hp.
  scene.remove(v.mesh.root);
  const mesh = buildVehicleMesh(v.type, { color });
  mesh.root.position.set(v.x, 0, v.z);
  mesh.root.rotation.y = v.heading;
  scene.add(mesh.root);
  v.mesh = mesh;
  v.color = color;
  return v;
}

export function createVehicle(scene, type, x, z, heading = 0, opts = {}) {
  const def = VEHICLES[type];
  const mesh = buildVehicleMesh(type, opts);
  mesh.root.position.set(x, 0, z);
  mesh.root.rotation.y = heading;
  scene.add(mesh.root);
  const v = {
    type, def, mesh, x, z, heading,
    speed: 0, steer: 0, hp: def.hp, maxHp: def.hp,
    roll: 0, pitch: 0, dead: false, isPlayer: false,
    upgrades: { engine: 0, armor: 0, brakes: 0 },
    smokeTimer: 0, color: opts.color ?? def.color,
    ai: null,
    route: null, routeIdx: 0,
  };
  return v;
}

// Arcade step: throttle -1..1, steer -1..1. Returns nothing; mutates v.
export function stepVehicle(v, dt, throttle, steer, world, others = []) {
  const def = v.def;
  const engMul = 1 + v.upgrades.engine * 0.12;
  const gripMul = 1 + v.upgrades.brakes * 0.1;
  const top = def.top * engMul;
  const accel = def.accel * engMul;
  const brake = def.brake * (1 + v.upgrades.brakes * 0.15);
  const hpMul = v.hp < v.maxHp * 0.35 ? 0.55 : 1;

  if (throttle > 0) v.speed += accel * throttle * dt * hpMul;
  else if (throttle < 0) {
    if (v.speed > 0.5) v.speed -= brake * dt;
    else v.speed += accel * 0.45 * throttle * dt;
  } else {
    v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 6 * dt);
  }
  v.speed = clamp(v.speed, -10, top);

  const steerTarget = clamp(steer, -1, 1);
  v.steer += (steerTarget - v.steer) * Math.min(1, dt * 6);
  const turnRate = def.turn * gripMul * v.steer * clamp(Math.abs(v.speed) / 12, 0, 1) * (v.speed >= 0 ? 1 : -1);
  v.heading += turnRate * dt * (Math.abs(v.speed) > 0.2 ? 1 : 0);
  const nx = v.x + Math.sin(v.heading) * v.speed * dt;
  const nz = v.z + Math.cos(v.heading) * v.speed * dt;

  // Building collision: slide along the wall instead of stopping dead.
  let blockedX = false, blockedZ = false;
  if (world && world.blocked(nx, v.z, 1.6)) blockedX = true;
  if (world && world.blocked(v.x, nz, 1.6)) blockedZ = true;
  if (!blockedX) v.x = nx;
  if (!blockedZ) v.z = nz;
  if ((blockedX || blockedZ) && Math.abs(v.speed) > 6) {
    // AI-driven cars (traffic, police, rival) grind themselves to death
    // against building corners within seconds if wall hits cost hp, so
    // they only lose speed on impact. Player-driven cars keep full damage.
    if (!v.ai) v.hp -= Math.abs(v.speed) * 0.55;
    v.speed *= 0.25;
    v.crashed = true;
  }
  if (v.type !== 'boat') {
    // Eastern edge is the bay shoreline (x=470) except on the bridge
    // deck and the island — see landMaxX in util.js.
    v.x = clamp(v.x, -455, landMaxX(v.x, v.z));
    v.z = clamp(v.z, -455, 455);
  }

  // Car-vs-car shove. AI cars never lose hp to shoves (same grind-to-death
  // problem as walls); the player-driven car still takes its share — but
  // only once per 0.5 s per car: without a cooldown, sustained contact
  // (a police car boxing the player in) applies the hit every step and
  // melts a car in ~1 s of game time.
  v.shoveCd = Math.max(0, (v.shoveCd || 0) - dt);
  for (const o of others) {
    if (o === v || o.dead) continue;
    const d = dist2d(v.x, v.z, o.x, o.z);
    if (d < 3.4 && d > 0.01) {
      const push = (3.4 - d) * 0.5;
      const ux = (v.x - o.x) / d, uz = (v.z - o.z) / d;
      v.x += ux * push; v.z += uz * push;
      const rel = Math.abs(v.speed - o.speed);
      if (rel > 5) {
        if (!v.ai && v.shoveCd <= 0) { v.hp -= rel * 0.4; v.shoveCd = 0.5; }
        if (!o.ai && (o.shoveCd || 0) <= 0) { o.hp -= rel * 0.3; o.shoveCd = 0.5; }
        v.crashed = true;
      }
    }
  }

  // Visual: roll into corners, pitch under accel/brake.
  const targetRoll = -v.steer * clamp(Math.abs(v.speed) / 30, 0, 1) * 0.09;
  v.roll += (targetRoll - v.roll) * Math.min(1, dt * 5);
  const targetPitch = clamp(-throttle * 0.05 * clamp(Math.abs(v.speed) / 20, 0, 1), -0.06, 0.06);
  v.pitch += (targetPitch - v.pitch) * Math.min(1, dt * 4);
  v.mesh.root.position.set(v.x, 0, v.z);
  v.mesh.root.rotation.set(v.pitch, v.heading, v.roll);
  if (v.hp <= 0 && !v.dead) { v.dead = true; v.speed = 0; }
  return v;
}

// --- Traffic AI: civilian cars cruise the grid on Manhattan routes. --------
export function spawnTraffic(scene, rng, n, world) {
  const list = [];
  const types = ['sedan', 'sedan', 'sports', 'truck', 'sedan', 'bike'];
  for (let i = 0; i < n; i++) {
    const type = types[Math.floor(rng() * types.length)];
    // Spawn on lane centrelines (23 + 46k), never inside a building: the
    // buildings sit on the block centres (multiples of 46).
    const gx = (Math.floor(rng() * 19) - 9) * 46 + 23;
    const gz = (Math.floor(rng() * 19) - 9) * 46 + 23;
    if (gx > 280) continue;
    const v = createVehicle(scene, type, gx, gz, (Math.floor(rng() * 4) * Math.PI) / 2, { color: [0x8a94a6, 0xc22430, 0x4d6b54, 0xd8a03c, 0x5a7a9a, 0x9a5a7a][Math.floor(rng() * 6)] });
    v.ai = { mode: 'cruise', wait: rng() * 3, target: null };
    v.speed = 8 + rng() * 6;
    list.push(v);
  }
  return list;
}

export function stepTraffic(v, dt, world, rng) {
  if (v.dead) return;
  if (!v.ai.target) {
    // Fresh target on a lane centreline (23 + 46k), never a building centre.
    const gx = (Math.floor(rng() * 17) - 8) * 46 + 23;
    const gz = (Math.floor(rng() * 17) - 8) * 46 + 23;
    v.route = gridRoute(v.x, v.z, gx, gz);
    v.routeIdx = 0;
    v.ai.target = v.route[0];
  }
  const t = v.route[v.routeIdx];
  if (!t) { v.ai.target = null; return; }
  const d = dist2d(v.x, v.z, t.x, t.z);
  if (d < 6) {
    v.routeIdx++;
    if (v.routeIdx >= v.route.length) { v.ai.target = null; v.speed *= 0.5; return; }
    v.ai.target = v.route[v.routeIdx];
  }
  const want = Math.atan2(t.x - v.x, t.z - v.z);
  const diff = angDiff(v.heading, want);
  const steer = clamp(diff * 1.6, -1, 1);
  const throttle = Math.abs(diff) > 1.2 ? 0.2 : 0.7;
  stepVehicle(v, dt, throttle, steer, world, []);
  // Unstick: wedged against a building corner, a cruiser otherwise sits
  // there forever. After 3 s barely moving, drop the route for a fresh one.
  if (Math.abs(v.speed) < 2) v.ai.stuckT = (v.ai.stuckT || 0) + dt;
  else v.ai.stuckT = 0;
  if (v.ai.stuckT > 3) { v.ai.target = null; v.ai.stuckT = 0; }
}
