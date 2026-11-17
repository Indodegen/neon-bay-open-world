// Traffic cars cruising the grid + pedestrians strolling the sidewalks.
import * as THREE from 'three';
import { makeRng, pick, range } from './random.js';
import { Car, CAR_COLORS } from './vehicles.js';
import { makePersonMesh } from './player.js';

const SHIRTS = [0x2ed573, 0x1e90ff, 0xffa502, 0xeccc68, 0xff6b81, 0x70a1ff, 0xffffff, 0xff4757];

export class Traffic {
  constructor(scene, rng) {
    this.scene = scene; this.rng = rng;
    this.cars = [];
    this.peds = [];
    for (let i = 0; i < 14; i++) this.spawnCar(true);
    for (let i = 0; i < 18; i++) this.spawnPed(true);
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
      { maxSpeed: range(rng, 9, 14), accel: 8 });
    car.cruiseSpeed = car.maxSpeed;
    this.cars.push(car);
    return car;
  }
  spawnPed(initial = false) {
    const rng = this.rng;
    const mesh = makePersonMesh(pick(rng, SHIRTS));
    const x = range(rng, -250, 290), z = range(rng, -250, 250);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const ped = { mesh, angle: range(rng, 0, Math.PI * 2), speed: range(rng, 1.2, 2.4), bob: range(rng, 0, 6), target: null };
    this.peds.push(ped);
    return ped;
  }
  update(dt, playerPos) {
    // Traffic: keep cruising; at the city edge, turn around and keep going.
    for (const car of this.cars) {
      const p = car.mesh.position;
      let target = car.angle;
      if (p.x > 255) target = -Math.PI / 2;
      else if (p.x < -255) target = Math.PI / 2;
      else if (p.z > 255) target = Math.PI;
      else if (p.z < -255) target = 0;
      car.driveAI(dt, target, car.cruiseSpeed);
      // Gentle avoidance: slow down if a car is right ahead.
      for (const other of this.cars) {
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
