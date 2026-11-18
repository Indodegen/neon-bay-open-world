// Vehicles: five drivable types with distinct handling, damage, smoke and
// fire, plus the arcade car physics (accelerate, brake, reverse, handbrake).
import { clamp, damp, angleDelta, resolveCircleBox, makeRng } from './utils.js';

export const VEHICLE_TYPES = {
  sedan: { name: 'Sedan', topSpeed: 26, accel: 11, brake: 22, turn: 1.9, color: 0x3a7bd5, length: 4.4, width: 1.9, height: 1.35 },
  sports: { name: 'Comet Sports', topSpeed: 38, accel: 16, brake: 26, turn: 2.3, color: 0xd21f3c, length: 4.3, width: 1.9, height: 1.1 },
  truck: { name: 'Box Truck', topSpeed: 20, accel: 7, brake: 16, turn: 1.4, color: 0xd8d3c8, length: 6.2, width: 2.3, height: 2.4 },
  bike: { name: 'Street Bike', topSpeed: 33, accel: 14, brake: 24, turn: 2.9, color: 0x1a1a1a, length: 2.3, width: 0.8, height: 1.2 },
  boat: { name: 'Wave Runner', topSpeed: 30, accel: 12, brake: 18, turn: 2.0, color: 0xf5f5f5, length: 5.0, width: 2.0, height: 1.1 },
  police: { name: 'CBPD Cruiser', topSpeed: 32, accel: 14, brake: 24, turn: 2.2, color: 0x111111, length: 4.6, width: 2.0, height: 1.4 },
};

const BODY_COLORS = [0x4a6b8a, 0x8a2f3c, 0x3d6b4a, 0xa8874a, 0x5a4a7a, 0xb8b2a4, 0x2e3440, 0x2a6b6b];

export function createVehicleMesh(type, colorOverride) {
  const def = VEHICLE_TYPES[type];
  const color = colorOverride ?? def.color;
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x14181f });
  const chromeMat = new THREE.MeshPhongMaterial({ color: 0xd8d8d8, shininess: 90 });

  if (type === 'bike') {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 2.1), bodyMat);
    frame.position.y = 0.75;
    frame.castShadow = true;
    group.add(frame);
    const tank = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.7), chromeMat);
    tank.position.set(0, 1.05, 0.1);
    group.add(tank);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 0.8), darkMat);
    seat.position.set(0, 1.0, -0.55);
    group.add(seat);
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.18, 14);
    for (const z of [0.85, -0.85]) {
      const wheel = new THREE.Mesh(wheelGeo, darkMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(0, 0.36, z);
      wheel.castShadow = true;
      group.add(wheel);
    }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
    lamp.position.set(0, 0.85, 1.1);
    group.add(lamp);
  } else if (type === 'boat') {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 5.0), bodyMat);
    hull.position.y = 0.55;
    hull.castShadow = true;
    group.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.6, 4), bodyMat);
    bow.rotation.x = -Math.PI / 2;
    bow.rotation.y = Math.PI / 4;
    bow.position.set(0, 0.55, 3.1);
    group.add(bow);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.25, 2.6), darkMat);
    deck.position.set(0, 0.95, -0.6);
    group.add(deck);
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 0.1),
      new THREE.MeshPhongMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.6, shininess: 120 }));
    windshield.position.set(0, 1.3, 0.8);
    windshield.rotation.x = -0.4;
    group.add(windshield);
  } else {
    const body = new THREE.Mesh(new THREE.BoxGeometry(def.width, def.height * 0.62, def.length), bodyMat);
    body.position.y = 0.62;
    body.castShadow = true;
    group.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(def.width * 0.86, def.height * 0.55, def.length * 0.48),
      new THREE.MeshPhongMaterial({ color: 0x18222e, shininess: 140, specular: 0x88aacc }));
    cabin.position.set(0, def.height * 0.85, -def.length * 0.06);
    cabin.castShadow = true;
    group.add(cabin);
    if (type === 'truck') {
      const box = new THREE.Mesh(new THREE.BoxGeometry(def.width * 1.02, 2.0, def.length * 0.55),
        new THREE.MeshLambertMaterial({ color: 0xe8e2d4 }));
      box.position.set(0, 1.55, -def.length * 0.22);
      box.castShadow = true;
      group.add(box);
    }
    if (type === 'police') {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(def.width * 1.01, 0.22, def.length * 0.9),
        new THREE.MeshLambertMaterial({ color: 0xffffff }));
      stripe.position.y = 0.75;
      group.add(stripe);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.5), darkMat);
      bar.position.set(0, def.height * 1.18, -def.length * 0.06);
      group.add(bar);
      const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.42),
        new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      red.position.set(-0.28, def.height * 1.2, -def.length * 0.06);
      group.add(red);
      const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.42),
        new THREE.MeshBasicMaterial({ color: 0x2266ff }));
      blue.position.set(0.28, def.height * 1.2, -def.length * 0.06);
      group.add(blue);
      group.userData.lightBar = { red, blue };
    }
    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 14);
    const wheels = [];
    for (const [wx, wz] of [
      [-def.width / 2, def.length * 0.32], [def.width / 2, def.length * 0.32],
      [-def.width / 2, -def.length * 0.32], [def.width / 2, -def.length * 0.32],
    ]) {
      const wheel = new THREE.Mesh(wheelGeo, darkMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.38, wz);
      wheel.castShadow = true;
      group.add(wheel);
      wheels.push(wheel);
    }
    group.userData.wheels = wheels;
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    for (const side of [-1, 1]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), headMat);
      lamp.position.set(side * (def.width / 2 - 0.35), 0.72, def.length / 2 + 0.02);
      group.add(lamp);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08),
        new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      tail.position.set(side * (def.width / 2 - 0.35), 0.72, -def.length / 2 - 0.02);
      group.add(tail);
    }
  }
  // Damage smoke puff, hidden until the car is hurt.
  const smoke = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeSmokeTexture(), color: 0x555555, transparent: true, opacity: 0, depthWrite: false,
  }));
  smoke.scale.set(2.4, 2.4, 1);
  smoke.position.set(0, 1.6, 0);
  group.add(smoke);
  group.userData.smoke = smoke;
  group.userData.bodyMat = bodyMat;
  return group;
}

let smokeTexture = null;
function makeSmokeTexture() {
  if (smokeTexture) return smokeTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  smokeTexture = new THREE.CanvasTexture(canvas);
  return smokeTexture;
}

export function spawnVehicle(scene, type, x, z, heading, opts = {}) {
  const def = VEHICLE_TYPES[type];
  const mesh = createVehicleMesh(type, opts.color ?? (opts.randomColor ? makeRng(opts.seed || 7).pick(BODY_COLORS) : undefined));
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  const vehicle = {
    type, def, mesh, x, z, heading, speed: 0, steer: 0,
    health: 100, maxHealth: 100, radius: Math.max(def.length, def.width) * 0.52,
    isPolice: type === 'police', isPlayer: false, isTraffic: !!opts.traffic,
    dead: false, exploded: false, cameraYaw: heading, smokeLevel: 0,
    parked: !!opts.parked, missionCar: !!opts.missionCar, name: def.name,
    ai: opts.ai || null, brakeLight: 0,
  };
  return vehicle;
}

/** Arcade driving: W/S throttle, A/D steer, Space handbrake. Returns speed in m/s. */
export function driveVehicle(v, input, dt, colliders, onCrash) {
  const def = v.def;
  const throttle = (input.has('KeyW') || input.has('ArrowUp') ? 1 : 0)
    - (input.has('KeyS') || input.has('ArrowDown') ? 1 : 0);
  const steerInput = (input.has('KeyA') || input.has('ArrowLeft') ? 1 : 0)
    - (input.has('KeyD') || input.has('ArrowRight') ? 1 : 0);
  const handbrake = input.has('Space');

  if (throttle > 0) v.speed += def.accel * dt * (1 - v.speed / (def.topSpeed * 1.15));
  else if (throttle < 0) {
    if (v.speed > 0.5) v.speed -= def.brake * dt;
    else v.speed -= def.accel * 0.45 * dt; // reverse
  } else {
    v.speed = damp(v.speed, 0, handbrake ? 4.5 : 0.9, dt);
  }
  v.speed = clamp(v.speed, -def.topSpeed * 0.35, def.topSpeed);
  if (handbrake) v.speed = damp(v.speed, 0, 2.2, dt);

  const steerTarget = steerInput;
  v.steer = damp(v.steer, steerTarget, 8, dt);
  const speedFactor = clamp(Math.abs(v.speed) / 8, 0.25, 1);
  const turnRate = def.turn * speedFactor * (handbrake ? 1.5 : 1);
  v.heading += v.steer * turnRate * dt * (v.speed >= 0 ? 1 : -1);

  const step = v.speed * dt;
  const nx = v.x + Math.sin(v.heading) * step;
  const nz = v.z + Math.cos(v.heading) * step;
  let crashed = false;
  let hitSpeed = 0;
  // Building collision: slide along the wall, lose speed on impact.
  let resolvedX = nx;
  let resolvedZ = nz;
  for (const box of colliders) {
    if (box.island) continue;
    const push = resolveCircleBox(resolvedX, resolvedZ, v.radius * 0.72, box);
    if (push) {
      hitSpeed = Math.abs(v.speed);
      resolvedX += push.x;
      resolvedZ += push.z;
      crashed = true;
    }
  }
  // Stay in the playable area (the bay is for boats only).
  if (v.type !== 'boat') {
    if (resolvedX > 282) { resolvedX = 282; crashed = true; hitSpeed = Math.abs(v.speed); }
    if (resolvedX < -272) { resolvedX = -272; crashed = true; hitSpeed = Math.abs(v.speed); }
    if (resolvedZ < -272) { resolvedZ = -272; crashed = true; hitSpeed = Math.abs(v.speed); }
    if (resolvedZ > 212) { resolvedZ = 212; crashed = true; hitSpeed = Math.abs(v.speed); }
  } else {
    if (resolvedX < 300) { resolvedX = 300; crashed = true; hitSpeed = Math.abs(v.speed); }
    if (resolvedX > 520) { resolvedX = 520; crashed = true; hitSpeed = Math.abs(v.speed); }
    if (resolvedZ < -272) { resolvedZ = -272; crashed = true; hitSpeed = Math.abs(v.speed); }
    if (resolvedZ > 212) { resolvedZ = 212; crashed = true; hitSpeed = Math.abs(v.speed); }
  }
  v.x = resolvedX;
  v.z = resolvedZ;
  if (crashed && hitSpeed > 6) {
    v.speed *= 0.45;
    damageVehicle(v, hitSpeed * 0.8);
    if (onCrash) onCrash(v, hitSpeed);
  } else if (crashed) {
    v.speed *= 0.8;
  }

  // Boat bobs on the water; cars lean into turns (roll) and pitch with the
  // throttle: squat under acceleration, dive under braking — the weight.
  const accelNow = (v._prevSpeed === undefined ? v.speed : v.speed - v._prevSpeed) / Math.max(dt, 0.001);
  v._prevSpeed = v.speed;
  const pitch = v.type === 'boat' ? 0 : clamp(-accelNow * 0.0022, -0.045, 0.045);
  const roll = v.type === 'boat'
    ? Math.sin(performance.now() * 0.0016) * 0.03
    : v.type === 'bike'
      ? -v.steer * 0.22
      : -v.steer * clamp(Math.abs(v.speed) / 20, 0, 1) * 0.06;
  v.mesh.position.set(v.x, v.type === 'boat' ? 0.25 + Math.sin(performance.now() * 0.0012) * 0.08 : 0, v.z);
  v.mesh.rotation.set(pitch, v.heading, roll);
  if (v.mesh.userData.wheels) {
    for (const w of v.mesh.userData.wheels) w.rotation.x += (v.speed * dt) / 0.38;
  }
  updateSmoke(v);
  return v.speed;
}

export function damageVehicle(v, amount) {
  if (v.dead) return;
  v.health -= amount;
  v.smokeLevel = clamp(1 - v.health / 100, 0, 1);
  if (v.health <= 0) {
    v.health = 0;
    v.dead = true;
  }
}

export function updateSmoke(v) {
  const smoke = v.mesh.userData.smoke;
  if (!smoke) return;
  const target = v.dead ? 0 : v.smokeLevel * 0.75;
  smoke.material.opacity = damp(smoke.material.opacity, target, 4, 0.016);
  if (smoke.material.opacity > 0.05) {
    smoke.position.y = 1.6 + Math.sin(performance.now() * 0.004) * 0.3;
    const s = 2.2 + v.smokeLevel * 1.6;
    smoke.scale.set(s, s, 1);
  }
}

/** Simple car-vs-car shove: both lose a little speed and take damage on hard hits. */
export function collideVehicles(a, b, onCrash) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.hypot(dx, dz);
  const min = a.radius * 0.7 + b.radius * 0.7;
  if (d >= min || d < 0.001) return false;
  const push = (min - d) / 2;
  const nx = dx / d;
  const nz = dz / d;
  a.x -= nx * push;
  a.z -= nz * push;
  b.x += nx * push;
  b.z += nz * push;
  const rel = Math.abs(a.speed - b.speed);
  if (rel > 5) {
    damageVehicle(a, rel * 0.5);
    damageVehicle(b, rel * 0.5);
    a.speed *= 0.6;
    b.speed *= 0.6;
    if (onCrash) onCrash(a, rel);
  }
  return true;
}

export function removeVehicle(scene, v) {
  scene.remove(v.mesh);
}

export function vehicleSpeedKmh(v) {
  return Math.abs(v.speed) * 3.6;
}
