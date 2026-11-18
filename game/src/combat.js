// NEON BAY — combat.js
// Punch + pistol with tracers, muzzle flash, ammo/reload and explosions with
// chain damage. All cooldowns tick in the main step() in EVERY mode —
// on-foot AND driving — so drive-by shooting can never freeze after one shot.

import { PLAYER } from './config.js';
import { clamp, dist2d } from './util.js';

export function createCombat(scene) {
  return {
    scene,
    tracers: [],     // {mesh, life}
    flashes: [],     // {mesh, life}
    explosions: [],  // {mesh, light, life, r}
    muzzle: null,
    punchT: 0,
  };
}

export function makeMuzzleFlash(scene) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.95 });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), mat);
  g.add(core);
  const spike = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 6), mat);
  spike.rotation.x = Math.PI / 2; spike.position.z = 0.5; g.add(spike);
  g.visible = false;
  scene.add(g);
  return g;
}

export function firePistol(C, game, from, dir) {
  if (!game || !game.player) return false;
  const p = game.player;
  if (p.ammo <= 0) {
    game.audio.blip(220, 0.08, 'square', 0.2);
    game.hud.notify('EMPTY', 'Press R to reload');
    // Brief cooldown on the dry click so holding the trigger does not
    // spam the EMPTY notification every frame.
    p.shootCooldown = 0.25;
    return false;
  }
  p.ammo--;
  p.shootCooldown = PLAYER.shootCooldown;
  game.audio.shot();

  // Muzzle flash at the gun position.
  if (!C.muzzle) C.muzzle = makeMuzzleFlash(C.scene);
  C.muzzle.position.set(from.x, from.y, from.z);
  C.muzzle.lookAt(from.x + dir.x, from.y + dir.y, from.z + dir.z);
  C.muzzle.visible = true;
  C.flashes.push({ mesh: C.muzzle, life: 0.06 });

  // Tracer: bright line to the hit point.
  const end = { x: from.x + dir.x * PLAYER.pistolRange, y: from.y + dir.y * PLAYER.pistolRange, z: from.z + dir.z * PLAYER.pistolRange };
  let hitAnything = false;
  // Hit police units / foot cops / mission targets near the line.
  const hitR = 3.0;
  for (const u of game.police.units) {
    if (u.v.dead) continue;
    const d = distToSegment(u.v.x, 1.2, u.v.z, from, end);
    if (d < hitR) {
      u.v.hp -= PLAYER.pistolDamage;
      p.lastShotHit = true;
      hitAnything = true;
      end.x = u.v.x; end.y = 1.2; end.z = u.v.z;
      if (u.v.hp <= 0) { u.v.dead = true; game.addHeat(25); game.hud.notify('UNIT DOWN', `${u.name} disabled`); }
      break;
    }
  }
  if (!hitAnything) {
    for (const c of game.police.footCops) {
      const d = distToSegment(c.x, 1.2, c.z, from, end);
      if (d < hitR) {
        game.police.footCops = game.police.footCops.filter(x => x !== c);
        game.scene.remove(c.mesh);
        p.lastShotHit = true;
        game.addHeat(20);
        hitAnything = true;
        end.x = c.x; end.y = 1.2; end.z = c.z;
        break;
      }
    }
  }
  if (!hitAnything) {
    // Mission eliminate targets count as hits when shot near them.
    const cur = game.M.current;
    if (cur && cur.stage && cur.stage.type === 'eliminate') {
      for (const t of cur.targets) {
        if (!t.done && distToSegment(t.x, 1, t.z, from, end) < 6) {
          t.done = true; game.scene.remove(t.mesh);
          p.lastShotHit = true;
          hitAnything = true;
          end.x = t.x; end.y = 1; end.z = t.z;
          game.addHeat(15);
          break;
        }
      }
    }
  }
  // Building hit: shorten the tracer at the first collider.
  if (!hitAnything) {
    for (let s = 0; s < 1; s += 0.02) {
      const x = from.x + dir.x * PLAYER.pistolRange * s;
      const z = from.z + dir.z * PLAYER.pistolRange * s;
      if (game.world.blocked(x, z, 0)) {
        end.x = x; end.y = from.y + dir.y * PLAYER.pistolRange * s; end.z = z;
        break;
      }
    }
  }
  const len = Math.hypot(end.x - from.x, end.y - from.y, end.z - from.z);
  const geo = new THREE.CylinderGeometry(0.03, 0.03, len, 5);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
  const tracer = new THREE.Mesh(geo, mat);
  tracer.position.set((from.x + end.x) / 2, (from.y + end.y) / 2, (from.z + end.z) / 2);
  tracer.lookAt(end.x, end.y, end.z);
  tracer.rotateX(Math.PI / 2);
  C.scene.add(tracer);
  C.tracers.push({ mesh: tracer, life: 0.09 });
  if (!hitAnything && game.police.stars < 5) game.addHeat(2); // firing a gun in public draws attention
  return true;
}

function distToSegment(px, py, pz, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = px - a.x, apy = py - a.y, apz = pz - a.z;
  const len2 = abx * abx + aby * aby + abz * abz || 1;
  const t = clamp((apx * abx + apy * aby + apz * abz) / len2, 0, 1);
  const cx = a.x + abx * t, cy = a.y + aby * t, cz = a.z + abz * t;
  return Math.hypot(px - cx, py - cy, pz - cz);
}

export function punch(C, game) {
  const p = game.player;
  if (C.punchT > 0) return;
  C.punchT = 0.45;
  game.audio.punch();
  // Hit the nearest cop / target in front.
  const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
  for (const u of game.police.units) {
    if (u.v.dead) continue;
    const d = dist2d(p.x, p.z, u.v.x, u.v.z);
    if (d < PLAYER.punchRange + 2) {
      u.v.hp -= PLAYER.punchDamage;
      p.lastShotHit = true;
      game.addHeat(10);
      if (u.v.hp <= 0) u.v.dead = true;
      break;
    }
  }
  for (const c of [...game.police.footCops]) {
    if (dist2d(p.x, p.z, c.x, c.z) < PLAYER.punchRange + 1) {
      game.police.footCops = game.police.footCops.filter(x => x !== c);
      game.scene.remove(c.mesh);
      p.lastShotHit = true;
      game.addHeat(12);
      break;
    }
  }
  // Punch also works on mission eliminate targets up close.
  const cur = game.M.current;
  if (cur && cur.stage && cur.stage.type === 'eliminate') {
    for (const t of cur.targets) {
      if (!t.done && dist2d(p.x, p.z, t.x, t.z) < 3.5) {
        t.done = true; game.scene.remove(t.mesh); p.lastShotHit = true;
        break;
      }
    }
  }
}

export function explode(C, game, x, y, z, radius = 9, damage = 70) {
  game.audio.explosion();
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xffaa22, transparent: true, opacity: 0.95 }));
  g.add(core);
  const outer = new THREE.Mesh(new THREE.SphereGeometry(1.8, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xff5522, transparent: true, opacity: 0.55 }));
  g.add(outer);
  const light = new THREE.PointLight(0xff8822, 600, 40, 1.8);
  light.position.y = 1; g.add(light);
  g.position.set(x, y, z);
  C.scene.add(g);
  C.explosions.push({ mesh: g, light, life: 0.7, max: 0.7, r: radius });

  // Damage + chain: vehicles and cops in the blast.
  const all = [...game.traffic, ...game.police.units.map(u => u.v)];
  if (game.player.vehicle) all.push(game.player.vehicle);
  for (const v of all) {
    if (v.dead) continue;
    const d = dist2d(x, z, v.x, v.z);
    if (d < radius) {
      v.hp -= damage * (1 - d / radius);
      if (v.hp <= 0 && !v.dead) {
        v.dead = true;
        setTimeout(() => explode(C, game, v.x, 1.2, v.z, 7, 40), 250); // chain
      }
    }
  }
  if (dist2d(x, z, game.player.x, game.player.z) < radius * 0.8 && !game.player.vehicle) {
    game.damagePlayer(damage * 0.5);
  }
  // Shake the camera.
  game.shake = Math.max(game.shake, 0.7);
}

export function stepCombat(C, dt) {
  C.punchT = Math.max(0, C.punchT - dt);
  for (const t of [...C.tracers]) {
    t.life -= dt;
    if (t.life <= 0) { C.scene.remove(t.mesh); t.mesh.geometry.dispose(); C.tracers.splice(C.tracers.indexOf(t), 1); }
  }
  for (const f of [...C.flashes]) {
    f.life -= dt;
    if (f.life <= 0) { f.mesh.visible = false; C.flashes.splice(C.flashes.indexOf(f), 1); }
  }
  for (const e of [...C.explosions]) {
    e.life -= dt;
    const k = Math.max(0, e.life / e.max);
    e.mesh.scale.setScalar(1 + (1 - k) * e.r * 0.6);
    e.mesh.children[0].material.opacity = k;
    e.mesh.children[1].material.opacity = k * 0.55;
    e.light.intensity = 600 * k;
    if (e.life <= 0) { C.scene.remove(e.mesh); C.explosions.splice(C.explosions.indexOf(e), 1); }
  }
}
