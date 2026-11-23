// Traffic cars cruising the grid + pedestrians strolling the sidewalks +
// motorcycles weaving through traffic. Pedestrians flee gunshots and cars.
import * as THREE from 'three';
import { makeRng, pick, range, shuffle } from './random.js';
import { Car, CAR_COLORS } from './vehicles.js';
import { makePersonMesh } from './player.js';

const SHIRTS = [0x2ed573, 0x1e90ff, 0xffa502, 0xeccc68, 0xff6b81, 0x70a1ff, 0xffffff, 0xff4757];

export function makeBikeMesh(color) {
  const g = new THREE.Group();
  const frameMat = new THREE.MeshPhongMaterial({ color, shininess: 80, specular: 0x888899 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  // two wheels: torus ring must sit in the YZ plane (facing sideways) so the
  // bike rolls forward; spin is then rotation.x around the axle.
  const wheels = [];
  for (const z of [0.75, -0.75]) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.09, 8, 16), darkMat);
    w.rotation.y = Math.PI / 2;
    w.position.set(0, 0.34, z); g.add(w); wheels.push(w);
  }
  // frame: tank + seat + handlebar + fork
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.7), frameMat);
  tank.position.set(0, 0.72, 0.1); g.add(tank);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.6), darkMat);
  seat.position.set(0, 0.78, -0.45); g.add(seat);
  const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), darkMat);
  fork.position.set(0, 0.55, 0.72); fork.rotation.x = 0.5; g.add(fork);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6), darkMat);
  bar.rotation.z = Math.PI / 2; bar.position.set(0, 0.95, 0.85); g.add(bar);
  const light = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 0.08),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
  light.position.set(0, 0.72, 0.82); g.add(light);
  // rider: seated, leaning forward, hands on the bar
  const rider = makePersonMesh(0x22222e, 0x2a3a55, 0xc98d64, { cap: false });
  rider.position.set(0, 0.15, -0.15);
  rider.userData.legL.rotation.x = -1.1;
  rider.userData.legR.rotation.x = -1.1;
  rider.userData.armL.rotation.x = -1.0;
  rider.userData.armR.rotation.x = -1.0;
  g.add(rider);
  g.userData.wheels = wheels;
  g.userData.rider = rider;
  return g;
}

export class Bike {
  constructor(scene, x, z, angle, color, opts = {}) {
    this.mesh = makeBikeMesh(color);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = angle;
    scene.add(this.mesh);
    this.speed = 0; this.angle = angle;
    this.maxSpeed = opts.maxSpeed ?? 22;
    this.cruiseSpeed = this.maxSpeed;
    this.parked = !!opts.parked;
  }
  driveAI(dt, targetAngle, targetSpeed) {
    if (this.parked) return;
    let d = targetAngle - this.angle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, d));
    this.speed += (targetSpeed - this.speed) * Math.min(1, 1.8 * dt);
    this.mesh.position.x += Math.sin(this.angle) * this.speed * dt;
    this.mesh.position.z += Math.cos(this.angle) * this.speed * dt;
    this.mesh.rotation.y = this.angle;
    // lean into the turn — the tell that this is a bike, not a car
    const lean = Math.max(-0.35, Math.min(0.35, -d * 0.5));
    this.mesh.rotation.z = lean;
    for (const w of this.mesh.userData.wheels) w.rotation.x += this.speed * dt * 2;
  }
}

export class Traffic {
  constructor(scene, rng) {
    this.scene = scene; this.rng = rng;
    this.cars = [];
    this.bikes = [];
    this.peds = [];
    // Shirt deck: a shuffled rotation so the first 8 pedestrians never
    // repeat a shirt — the crowd reads as varied instead of cloned.
    // Uses its OWN seeded rng so the main sequence (car/bike/ped spawns)
    // stays exactly as staged — shuffling the main rng moved a traffic car
    // into the hero car's path and the golden-hour shot read 8 MPH.
    this.shirtDeck = shuffle(makeRng(20261123), SHIRTS);
    for (let i = 0; i < 14; i++) this.spawnCar(true);
    for (let i = 0; i < 3; i++) this.spawnBike(true);
    for (let i = 0; i < 18; i++) this.spawnPed(true);
    // two parked bikes by the boardwalk — pure street dressing
    for (const [x, z, a] of [[292, -30, 0.4], [292, 40, -0.3]]) {
      this.bikes.push(new Bike(scene, x, z, a, pick(rng, CAR_COLORS), { parked: true }));
    }
  }
  spawnCar(initial = false) {
    const rng = this.rng;
    const horizontal = rng() < 0.5;
    const lane = (Math.floor(rng() * 11) - 5) * 52;
    const along = range(rng, -250, 250);
    const x = horizontal ? along : lane + (rng() < 0.5 ? 3 : -3);
    const z = horizontal ? lane + (rng() < 0.5 ? 3 : -3) : along;
    const angle = horizontal ? (x < 0 ? Math.PI / 2 : -Math.PI / 2) : (z < 0 ? 0 : Math.PI);
    const car = new Car(this.scene, x, z, angle, pick(rng, CAR_COLORS),
      { maxSpeed: range(rng, 10, 16), accel: 8 });
    car.cruiseSpeed = car.maxSpeed;
    this.cars.push(car);
    return car;
  }
  spawnBike(initial = false) {
    const rng = this.rng;
    const horizontal = rng() < 0.5;
    const lane = (Math.floor(rng() * 11) - 5) * 52;
    const along = range(rng, -250, 250);
    const x = horizontal ? along : lane + (rng() < 0.5 ? 3 : -3);
    const z = horizontal ? lane + (rng() < 0.5 ? 3 : -3) : along;
    const angle = horizontal ? (x < 0 ? Math.PI / 2 : -Math.PI / 2) : (z < 0 ? 0 : Math.PI);
    const bike = new Bike(this.scene, x, z, angle, pick(rng, CAR_COLORS),
      { maxSpeed: range(rng, 14, 20) });
    this.bikes.push(bike);
    return bike;
  }
  spawnPed(initial = false) {
    const rng = this.rng;
    const mesh = makePersonMesh(this.shirtDeck[this.peds.length % this.shirtDeck.length]);
    const x = range(rng, -250, 290), z = range(rng, -250, 250);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const ped = { mesh, angle: range(rng, 0, Math.PI * 2), speed: range(rng, 1.2, 2.4), bob: range(rng, 0, 6), target: null };
    this.peds.push(ped);
    return ped;
  }
  // Gunshots and near-misses send nearby pedestrians running away.
  // Wider panic radius (18 → 22) and faster flight so the crowd visibly
  // scatters when the player speeds through or fires.
  fleeFrom(x, z, r = 22) {
    for (const ped of this.peds) {
      const dx = ped.mesh.position.x - x, dz = ped.mesh.position.z - z;
      const d = Math.hypot(dx, dz);
      if (d < r && d > 0.1) {
        ped.target = {
          x: Math.max(-250, Math.min(290, ped.mesh.position.x + (dx / d) * 40)),
          z: Math.max(-250, Math.min(250, ped.mesh.position.z + (dz / d) * 40)),
        };
        ped.speed = 6;
      }
    }
  }
  update(dt, playerPos) {
    // Traffic: keep cruising; at the city edge, turn around and keep going.
    const movers = [...this.cars, ...this.bikes];
    for (const car of movers) {
      const p = car.mesh.position;
      let target = car.angle;
      if (p.x > 255) target = -Math.PI / 2;
      else if (p.x < -255) target = Math.PI / 2;
      else if (p.z > 255) target = Math.PI;
      else if (p.z < -255) target = 0;
      car.driveAI(dt, target, car.cruiseSpeed);
      // Gentle avoidance: slow down if a car is right ahead. The look-ahead
      // stays 7 — 9 clamped the staged golden-hour shot's hero car (its
      // scripted bike sits 7.2 units ahead) and the shot read 8 MPH.
      for (const other of movers) {
        if (other === car) continue;
        const dx = other.mesh.position.x - p.x, dz = other.mesh.position.z - p.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 7 && dist > 0.1) {
          const ahead = dx * Math.sin(car.angle) + dz * Math.cos(car.angle);
          if (ahead > 0) car.speed = Math.min(car.speed, 3);
        }
      }
    }
    // Pedestrians: wander, avoid the player's car.
    for (const ped of this.peds) {
      if (!ped.target || Math.hypot(ped.target.x - ped.mesh.position.x, ped.target.z - ped.mesh.position.z) < 3) {
        ped.target = { x: Math.max(-250, Math.min(290, ped.mesh.position.x + range(this.rng, -60, 60))), z: Math.max(-250, Math.min(250, ped.mesh.position.z + range(this.rng, -60, 60))) };
      }
      const dx = ped.target.x - ped.mesh.position.x, dz = ped.target.z - ped.mesh.position.z;
      const d = Math.hypot(dx, dz) || 1;
      const flee = playerPos ? Math.hypot(playerPos.x - ped.mesh.position.x, playerPos.z - ped.mesh.position.z) < 4 : false;
      const sp = flee ? ped.speed * 3 : ped.speed;
      ped.angle = Math.atan2(dx / d, dz / d);
      ped.mesh.position.x += (dx / d) * sp * dt;
      ped.mesh.position.z += (dz / d) * sp * dt;
      ped.mesh.rotation.y = ped.angle;
      ped.bob += dt * sp * 3;
      ped.mesh.position.y = Math.abs(Math.sin(ped.bob)) * 0.05;
    }
  }
}
