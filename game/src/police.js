// Wanted level: stars rise with crimes, Coral Bay PD cruisers chase and ram the player.
import * as THREE from 'three';
import { makeRng, range } from './random.js';
import { Car } from './vehicles.js';

export class Police {
  constructor(scene, rng) {
    this.scene = scene; this.rng = rng;
    this.wanted = 0; this.heat = 0; // heat 0..100 feeds stars
    this.cars = [];
    this.spawnTimer = 0;
    this.bustedTimer = 0;
    this.flashT = 0;
  }
  addHeat(n) { this.heat = Math.min(100, this.heat + n); this.syncStars(); }
  syncStars() {
    const s = this.heat <= 0 ? 0 : this.heat < 25 ? 1 : this.heat < 50 ? 2 : this.heat < 75 ? 3 : this.heat < 95 ? 4 : 5;
    if (s !== this.wanted) { this.wanted = s; }
  }
  update(dt, player, audio) {
    this.flashT += dt;
    // Wanted decays slowly when the player stays clean and out of sight.
    if (this.wanted > 0) {
      this.heat = Math.max(0, this.heat - dt * 1.1);
      this.syncStars();
    }
    const wantCount = this.wanted === 0 ? 0 : Math.min(4, this.wanted + 1);
    this.spawnTimer -= dt;
    if (this.cars.length < wantCount && this.spawnTimer <= 0) {
      this.spawnTimer = 1.2;
      const p = player.inCar ? player.inCar.mesh.position : player.mesh.position;
      const a = range(this.rng, 0, Math.PI * 2);
      const car = new Car(this.scene, p.x + Math.sin(a) * 55, p.z + Math.cos(a) * 55, a, 0x111111,
        { police: true, maxSpeed: 30 + this.wanted * 2.5, accel: 20 });
      this.cars.push(car);
    }
    const target = player.inCar ? player.inCar.mesh.position : player.mesh.position;
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const cop = this.cars[i];
      cop.flashLights(this.flashT);
      if (this.wanted === 0) {
        // No heat: cruiser pulls away and despawns.
        const away = Math.atan2(cop.mesh.position.x - target.x, cop.mesh.position.z - target.z);
        cop.driveAI(dt, away, 14);
        if (Math.hypot(cop.mesh.position.x - target.x, cop.mesh.position.z - target.z) > 90) {
          this.scene.remove(cop.mesh); this.cars.splice(i, 1);
        }
        continue;
      }
      const dx = target.x - cop.mesh.position.x, dz = target.z - cop.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      const wantAngle = Math.atan2(dx, dz);
      cop.driveAI(dt, wantAngle, cop.maxSpeed);
      if (dist < 3.4) {
        // Ram: shove the player's car and hurt the player on foot.
        if (player.inCar) {
          player.inCar.speed *= 0.55;
          player.inCar.mesh.position.x += (dx / (dist || 1)) * -1.2;
          player.inCar.mesh.position.z += (dz / (dist || 1)) * -1.2;
          audio.crash();
        } else {
          if (player.damage(14 * dt * 4)) { /* death handled by main */ }
          this.bustedTimer += dt;
        }
        cop.speed *= 0.4;
      }
      if (dist < 2.6 && !player.inCar) {
        // Busted on foot: cops catch you.
        this.bustedTimer += dt * 2;
      } else if (dist > 6) {
        this.bustedTimer = Math.max(0, this.bustedTimer - dt);
      }
    }
    audio.setSiren(this.wanted > 0);
    return this.bustedTimer > 2.2;
  }
  clear() {
    for (const c of this.cars) this.scene.remove(c.mesh);
    this.cars = []; this.wanted = 0; this.heat = 0; this.bustedTimer = 0;
  }
}
