// Combat: click to shoot (hitscan + tracer), F to punch, harbor guards who
// fight back. Round 7: a real weapon inventory — pistol / SMG / rifle with
// magazines, reserve ammo, reload (R), muzzle flash light + sprite, and gang
// gunmen with visible guns. Shoot/punch APIs identical to round 6.
import * as THREE from 'three';
import { makePersonMesh } from './player.js';
import { makeRng, range } from './random.js';

export const WEAPONS = [
  { name: 'PISTOL', key: 'Digit1', damage: 34, cooldown: 0.28, auto: false, mag: 12, tracer: 0xffe66d, spread: 0 },
  { name: 'SMG', key: 'Digit2', damage: 18, cooldown: 0.09, auto: true, mag: 30, tracer: 0x9be7ff, spread: 0.03 },
  { name: 'RIFLE', key: 'Digit3', damage: 55, cooldown: 0.45, auto: false, mag: 8, tracer: 0xff9f1c, spread: 0 },
];

function flashTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  r.addColorStop(0, 'rgba(255,240,180,1)');
  r.addColorStop(0.4, 'rgba(255,180,60,0.7)');
  r.addColorStop(1, 'rgba(255,140,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const FLASH_TEX = flashTexture();

export class Combat {
  constructor(scene, rng) {
    this.scene = scene; this.rng = rng;
    this.enemies = [];
    this.tracers = [];
    this.flashes = [];
    this.shootCooldown = 0;
    this.weaponIndex = 0;
    this.mags = WEAPONS.map((w) => w.mag); // rounds left in each weapon's mag
    this.reserve = [48, 120, 24]; // spare rounds per weapon
    this.reloadTimer = 0;
    this.takedowns = 0;
    // One reusable muzzle-flash light — cheap, no per-shot allocation.
    this.flashLight = new THREE.PointLight(0xffe66d, 0, 20, 1.5);
    scene.add(this.flashLight);
  }
  get weapon() { return WEAPONS[this.weaponIndex]; }
  get ammo() { return this.mags[this.weaponIndex]; }
  get ammoReserve() { return this.reserve[this.weaponIndex]; }
  switchWeapon(i) {
    if (i < 0 || i >= WEAPONS.length || i === this.weaponIndex) return false;
    this.weaponIndex = i; this.reloadTimer = 0;
    return true;
  }
  reload() {
    const w = this.weapon;
    if (this.reloadTimer > 0 || this.mags[this.weaponIndex] >= w.mag) return false;
    if (this.reserve[this.weaponIndex] <= 0) return false;
    this.reloadTimer = 1.1;
    return true;
  }
  spawnGuards(scene, pos, shirt = 0x1a1a22, count = 3) {
    for (let i = 0; i < count; i++) {
      const mesh = makePersonMesh(shirt, 0x333344, 0x8a6b4a, { cap: false });
      mesh.position.set(pos.x + range(this.rng, -8, 8), 0, pos.z + range(this.rng, -8, 8));
      // visible gun in the right hand
      const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.55),
        new THREE.MeshLambertMaterial({ color: 0x111111 }));
      gun.position.set(0.4, 1.15, 0.3);
      mesh.add(gun);
      scene.add(mesh);
      this.enemies.push({ mesh, hp: 60, shootTimer: range(this.rng, 1, 2), speed: 3.2 });
    }
  }
  aliveCount() { return this.enemies.filter((e) => e.hp > 0).length; }
  _muzzleFlash(origin) {
    const scale = this.weaponIndex === 2 ? 2.3 : this.weaponIndex === 1 ? 1.3 : 1.6;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: FLASH_TEX, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    s.position.copy(origin);
    s.scale.set(scale, scale, 1);
    this.scene.add(s);
    // Flash lasts a beat longer (0.09s) so it reads in a still frame.
    this.flashes.push({ sprite: s, life: 0.09 });
    this.flashLight.position.copy(origin);
    this.flashLight.intensity = this.weaponIndex === 2 ? 26 : 18;
  }
  shoot(origin, dir, player, audio) {
    if (this.shootCooldown > 0 || this.reloadTimer > 0) return;
    const w = this.weapon;
    if (this.mags[this.weaponIndex] <= 0) {
      audio.blip(140, 0.06, 'square', 0.12); // dry click — reload!
      this.shootCooldown = 0.25;
      return;
    }
    this.mags[this.weaponIndex] -= 1;
    this.shootCooldown = w.cooldown;
    audio.gunshot();
    this._muzzleFlash(origin);
    // spread: SMG sprays, pistol/rifle stay true
    const d = dir.clone();
    if (w.spread > 0) {
      d.x += (Math.random() - 0.5) * w.spread;
      d.z += (Math.random() - 0.5) * w.spread;
      d.normalize();
    }
    const end = origin.clone().add(d.clone().multiplyScalar(60));
    let hitEnemy = null, hitDist = 60;
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const to = e.mesh.position.clone().setY(1.2).sub(origin);
      const along = to.dot(d);
      if (along < 0 || along > 60) continue;
      const perp = to.clone().addScaledVector(d, -along).length();
      if (perp < 1.1 && along < hitDist) { hitDist = along; hitEnemy = e; }
    }
    if (hitEnemy) {
      hitEnemy.hp -= w.damage;
      end.copy(origin).addScaledVector(d, hitDist);
      if (hitEnemy.hp <= 0) {
        hitEnemy.mesh.rotation.x = -Math.PI / 2; hitEnemy.mesh.position.y = 0.3;
        player.cash += 50; this.takedowns += 1; audio.pickup();
      }
    }
    const geo = new THREE.BufferGeometry().setFromPoints([origin, end]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: w.tracer }));
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
        if (e.hp <= 0) { e.mesh.rotation.x = -Math.PI / 2; e.mesh.position.y = 0.3; player.cash += 50; this.takedowns += 1; audio.pickup(); }
      }
    }
    audio.blip(160, 0.08, 'square', 0.2);
  }
  update(dt, player, audio) {
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const w = this.weapon;
        const need = w.mag - this.mags[this.weaponIndex];
        const take = Math.min(need, this.reserve[this.weaponIndex]);
        this.mags[this.weaponIndex] += take;
        this.reserve[this.weaponIndex] -= take;
        audio.blip(700, 0.07);
      }
    }
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 220);
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].life -= dt;
      if (this.flashes[i].life <= 0) { this.scene.remove(this.flashes[i].sprite); this.flashes.splice(i, 1); }
    }
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
        // Guards shoot a little less often (1.6–2.8s) so on-foot combat
        // missions stay fair at 5 guards; tracers linger a touch longer.
        e.shootTimer = range(this.rng, 1.6, 2.8);
        // Guard shot: tracer + small damage, only on foot.
        const from = e.mesh.position.clone().setY(1.4);
        const dir = pp.clone().setY(1.2).sub(from).normalize();
        const geo = new THREE.BufferGeometry().setFromPoints([from, pp.clone().setY(1.2)]);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xff5566 }));
        this.scene.add(line);
        this.tracers.push({ line, life: 0.16 });
        this.flashLight.position.copy(from);
        this.flashLight.intensity = 8;
        audio.gunshot();
        if (!player.inCar && d < 26) player.damage(6);
      }
    }
  }
}
