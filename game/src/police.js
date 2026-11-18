// The wanted system: heat from crimes, CBPD cruisers that chase, foot
// officers, roadblocks at 3 stars and a helicopter with a searchlight at 4.
import { clamp, damp, angleDelta, distance2D, makeRng, resolveCircleBox } from './utils.js';
import { AVENUES, STREETS, nearestRoadPoint } from './world.js';
import { spawnVehicle, damageVehicle } from './vehicles.js';
import { createPedestrian, updatePedestrian } from './traffic.js';
import { playSirenBlip } from './audio.js';

export const MAX_WANTED = 5;
export const WANTED_DECAY_SECONDS = 9;

const UNIT_CALLSIGNS = ['Falcon', 'Viper', 'Hawk', 'Mustang', 'Cobra', 'Raven', 'Bull', 'Ghost'];

export function createWanted() {
  return {
    level: 0, heat: 0, decayTimer: 0, bustedTimer: 0,
    cops: [], roadblocks: [], heli: null, boat: null, lastBlip: 0,
    unitCounter: 0,
  };
}

/** Named units with distance and status for the HUD police list. */
export function getPoliceUnits(wanted, px, pz) {
  const units = [];
  if (wanted.heli) {
    units.push({ name: 'Air-1 "Falcon"', dist: Math.round(distance2D(wanted.heli.x, wanted.heli.z, px, pz)), status: 'SEARCHLIGHT', statusClass: 'search' });
  }
  const cops = [];
  for (const cop of wanted.cops) {
    if (cop.dead) continue;
    const d = Math.round(distance2D(cop.x, cop.z, px, pz));
    let status = 'PURSUIT';
    let statusClass = 'pursuit';
    if (cop.status === 'ramming') { status = 'RAMMING'; statusClass = 'ramming'; }
    else if (cop.status === 'boxing') { status = 'BOXING IN'; statusClass = 'ramming'; }
    cops.push({ name: cop.unitName, dist: d, status, statusClass });
  }
  cops.sort((a, b) => a.dist - b.dist);
  units.push(...cops);
  for (const rb of wanted.roadblocks) {
    units.push({ name: 'Roadblock ' + rb.id, dist: Math.round(distance2D(rb.x, rb.z, px, pz)), status: rb.type === 'spikes' ? 'SPIKE STRIP' : 'ROADBLOCK', statusClass: 'roadblock' });
  }
  if (wanted.boat && !wanted.boat.dead) {
    units.push({ name: 'Marine-2 "Harbour"', dist: Math.round(distance2D(wanted.boat.x, wanted.boat.z, px, pz)), status: 'PURSUIT', statusClass: 'pursuit' });
  }
  return units;
}

/** Add heat; every 20 heat is one star. Returns the new level. */
export function addHeat(wanted, amount) {
  wanted.heat = clamp(wanted.heat + amount, 0, MAX_WANTED * 20);
  const level = Math.min(MAX_WANTED, Math.floor(wanted.heat / 20));
  if (level > wanted.level) {
    wanted.level = level;
    wanted.lastBlip = 0;
  }
  wanted.decayTimer = WANTED_DECAY_SECONDS;
  return wanted.level;
}

export function clearWanted(wanted) {
  wanted.level = 0;
  wanted.heat = 0;
  wanted.decayTimer = 0;
  wanted.bustedTimer = 0;
}

function spawnCopCar(scene, world, rng, px, pz, wanted) {
  // Spawn on a road a short drive from the player, never on top of them.
  let x = px;
  let z = pz;
  for (let tries = 0; tries < 12; tries += 1) {
    const road = nearestRoadPoint(
      px + rng.range(-110, 110), pz + rng.range(-110, 110),
    );
    if (distance2D(road.x, road.z, px, pz) > 35) { x = road.x; z = road.z; break; }
  }
  return spawnStagedCop(scene, wanted, x, z, rng.range(0, Math.PI * 2));
}

/** A cop cruiser placed at an exact spot — used to stage a chase shot. */
export function spawnStagedCop(scene, wanted, x, z, heading) {
  const car = spawnVehicle(scene, 'police', x, z, heading, { traffic: false });
  car.ai = { mode: 'chase', target: null, speed: 0 };
  const n = wanted.unitCounter;
  wanted.unitCounter += 1;
  car.unitName = 'Unit ' + (n + 3) + ' "' + UNIT_CALLSIGNS[n % UNIT_CALLSIGNS.length] + '"';
  car.status = 'pursuit';
  wanted.cops.push(car);
  return car;
}

function spawnFootCop(scene, world, rng, px, pz) {
  const ped = createPedestrian(scene, px + rng.range(-18, 18), pz + rng.range(-18, 18), rng);
  ped.group.traverse((o) => {
    if (o.isMesh && o.material && o.material.color) o.material.color.setHex(0x1a2a4a);
  });
  ped.speed = 4.6;
  ped.isCop = true;
  return ped;
}

function makeRoadblock(scene, x, z, heading, type, id) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xff7a1a });
  const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
  if (type === 'spikes') {
    // A dark strip studded with steel spikes across the lane.
    const strip = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.18, 1.1),
      new THREE.MeshLambertMaterial({ color: 0x222222 }));
    strip.position.y = 0.12;
    group.add(strip);
    for (let i = 0; i < 9; i += 1) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.55, 6),
        new THREE.MeshLambertMaterial({ color: 0xcccccc }));
      spike.position.set(-3.4 + i * 0.85, 0.4, 0);
      group.add(spike);
    }
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 0.12),
      new THREE.MeshLambertMaterial({ color: 0xffd23e }));
    sign.position.set(0, 1.1, 0);
    group.add(sign);
  } else {
    for (let i = -1; i <= 1; i += 1) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 0.5), i % 2 === 0 ? mat : white);
      bar.position.set(i * 2.6, 0.55, 0);
      bar.castShadow = true;
      group.add(bar);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.5), mat);
      leg.position.set(i * 2.6, 0.25, 0);
      group.add(leg);
    }
  }
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  scene.add(group);
  return { group, x, z, heading, radius: 3.4, type, id, used: false };
}

function makeHelicopter(scene) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1a2a4a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 4.6), bodyMat);
  body.castShadow = true;
  group.add(body);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.9, 1.2),
    new THREE.MeshPhongMaterial({ color: 0x9fd8ff, shininess: 140 }));
  glass.position.set(0, 0.2, 1.8);
  group.add(glass);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4.2), bodyMat);
  tail.position.set(0, 0.3, -4.2);
  group.add(tail);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.5),
    new THREE.MeshLambertMaterial({ color: 0x222222 }));
  rotor.position.y = 1.15;
  group.add(rotor);
  const skidMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  for (const s of [-1, 1]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 3.4), skidMat);
    skid.position.set(s * 0.9, -1.0, 0);
    group.add(skid);
  }
  const spot = new THREE.SpotLight(0xfff2b0, 0, 90, 0.32, 0.5, 1.2);
  spot.position.set(0, -0.8, 1.2);
  group.add(spot);
  const spotTarget = new THREE.Object3D();
  spotTarget.position.set(0, -40, 0);
  group.add(spotTarget);
  spot.target = spotTarget;
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(4.5, 42, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xfff2b0, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  beam.rotation.x = Math.PI;
  beam.position.y = -21;
  group.add(beam);
  scene.add(group);
  return { group, rotor, spot, beam, angle: 0, x: 0, z: 0, y: 46 };
}

export function updateWanted(wanted, scene, world, rng, player, playerCar, dt, elapsed, callbacks) {
  // Heat cools when the player stays clean.
  if (wanted.heat > 0) {
    wanted.decayTimer -= dt;
    if (wanted.decayTimer <= 0) {
      wanted.heat = Math.max(0, wanted.heat - dt * 4);
      wanted.level = Math.min(MAX_WANTED, Math.floor(wanted.heat / 20));
    }
  }
  const px = player.x;
  const pz = player.z;
  const level = wanted.level;

  // Wrecks linger a while, then get towed away; only live cruisers count.
  for (let i = wanted.cops.length - 1; i >= 0; i -= 1) {
    const cop = wanted.cops[i];
    if (cop.dead) {
      cop.deadTimer = (cop.deadTimer || 0) + dt;
      if (cop.deadTimer > 10) {
        scene.remove(cop.mesh);
        wanted.cops.splice(i, 1);
      }
    }
  }
  const liveCops = () => wanted.cops.filter((c) => !c.dead).length;

  // Cruisers: one per star, up to five. (spawnCopCar registers the car
  // itself, so there is no second push here.)
  const wantCops = level;
  while (liveCops() < wantCops) {
    spawnCopCar(scene, world, rng, px, pz, wanted);
  }
  while (liveCops() > wantCops) {
    const idx = wanted.cops.findIndex((c) => !c.dead);
    if (idx === -1) break;
    scene.remove(wanted.cops[idx].mesh);
    wanted.cops.splice(idx, 1);
  }
  for (const cop of wanted.cops) {
    if (cop.dead) continue;
    const targetX = playerCar ? playerCar.x : px;
    const targetZ = playerCar ? playerCar.z : pz;
    const dist = distance2D(cop.x, cop.z, targetX, targetZ);
    const desired = Math.atan2(targetX - cop.x, targetZ - cop.z);
    cop.heading += angleDelta(cop.heading, desired) * Math.min(1, dt * 2.2);
    const chaseSpeed = Math.min(cop.def.topSpeed, 14 + level * 3.4);
    cop.speed = damp(cop.speed, dist > 90 ? chaseSpeed : chaseSpeed * 0.9, 1.6, dt);
    const step = cop.speed * dt;
    let nx = cop.x + Math.sin(cop.heading) * step;
    let nz = cop.z + Math.cos(cop.heading) * step;
    for (const box of world.colliders) {
      if (box.island) continue;
      const push = resolveCircleBox(nx, nz, cop.radius * 0.7, box);
      if (push) { nx += push.x; nz += push.z; cop.speed *= 0.6; }
    }
    cop.x = clamp(nx, -272, 282);
    cop.z = clamp(nz, -272, 212);
    cop.mesh.position.set(cop.x, 0, cop.z);
    cop.mesh.rotation.y = cop.heading;
    if (cop.mesh.userData.wheels) {
      for (const w of cop.mesh.userData.wheels) w.rotation.x += (cop.speed * dt) / 0.38;
    }
    if (cop.mesh.userData.lightBar) {
      const on = Math.floor(elapsed * 6) % 2 === 0;
      cop.mesh.userData.lightBar.red.material.color.setHex(on ? 0xff2222 : 0x551111);
      cop.mesh.userData.lightBar.blue.material.color.setHex(on ? 0x2266ff : 0x111155);
    }
    // Ram the player's car on contact (only while closing in at speed).
    if (playerCar && !playerCar.dead && cop.speed > 5
      && distance2D(cop.x, cop.z, playerCar.x, playerCar.z) < 3.6) {
      damageVehicle(playerCar, 4 * dt);
      playerCar.speed *= 0.985;
      cop.speed *= 0.9;
      cop.status = 'ramming';
    } else if (cop.status === 'ramming') {
      cop.status = 'pursuit';
    }
  }
  // Two or more cruisers tight on the player are boxing them in.
  {
    let close = 0;
    for (const cop of wanted.cops) {
      if (!cop.dead && distance2D(cop.x, cop.z, px, pz) < 14) close += 1;
    }
    if (close >= 2) {
      for (const cop of wanted.cops) {
        if (!cop.dead && cop.status === 'pursuit' && distance2D(cop.x, cop.z, px, pz) < 14) {
          cop.status = 'boxing';
        }
      }
    }
  }

  // Roadblocks at 3 stars: two barriers ahead on the player's road.
  if (level >= 3 && wanted.roadblocks.length === 0) {
    for (const ahead of [70, -70]) {
      const road = nearestRoadPoint(px + Math.sin(player.heading) * ahead, pz + Math.cos(player.heading) * ahead);
      const onAvenue = Math.abs(road.x - (px + Math.sin(player.heading) * ahead)) < 4;
      const type = rng.chance(0.5) ? 'spikes' : 'barrier';
      wanted.roadblocks.push(makeRoadblock(scene, road.x, road.z, onAvenue ? Math.PI / 2 : 0, type, wanted.roadblocks.length + 1));
    }
    if (callbacks.onRoadblock) callbacks.onRoadblock();
  }
  if (level < 3) {
    for (const rb of wanted.roadblocks) scene.remove(rb.group);
    wanted.roadblocks = [];
  }
  // Spike strips shred tyres: crossing one fast costs speed and health.
  if (playerCar && !playerCar.dead) {
    for (const rb of wanted.roadblocks) {
      if (rb.type !== 'spikes' || rb.used) continue;
      if (distance2D(rb.x, rb.z, playerCar.x, playerCar.z) < 4.5 && Math.abs(playerCar.speed) > 8) {
        rb.used = true;
        playerCar.speed *= 0.5;
        damageVehicle(playerCar, 15);
        if (callbacks.onSpike) callbacks.onSpike(rb);
      }
    }
  }

  // Police boat: when the player takes to the water with heat, Marine-2 comes.
  const onWater = playerCar && playerCar.type === 'boat';
  if (level >= 2 && onWater && !wanted.boat) {
    const boat = spawnVehicle(scene, 'boat', clamp(px + 40, 320, 500), clamp(pz - 30, -240, 190), 0, { color: 0x1a2a4a });
    boat.isPolice = true;
    wanted.boat = boat;
  }
  if ((!onWater || level < 2) && wanted.boat) {
    scene.remove(wanted.boat.mesh);
    wanted.boat = null;
  }
  if (wanted.boat) {
    const boat = wanted.boat;
    const tx = playerCar.x;
    const tz = playerCar.z;
    const desired = Math.atan2(tx - boat.x, tz - boat.z);
    boat.heading += angleDelta(boat.heading, desired) * Math.min(1, dt * 2.0);
    boat.speed = damp(boat.speed, 26, 1.4, dt);
    boat.x += Math.sin(boat.heading) * boat.speed * dt;
    boat.z += Math.cos(boat.heading) * boat.speed * dt;
    boat.x = clamp(boat.x, 305, 515);
    boat.z = clamp(boat.z, -265, 205);
    boat.mesh.position.set(boat.x, 0.3 + Math.sin(elapsed * 1.3) * 0.12, boat.z);
    boat.mesh.rotation.set(0, boat.heading, Math.sin(elapsed * 0.9) * 0.03);
    if (distance2D(boat.x, boat.z, tx, tz) < 4.5) {
      damageVehicle(playerCar, 6 * dt);
      playerCar.speed *= 0.99;
    }
  }

  // Helicopter at 4 stars.
  if (level >= 4 && !wanted.heli) {
    wanted.heli = makeHelicopter(scene);
    wanted.heli.x = px;
    wanted.heli.z = pz - 30;
  }
  if (level < 4 && wanted.heli) {
    scene.remove(wanted.heli.group);
    wanted.heli = null;
  }
  if (wanted.heli) {
    const heli = wanted.heli;
    heli.angle += dt * 0.55;
    const tx = playerCar ? playerCar.x : px;
    const tz = playerCar ? playerCar.z : pz;
    heli.x = damp(heli.x, tx + Math.sin(heli.angle) * 26, 1.2, dt);
    heli.z = damp(heli.z, tz + Math.cos(heli.angle) * 26, 1.2, dt);
    heli.group.position.set(heli.x, 46 + Math.sin(elapsed * 0.9) * 1.5, heli.z);
    heli.group.rotation.y = Math.atan2(tx - heli.x, tz - heli.z);
    heli.rotor.rotation.y = elapsed * 28;
    heli.spot.intensity = 260;
    heli.beam.material.opacity = 0.10 + Math.sin(elapsed * 5) * 0.03;
  }

  // Busted: a cop car sits on the player while on foot, or a foot cop touches them.
  if (level > 0 && !playerCar) {
    let near = false;
    for (const cop of wanted.cops) {
      if (!cop.dead && distance2D(cop.x, cop.z, px, pz) < 3.2) { near = true; break; }
    }
    if (!near && callbacks.footCops) {
      for (const cop of callbacks.footCops) {
        if (!cop.dead && distance2D(cop.x, cop.z, px, pz) < 3.2) { near = true; break; }
      }
    }
    if (near) {
      wanted.bustedTimer += dt;
      if (wanted.bustedTimer > 1.6 && callbacks.onBusted) {
        wanted.bustedTimer = 0;
        callbacks.onBusted();
      }
    } else {
      wanted.bustedTimer = Math.max(0, wanted.bustedTimer - dt * 2);
    }
  } else {
    wanted.bustedTimer = 0;
  }

  // Siren blip for the HUD pulse.
  if (level > 0 && elapsed - wanted.lastBlip > 2.2) {
    wanted.lastBlip = elapsed;
    playSirenBlip();
  }
}

export function spawnFootCops(scene, world, rng, px, pz, count) {
  const cops = [];
  for (let i = 0; i < count; i += 1) cops.push(spawnFootCop(scene, world, rng, px, pz));
  return cops;
}

export function updateFootCop(ped, dt, world, player, rng) {
  if (ped.dead) return;
  const desired = Math.atan2(player.x - ped.x, player.z - ped.z);
  ped.heading += angleDelta(ped.heading, desired) * Math.min(1, dt * 5);
  const step = ped.speed * dt;
  ped.x += Math.sin(ped.heading) * step;
  ped.z += Math.cos(ped.heading) * step;
  for (const box of world.colliders) {
    if (box.island) continue;
    const push = resolveCircleBox(ped.x, ped.z, ped.radius, box);
    if (push) { ped.x += push.x; ped.z += push.z; }
  }
  ped.walkPhase += dt * ped.speed * 2.4;
  const swing = Math.sin(ped.walkPhase) * 0.8;
  ped.legL.rotation.x = swing;
  ped.legR.rotation.x = -swing;
  ped.armL.rotation.x = -swing * 0.8;
  ped.armR.rotation.x = swing * 0.8;
  ped.group.position.set(ped.x, Math.abs(Math.sin(ped.walkPhase)) * 0.04, ped.z);
  ped.group.rotation.y = ped.heading;
}
