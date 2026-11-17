// Combat: click to shoot (hitscan + tracer), F to punch, harbor guards who fight back.
import * as THREE from 'three';
import { makePersonMesh } from './player.js';
import { makeRng, range } from './random.js';

export class Combat {
  constructor(scene, rng) {
    this.scene = scene; this.rng = rng;
    this.enemies = [];
    this.tracers = [];
    this.shootCooldown = 0;
  }
  spawnGuards(scene, pos) {
    for (let i = 0; i < 3; i++) {
      const mesh = makePersonMesh(0x1a1a22, 0x333344, 0x8a6b4a);
      mesh.position.set(pos.x + range(this.rng, -8, 8), 0, pos.z + range(this.rng, -8, 8));
      scene.add(mesh);
      this.enemies.push({ mesh, hp: 60, shootTimer: range(this.rng, 1, 2), speed: 3.2 });
    }
  }
  aliveCount() { return this.enemies.filter((e) => e.hp > 0).length; }
  shoot(origin, dir, player, audio) {
    if (this.shootCooldown > 0) return;
    this.shootCooldown = 0.28;
    audio.gunshot();
    const end = origin.clone().add(dir.clone().multiplyScalar(60));
    let hitEnemy = null, hitDist = 60;
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const to = e.mesh.position.clone().setY(1.2).sub(origin);
      const along = to.dot(dir);
      if (along < 0 || along > 60) continue;
      const perp = to.clone().addScaledVector(dir, -along).length();
      if (perp < 1.1 && along < hitDist) { hitDist = along; hitEnemy = e; }
    }
    if (hitEnemy) {
      hitEnemy.hp -= 34;
      end.copy(origin).addScaledVector(dir, hitDist);
      if (hitEnemy.hp <= 0) {
        hitEnemy.mesh.rotation.x = -Math.PI / 2; hitEnemy.mesh.position.y = 0.3;
        player.cash += 50; audio.pickup();
      }
    }
    const geo = new THREE.BufferGeometry().setFromPoints([origin, end]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe66d }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.12 });
  }
  punch(player, audio) {
    if (!player.punch()) return;
    const pp = player.mesh.position;
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const d = Math.hypot(e.mesh.position.x - pp.x, e.mesh.position.z - pp.z);
      if (d < 2.2) {
        e.hp -= 25;
        e.mesh.position.x += Math.sin(player.angle) * 0.6;
        e.mesh.position.z += Math.cos(player.angle) * 0.6;
        if (e.hp <= 0) { e.mesh.rotation.x = -Math.PI / 2; e.mesh.position.y = 0.3; player.cash += 50; audio.pickup(); }
      }
    }
    audio.blip(160, 0.08, 'square', 0.2);
  }
  update(dt, player, audio) {
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    for (const t of this.tracers) t.life -= dt;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      if (this.tracers[i].life <= 0) { this.scene.remove(this.tracers[i].line); this.tracers.splice(i, 1); }
    }
    const pp = player.inCar ? player.inCar.mesh.position : player.mesh.position;
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const dx = pp.x - e.mesh.position.x, dz = pp.z - e.mesh.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 2.2 && d < 45) {
        e.mesh.position.x += (dx / d) * e.speed * dt;
        e.mesh.position.z += (dz / d) * e.speed * dt;
        e.mesh.rotation.y = Math.atan2(dx, dz);
      }
      e.shootTimer -= dt;
      if (d < 26 && e.shootTimer <= 0) {
        e.shootTimer = range(this.rng, 1.4, 2.4);
        // Guard shot: tracer + small damage, only on foot.
        const from = e.mesh.position.clone().setY(1.4);
        const dir = pp.clone().setY(1.2).sub(from).normalize();
        const geo = new THREE.BufferGeometry().setFromPoints([from, pp.clone().setY(1.2)]);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xff5566 }));
        this.scene.add(line);
        this.tracers.push({ line, life: 0.15 });
        audio.gunshot();
        if (!player.inCar && d < 26) player.damage(6);
      }
    }
  }
}
