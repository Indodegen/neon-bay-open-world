// Traffic and pedestrians: cars that follow the road grid, people who stroll
// the sidewalks, jog the beach, and panic when shots or explosions go off.
import { clamp, damp, angleDelta, makeRng, distance2D, resolveCircleBox } from './utils.js';
import { AVENUES, STREETS, ROAD_HALF, nearestRoadPoint } from './world.js';
import { spawnVehicle, driveVehicle, collideVehicles } from './vehicles.js';

const PED_SHIRTS = [0xe23b3b, 0x2f9e44, 0xe8a33d, 0x7a4fd0, 0xdddddd, 0x1f6fb2, 0x222831];
const PED_PANTS = [0x2a3242, 0x3a2a2a, 0x4a4a4a, 0x6b4a2f];

export function createPedestrian(scene, x, z, rng) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: rng.pick(PED_SHIRTS) });
  const pants = new THREE.MeshLambertMaterial({ color: rng.pick(PED_PANTS) });
  const skin = new THREE.MeshLambertMaterial({ color: rng.pick([0xd9a066, 0x8a5a3b, 0xf0c8a0, 0x6b4a2f]) });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.36), shirt);
  torso.position.y = 1.12;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skin);
  head.position.y = 1.72;
  group.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshLambertMaterial({ color: rng.pick([0x1a1a1a, 0x4a2f1a, 0x777777, 0x2a1a0a]) }));
  hair.position.y = 1.76;
  group.add(hair);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.68, 0.17), shirt);
  armL.position.set(-0.4, 1.15, 0);
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.4;
  group.add(armR);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.22), pants);
  legL.position.set(-0.16, 0.38, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  group.add(legR);
  group.position.set(x, 0, z);
  scene.add(group);
  return {
    group, armL, armR, legL, legR, x, z, heading: rng.range(0, Math.PI * 2),
    speed: rng.range(1.1, 1.9), walkPhase: rng.range(0, 6), radius: 0.5,
    target: null, panic: 0, dead: false, fallT: 0, state: 'walk',
  };
}

function pickPedTarget(ped, rng) {
  // Stroll along a sidewalk: pick a nearby avenue/sidewalk point.
  const avenue = rng.pick(AVENUES);
  return {
    x: avenue + rng.pick([-8.5, 8.5]),
    z: clamp(ped.z + rng.range(-90, 90), -250, 190),
  };
}

export function updatePedestrian(ped, dt, world, threats, rng) {
  if (ped.dead) {
    ped.fallT += dt;
    const k = Math.min(1, ped.fallT * 4);
    ped.group.rotation.x = -Math.PI / 2 * k;
    ped.group.position.y = 0.3 * k;
    return;
  }
  if (ped.panic > 0) ped.panic -= dt;
  // Panic: run away from the nearest threat.
  let speed = ped.speed;
  let tx;
  let tz;
  if (ped.panic > 0 && threats.length) {
    let nearest = threats[0];
    let best = Infinity;
    for (const th of threats) {
      const d = distance2D(ped.x, ped.z, th.x, th.z);
      if (d < best) { best = d; nearest = th; }
    }
    const dx = ped.x - nearest.x;
    const dz = ped.z - nearest.z;
    const d = Math.hypot(dx, dz) || 1;
    tx = ped.x + (dx / d) * 40;
    tz = ped.z + (dz / d) * 40;
    speed = 5.4;
  } else {
    if (!ped.target || distance2D(ped.x, ped.z, ped.target.x, ped.target.z) < 3) {
      ped.target = pickPedTarget(ped, rng);
    }
    tx = ped.target.x;
    tz = ped.target.z;
  }
  const desired = Math.atan2(tx - ped.x, tz - ped.z);
  ped.heading += angleDelta(ped.heading, desired) * Math.min(1, dt * 6);
  const step = speed * dt;
  ped.x += Math.sin(ped.heading) * step;
  ped.z += Math.cos(ped.heading) * step;
  for (const box of world.colliders) {
    if (box.island) continue;
    const push = resolveCircleBox(ped.x, ped.z, ped.radius, box);
    if (push) { ped.x += push.x; ped.z += push.z; }
  }
  ped.x = clamp(ped.x, -270, 300);
  ped.z = clamp(ped.z, -270, 210);
  ped.walkPhase += dt * speed * 2.4;
  const swing = Math.sin(ped.walkPhase) * (ped.panic > 0 ? 0.9 : 0.5);
  ped.legL.rotation.x = swing;
  ped.legR.rotation.x = -swing;
  ped.armL.rotation.x = -swing * 0.8;
  ped.armR.rotation.x = swing * 0.8;
  ped.group.position.set(ped.x, Math.abs(Math.sin(ped.walkPhase)) * 0.04, ped.z);
  ped.group.rotation.y = ped.heading;
}

export function killPedestrian(ped) {
  if (ped.dead) return;
  ped.dead = true;
  ped.fallT = 0;
}

/** Spawn the ambient traffic: parked cars and moving cars on the grid. */
export function spawnTraffic(scene, world, rng, count) {
  const cars = [];
  const types = ['sedan', 'sedan', 'sedan', 'sports', 'truck', 'bike'];
  for (let i = 0; i < count; i += 1) {
    const spot = world.carSpawns[Math.floor(rng.next() * world.carSpawns.length)];
    const onAvenue = Math.abs(spot.x % 60) < 1;
    const heading = onAvenue ? (rng.chance(0.5) ? 0 : Math.PI) : (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2);
    const type = types[Math.floor(rng.next() * types.length)];
    const car = spawnVehicle(scene, type, spot.x, spot.z, heading, {
      traffic: true, randomColor: true, seed: Math.floor(rng.next() * 1e9),
    });
    if (rng.chance(0.35)) {
      car.parked = true;
      car.speed = 0;
    } else {
      car.ai = { target: null, speed: rng.range(7, 12), wait: 0 };
      car.parked = false;
    }
    cars.push(car);
  }
  return cars;
}

/** Pick the next intersection for a traffic car, avoiding U-turns. */
function pickNextIntersection(car, rng) {
  const road = nearestRoadPoint(car.x, car.z);
  const options = [];
  const onAvenue = Math.abs(road.x - car.x) < 2;
  if (onAvenue) {
    const idx = STREETS.indexOf(road.z);
    if (idx > 0) options.push({ x: road.x, z: STREETS[idx - 1] });
    if (idx < STREETS.length - 1) options.push({ x: road.x, z: STREETS[idx + 1] });
  } else {
    const idx = AVENUES.indexOf(road.x);
    if (idx > 0) options.push({ x: AVENUES[idx - 1], z: road.z });
    if (idx < AVENUES.length - 1) options.push({ x: AVENUES[idx + 1], z: road.z });
  }
  // At an intersection, turning onto the cross road keeps the city flowing.
  if (options.length === 0) return { x: road.x, z: road.z };
  return options[Math.floor(rng.next() * options.length)];
}

export function updateTrafficCar(car, dt, world, rng, playerCar, others) {
  if (car.dead || car.parked) return;
  const ai = car.ai;
  if (!ai) return;
  if (ai.wait > 0) {
    ai.wait -= dt;
    return;
  }
  if (!ai.target || distance2D(car.x, car.z, ai.target.x, ai.target.z) < 6) {
    ai.target = pickNextIntersection(car, rng);
  }
  // Slow down if another car is right ahead.
  let blocked = false;
  for (const other of others) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const ahead = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
    const side = Math.abs(dx * Math.cos(car.heading) - dz * Math.sin(car.heading));
    if (ahead > 0 && ahead < 9 && side < 2.4) { blocked = true; break; }
  }
  if (playerCar && !playerCar.dead) {
    const dx = playerCar.x - car.x;
    const dz = playerCar.z - car.z;
    const ahead = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
    const side = Math.abs(dx * Math.cos(car.heading) - dz * Math.sin(car.heading));
    if (ahead > 0 && ahead < 9 && side < 2.6) blocked = true;
  }
  const desired = Math.atan2(ai.target.x - car.x, ai.target.z - car.z);
  const turn = angleDelta(car.heading, desired);
  car.heading += clamp(turn, -1.6 * dt, 1.6 * dt);
  const targetSpeed = blocked ? 0 : ai.speed;
  car.speed = damp(car.speed, targetSpeed, 2.2, dt);
  const step = car.speed * dt;
  car.x += Math.sin(car.heading) * step;
  car.z += Math.cos(car.heading) * step;
  // Keep traffic on the roads: nudge back onto the grid if it drifts.
  const road = nearestRoadPoint(car.x, car.z);
  if (!road) return;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  if (car.mesh.userData.wheels) {
    for (const w of car.mesh.userData.wheels) w.rotation.x += (car.speed * dt) / 0.38;
  }
}

export function updateTrafficCollisions(cars, onCrash) {
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      if (a.dead || b.dead || a.parked || b.parked) continue;
      collideVehicles(a, b, onCrash);
    }
  }
}
