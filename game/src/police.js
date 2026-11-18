// NEON BAY — police.js
// Wanted system (0–5 stars) with NAMED units, statuses, roadblocks, spike
// strips, helicopter + searchlight, marine unit, foot cops and heat decay.

import { WANTED, POLICE_NAMES, HELI_NAME, BOAT_NAME } from './config.js';
import { createVehicle, stepVehicle } from './vehicles.js';
import { clamp, dist2d, angDiff, gridRoute } from './util.js';

export function createPolice(scene) {
  return {
    heat: 0,
    stars: 0,
    units: [],        // {v, name, status, state, lostT}
    heli: null,       // {g, name, status, a, h}
    boat: null,
    roadblocks: [],   // {x, z, meshes, spikes}
    footCops: [],     // {x, z, mesh, state}
    sirenT: 0,
    lastDecayLog: 0,
  };
}

export function starsForHeat(heat) {
  let s = 0;
  for (let i = 0; i < WANTED.starAt.length; i++) if (heat >= WANTED.starAt[i]) s = i;
  return s;
}

export function addHeat(P, amount, reason) {
  P.heat = clamp(P.heat + amount, 0, 520);
  const s = starsForHeat(P.heat);
  if (s !== P.stars) P.stars = s;
  return P.stars;
}

function spawnUnit(scene, P, name, px, pz) {
  // Spawn on a lane near the player, never inside a building: lanes run at
  // half-block offsets (23 + 46k); buildings sit on block centres.
  const gx = Math.round((px - 23) / 46) * 46 + 23 + 46;
  const gz = Math.round((pz - 23) / 46) * 46 + 23;
  const v = createVehicle(scene, 'police', gx, gz, 0);
  v.ai = { mode: 'pursuit', stuckT: 0 };
  const u = { v, name, status: 'PURSUIT', lostT: 0, ramT: 0 };
  P.units.push(u);
  return u;
}

function removeUnit(scene, P, u) {
  scene.remove(u.v.mesh.root);
  P.units = P.units.filter(x => x !== u);
}

export function stepPolice(P, scene, dt, player, world, rng, audio, onBusted) {
  const px = player.x, pz = player.z;
  const want = WANTED.maxUnits[P.stars];

  // Spawn / despawn units to match the wanted level.
  while (P.units.length < want) {
    const name = POLICE_NAMES[P.units.length % POLICE_NAMES.length];
    const a = rng() * Math.PI * 2;
    spawnUnit(scene, P, name, px + Math.cos(a) * 90, pz + Math.sin(a) * 90);
  }
  while (P.units.length > want) removeUnit(scene, P, P.units[P.units.length - 1]);

  // Helicopter at 4★+.
  if (P.stars >= WANTED.heliAt && !P.heli) {
    const g = new THREE.Group();
    const bodyM = new THREE.MeshPhongMaterial({ color: 0x1a2027, shininess: 60 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 8), bodyM);
    body.castShadow = true; g.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 6), bodyM);
    tail.position.set(0, 0.4, -6); g.add(tail);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(13, 0.15, 0.8), new THREE.MeshLambertMaterial({ color: 0x333333 }));
    rotor.position.y = 1.6; g.add(rotor);
    const spot = new THREE.SpotLight(0xfff2c0, 0, 90, 0.32, 0.5, 1.2);
    spot.position.set(0, -1, 2); g.add(spot);
    g.add(spot.target);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(7, 30, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.10, side: THREE.DoubleSide, depthWrite: false }));
    cone.rotation.x = Math.PI; cone.position.y = -16; g.add(cone);
    g.position.set(px + 40, 55, pz - 30);
    scene.add(g);
    P.heli = { g, rotor, spot, cone, name: HELI_NAME, status: 'SEARCHLIGHT', a: 0, h: 55 };
  }
  if (P.stars < WANTED.heliAt && P.heli) {
    scene.remove(P.heli.g); P.heli = null;
  }
  if (P.heli) {
    const h = P.heli;
    h.a += dt * 0.25;
    const tx = px + Math.cos(h.a) * 34, tz = pz + Math.sin(h.a) * 34;
    h.g.position.x += (tx - h.g.position.x) * Math.min(1, dt * 0.8);
    h.g.position.z += (tz - h.g.position.z) * Math.min(1, dt * 0.8);
    h.g.position.y = 55 + Math.sin(performance.now() * 0.001) * 2;
    h.g.lookAt(px, 0, pz);
    h.rotor.rotation.y += dt * 22;
    h.spot.target.position.set(px - h.g.position.x, -h.g.position.y, pz - h.g.position.z);
    h.spot.intensity = 900;
    // Searchlight keeps the player "seen": slows heat decay while lit.
    P.heliLit = true;
  } else P.heliLit = false;

  // Marine unit when wanted in a boat.
  if (player.inBoat && P.stars >= 2 && !P.boat) {
    const v = createVehicle(scene, 'police', px + 60, pz, 0, { color: 0x2244aa });
    v.ai = { mode: 'marine' };
    P.boat = { v, name: BOAT_NAME, status: 'PURSUIT' };
  }
  if ((!player.inBoat || P.stars < 2) && P.boat) {
    scene.remove(P.boat.v.mesh.root); P.boat = null;
  }

  // Roadblocks + spike strips at 3★+.
  const wantBlocks = P.stars >= WANTED.roadblockAt ? Math.min(2, P.stars - 2) : 0;
  while (P.roadblocks.length < wantBlocks) {
    const a = rng() * Math.PI * 2;
    const bx = Math.round((px + Math.cos(a) * 120 - 23) / 46) * 46 + 23;
    const bz = Math.round((pz + Math.sin(a) * 120 - 23) / 46) * 46 + 23;
    const meshes = [];
    for (let k = -1; k <= 1; k++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 4.4),
        new THREE.MeshLambertMaterial({ color: 0x101418 }));
      m.position.set(bx + k * 2.4, 0.55, bz); scene.add(m); meshes.push(m);
    }
    const spikes = new THREE.Mesh(new THREE.BoxGeometry(8, 0.25, 1.6),
      new THREE.MeshLambertMaterial({ color: 0x666666 }));
    spikes.position.set(bx, 0.15, bz + 8); scene.add(spikes); meshes.push(spikes);
    P.roadblocks.push({ x: bx, z: bz, meshes, spikes, hit: false });
  }
  while (P.roadblocks.length > wantBlocks) {
    const rb = P.roadblocks.pop();
    for (const m of rb.meshes) scene.remove(m);
  }
  // Spike strips shred tyres.
  for (const rb of P.roadblocks) {
    if (!rb.hit && player.vehicle && dist2d(px, pz, rb.x, rb.z + 8) < 5) {
      rb.hit = true;
      player.vehicle.hp -= 25;
      player.vehicle.speed *= 0.4;
      audio?.crash?.();
    }
  }

  // Unit AI.
  const seen = P.heliLit || P.units.some(u => dist2d(u.v.x, u.v.z, px, pz) < 70);
  for (const u of P.units) {
    const v = u.v;
    if (v.dead) { u.status = 'DISABLED'; continue; }
    const d = dist2d(v.x, v.z, px, pz);
    // Status machine.
    if (d < 7 && player.vehicle) { u.status = 'RAMMING'; u.ramT += dt; }
    else if (d < 18) u.status = 'BOXING IN';
    else if (d < 60) u.status = 'PURSUIT';
    else u.status = 'SEARCHLIGHT';
    // Chase: route via the grid when far, direct when close.
    if (!u.route || u.routeIdx >= u.route.length) {
      u.route = d > 80 ? gridRoute(v.x, v.z, px, pz) : [{ x: px, z: pz }];
      u.routeIdx = 0;
    }
    const t = u.route[u.routeIdx];
    if (t && dist2d(v.x, v.z, t.x, t.z) < 8) u.routeIdx++;
    const tgt = u.route[Math.min(u.routeIdx, u.route.length - 1)] || { x: px, z: pz };
    const wantH = Math.atan2(tgt.x - v.x, tgt.z - v.z);
    const diff = angDiff(v.heading, wantH);
    const steer = clamp(diff * 1.8, -1, 1);
    let throttle = 0.95;
    if (u.status === 'RAMMING') throttle = 1;
    if (Math.abs(diff) > 1.4) throttle = 0.3;
    const others = P.units.map(x => x.v);
    stepVehicle(v, dt, throttle, steer, world, others);
    // Unstick: wedged on a building corner, a unit otherwise grinds there
    // forever. After 2.5 s barely moving, drop the route so it re-routes
    // via the grid from its current spot.
    if (Math.abs(v.speed) < 2) u.v.ai.stuckT = (u.v.ai.stuckT || 0) + dt;
    else u.v.ai.stuckT = 0;
    if (u.v.ai.stuckT > 2.5) { u.route = null; u.v.ai.stuckT = 0; }
    // Light bar flash.
    if (v.mesh.lightBar) {
      v.mesh.lightBar.children[0].material.color.setHex(Math.floor(performance.now() / 180) % 2 ? 0xff2222 : 0x881111);
      v.mesh.lightBar.children[1].material.color.setHex(Math.floor(performance.now() / 180) % 2 ? 0x1122aa : 0x2244ff);
    }
    // Ramming contact damages the player vehicle — 8 hp/s per rammer. The
    // old rate (60 hp/s) melted an 80-hp sports car in ~1.3 s of contact,
    // so getting boxed in at 4★ was an instant kill with no counterplay.
    if (d < 4.2 && player.vehicle && Math.abs(v.speed) > 4) {
      player.vehicle.hp -= 0.8 * dt * 10;
      audio?.crash?.();
    }
    // Lost the player? After 12 s unseen at low speed, units give up.
    if (d > 90) u.lostT += dt; else u.lostT = 0;
  }
  // Despawn far lost units when stars drop.
  P.units = P.units.filter(u => {
    if (u.v.dead && P.stars === 0) { scene.remove(u.v.mesh.root); return false; }
    return true;
  });

  // Foot cops: spawn near the player on foot when wanted, walk in and arrest.
  if (!player.vehicle && P.stars >= 1) {
    if (P.footCops.length < Math.min(2, P.stars) && rng() < dt * 0.5) {
      const a = rng() * Math.PI * 2;
      const cx = px + Math.cos(a) * 40, cz = pz + Math.sin(a) * 40;
      const mesh = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.5, 0.5), new THREE.MeshLambertMaterial({ color: 0x1a2a4a }));
      body.position.y = 1.1; mesh.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), new THREE.MeshLambertMaterial({ color: 0xc98d64 }));
      head.position.y = 2.1; mesh.add(head);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.16, 10), new THREE.MeshLambertMaterial({ color: 0x101418 }));
      cap.position.y = 2.35; mesh.add(cap);
      mesh.position.set(cx, 0, cz);
      scene.add(mesh);
      P.footCops.push({ x: cx, z: cz, mesh, state: 'approach' });
    }
  }
  for (const c of P.footCops) {
    const d = dist2d(c.x, c.z, px, pz);
    if (d > 2.2) {
      const sp = 4.2 * dt;
      c.x += ((px - c.x) / d) * sp; c.z += ((pz - c.z) / d) * sp;
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = Math.atan2(px - c.x, pz - c.z);
    } else if (!player.vehicle) {
      onBusted?.('Arrested by a foot cop — Sgt. Reyes sends his regards.');
    }
  }
  if (P.stars === 0) {
    for (const c of P.footCops) scene.remove(c.mesh);
    P.footCops = [];
  }

  // Heat decay: clean driving (no crime, moving, not seen) cools things down.
  const clean = !seen && player.vehicle && Math.abs(player.vehicle.speed) > 5;
  if (P.stars > 0 && (clean || P.stars === 0)) {
    P.heat -= WANTED.decayPerSec * dt * (P.heliLit ? 0.25 : 1);
    if (P.heat < 0) P.heat = 0;
    const s = starsForHeat(P.heat);
    if (s !== P.stars) P.stars = s;
  }
  // Siren pulse.
  P.sirenT += dt;
  if (P.stars > 0 && P.sirenT > 1.4) { P.sirenT = 0; audio?.sirenTick?.(); }
}
