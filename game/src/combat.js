// Combat: fists, the pistol, tracers, muzzle flash, and explosions that
// chain between cars and scatter nearby pedestrians.
import { distance2D, clamp } from './utils.js';
import { playGunshot, playPunch, playExplosion } from './audio.js';
import { damageVehicle } from './vehicles.js';
import { killPedestrian } from './traffic.js';

export function createCombat(scene) {
  return {
    scene,
    tracers: [],
    flashes: [],
    explosions: [],
    muzzleLight: null,
  };
}

function makeTracer(scene, from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(from.x, from.y, from.z),
    new THREE.Vector3(to.x, to.y, to.z),
  ]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.95 }));
  scene.add(line);
  return { line, life: 0.09 };
}

export function shootPistol(combat, origin, direction, player, targets) {
  const weapon = player.weapon || { cooldown: 0.28, damage: 26 };
  if (player.shootCooldown > 0) return false;
  if (player.ammo <= 0) {
    // Dry click, then auto-reload if there is reserve ammo.
    if (player.reserveAmmo > 0) reloadPistol(player);
    return false;
  }
  player.ammo -= 1;
  player.shootCooldown = weapon.cooldown;
  combat.lastHit = null;
  playGunshot();
  // Muzzle flash light, reused.
  if (!combat.muzzleLight) {
    combat.muzzleLight = new THREE.PointLight(0xffc46b, 0, 18, 1.8);
    combat.scene.add(combat.muzzleLight);
  }
  combat.muzzleLight.position.set(origin.x, origin.y, origin.z);
  combat.muzzleLight.intensity = 60;
  combat.flashes.push({ light: combat.muzzleLight, life: 0.06 });

  const range = 90;
  const end = {
    x: origin.x + direction.x * range,
    y: origin.y + direction.y * range,
    z: origin.z + direction.z * range,
  };
  let hit = null;
  let hitDist = range;
  // Pedestrians first: a simple ray-vs-circle test in the XZ plane.
  for (const ped of targets.peds) {
    if (ped.dead) continue;
    const dx = ped.x - origin.x;
    const dz = ped.z - origin.z;
    const along = dx * direction.x + dz * direction.z;
    if (along < 0 || along > hitDist) continue;
    const perp = Math.abs(dx * direction.z - dz * direction.x);
    if (perp < 1.1) {
      hit = { kind: 'ped', ped, dist: along };
      hitDist = along;
    }
  }
  for (const car of targets.cars) {
    if (car.dead) continue;
    const dx = car.x - origin.x;
    const dz = car.z - origin.z;
    const along = dx * direction.x + dz * direction.z;
    if (along < 0 || along > hitDist) continue;
    const perp = Math.abs(dx * direction.z - dz * direction.x);
    if (perp < car.radius * 0.8) {
      hit = { kind: 'car', car, dist: along };
      hitDist = along;
    }
  }
  if (hit) {
    end.x = origin.x + direction.x * hitDist;
    end.y = 1.1;
    end.z = origin.z + direction.z * hitDist;
    combat.lastHit = hit.kind;
    if (hit.kind === 'ped') {
      killPedestrian(hit.ped);
      hit.ped.panic = 0;
    } else {
      damageVehicle(hit.car, weapon.damage);
      if (hit.car.health <= 0 && !hit.car.exploded) {
        explode(combat, hit.car.x, hit.car.z, targets);
      }
    }
  }
  combat.tracers.push(makeTracer(combat.scene, origin, end));
  return true;
}

export function reloadPistol(player) {
  if (player.reserveAmmo <= 0 || player.ammo >= 12) return;
  const need = 12 - player.ammo;
  const take = Math.min(need, player.reserveAmmo);
  player.ammo += take;
  player.reserveAmmo -= take;
}

export function punch(combat, player, targets) {
  if (player.punching > 0) return;
  player.punching = 0.45;
  playPunch();
  const reach = 2.2;
  const fx = player.x + Math.sin(player.heading) * reach;
  const fz = player.z + Math.cos(player.heading) * reach;
  for (const ped of targets.peds) {
    if (ped.dead) continue;
    if (distance2D(fx, fz, ped.x, ped.z) < 1.6) {
      killPedestrian(ped);
      return;
    }
  }
  for (const car of targets.cars) {
    if (car.dead) continue;
    if (distance2D(fx, fz, car.x, car.z) < car.radius + 0.8) {
      damageVehicle(car, 4);
      return;
    }
  }
}

/** Fireball + light + chain damage to nearby cars and pedestrians. */
export function explode(combat, x, z, targets) {
  const scene = combat.scene;
  playExplosion();
  const fire = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.95 }),
  );
  fire.position.set(x, 1.4, z);
  scene.add(fire);
  const smoke = new THREE.Mesh(
    new THREE.SphereGeometry(2.2, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.75 }),
  );
  smoke.position.set(x, 3.2, z);
  scene.add(smoke);
  const light = new THREE.PointLight(0xff8a2a, 300, 45, 1.6);
  light.position.set(x, 4, z);
  scene.add(light);
  combat.explosions.push({ fire, smoke, light, life: 0, max: 1.1 });

  for (const car of targets.cars) {
    if (car.dead || car.exploded) continue;
    const d = distance2D(x, z, car.x, car.z);
    if (d < 9) {
      car.exploded = true;
      damageVehicle(car, 120);
      if (car.health <= 0) explode(combat, car.x, car.z, targets);
    } else if (d < 16) {
      damageVehicle(car, 30);
    }
  }
  for (const ped of targets.peds) {
    if (ped.dead) continue;
    const d = distance2D(x, z, ped.x, ped.z);
    if (d < 10) killPedestrian(ped);
    else if (d < 22) ped.panic = 4;
  }
  return { x, z };
}

export function updateCombat(combat, dt) {
  for (const t of combat.tracers) t.life -= dt;
  for (let i = combat.tracers.length - 1; i >= 0; i -= 1) {
    if (combat.tracers[i].life <= 0) {
      combat.scene.remove(combat.tracers[i].line);
      combat.tracers[i].line.geometry.dispose();
      combat.tracers.splice(i, 1);
    }
  }
  for (const f of combat.flashes) f.life -= dt;
  for (let i = combat.flashes.length - 1; i >= 0; i -= 1) {
    if (combat.flashes[i].life <= 0) {
      combat.flashes[i].light.intensity = 0;
      combat.flashes.splice(i, 1);
    }
  }
  for (let i = combat.explosions.length - 1; i >= 0; i -= 1) {
    const e = combat.explosions[i];
    e.life += dt;
    const k = e.life / e.max;
    e.fire.scale.setScalar(1 + k * 5);
    e.fire.material.opacity = Math.max(0, 0.95 - k);
    e.smoke.position.y = 3.2 + k * 7;
    e.smoke.scale.setScalar(1 + k * 3);
    e.smoke.material.opacity = Math.max(0, 0.75 - k * 0.7);
    e.light.intensity = Math.max(0, 300 * (1 - k));
    if (k >= 1) {
      combat.scene.remove(e.fire);
      combat.scene.remove(e.smoke);
      combat.scene.remove(e.light);
      combat.explosions.splice(i, 1);
    }
  }
}
