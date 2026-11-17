// NEON BAY — player.js
// The player on foot and behind the wheel: walking, sprinting, entering and
// exiting cars (stealing them), punching, firing the pistol, taking damage,
// and the busted / wasted respawn rules. The player is a person first —
// the car is a tool they steal, drive, crash and abandon.

import { clamp, dist, angleDiff } from './utils.js';
import { collideCircleWithCity } from './city.js';
import { damageCar } from './vehicles.js';
import { addHeat } from './police.js';

export function makePlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, speed: 0,
    health: 100, maxHealth: 100,
    walkSpeed: 205, sprintSpeed: 330,
    punchCooldown: 0, shootCooldown: 0, hurtTimer: 0,
    skin: '#f2c79b', shirt: '#ff2e88', pants: '#222831', jacket: '#1c2333',
    bobPhase: 0, moving: false,
  };
}

export function updatePlayerOnFoot(game, dt) {
  const p = game.player;
  const input = game.input;
  const mx = input.moveX();
  const my = input.moveY();
  const sprint = input.down('shift');
  const speed = sprint ? p.sprintSpeed : p.walkSpeed;
  p.moving = mx !== 0 || my !== 0;
  if (p.moving) {
    const len = Math.hypot(mx, my);
    const vx = (mx / len) * speed;
    const vy = (my / len) * speed;
    const nx = p.x + vx * dt;
    const ny = p.y + vy * dt;
    const fixed = collideCircleWithCity(game.city, nx, ny, 13);
    p.x = fixed.x;
    p.y = fixed.y;
    p.angle = Math.atan2(vy, vx);
    p.bobPhase += dt * (speed / 11);
  }
  // Aim at the mouse when shooting is possible.
  if (input.mouseDown || game.aiming) {
    const w = game.mouseWorld();
    p.angle = Math.atan2(w.y - p.y, w.x - p.x);
  }
  p.punchCooldown -= dt;
  p.shootCooldown -= dt;
  p.hurtTimer -= dt;

  // Punch: short range, knocks peds and officers down.
  if (input.justPressed(' ') && !game.playerCar) {
    tryPunch(game);
  }
  // Shoot: mouse click fires the pistol toward the cursor.
  if (input.mouseDown && p.shootCooldown <= 0 && !game.playerCar) {
    firePistol(game);
  }
  // Enter the nearest car.
  if (input.justPressed('e')) {
    tryEnterCar(game);
  }
}

export function tryPunch(game) {
  const p = game.player;
  if (p.punchCooldown > 0) return;
  p.punchCooldown = 0.45;
  if (game.audio) game.audio.punch();
  const reach = 46;
  const tx = p.x + Math.cos(p.angle) * reach;
  const ty = p.y + Math.sin(p.angle) * reach;
  game.punchFx = { x: tx, y: ty, t: 0.18 };
  for (const ped of game.peds) {
    if (!ped.down && dist(ped.x, ped.y, tx, ty) < 34) {
      game.knockPed(ped);
      addHeat(game, 12, 'Assault');
    }
  }
  for (const cop of game.cops) {
    if (cop.kind === 'officer' && dist(cop.x, cop.y, tx, ty) < 36) {
      cop.health -= 34;
      addHeat(game, 20, 'Assaulting an officer');
      if (cop.health <= 0) {
        cop.down = true;
        game.cops = game.cops.filter((c) => c !== cop);
        game.flashMessage('Officer down — the NBPD will remember that', '#ff3860');
        addHeat(game, 35, 'Officer down');
      }
    }
  }
  for (const car of game.vehicles) {
    if (!car.dead && dist(car.x, car.y, tx, ty) < 44) {
      damageCar(car, 6, game);
    }
  }
}

export function firePistol(game) {
  const p = game.player;
  p.shootCooldown = 0.28;
  if (game.audio) game.audio.gunshot();
  const w = game.mouseWorld();
  const angle = Math.atan2(w.y - p.y, w.x - p.x);
  game.bullets.push({
    x: p.x + Math.cos(angle) * 22, y: p.y + Math.sin(angle) * 22,
    vx: Math.cos(angle) * 900, vy: Math.sin(angle) * 900, life: 0.7, fromPlayer: true,
  });
  game.muzzleFx = { x: p.x + Math.cos(angle) * 26, y: p.y + Math.sin(angle) * 26, t: 0.07 };
  addHeat(game, 4, 'Shots fired');
  game.scareNearby(p.x, p.y, 420);
}

export function updateBullets(game, dt) {
  for (const b of game.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    // Hit a pedestrian.
    for (const ped of game.peds) {
      if (!ped.down && dist(ped.x, ped.y, b.x, b.y) < 16) {
        game.knockPed(ped);
        b.life = 0;
        addHeat(game, 18, 'Shooting a pedestrian');
        break;
      }
    }
    if (b.life <= 0) continue;
    // Hit an officer.
    for (const cop of game.cops) {
      if (cop.kind === 'officer' && dist(cop.x, cop.y, b.x, b.y) < 18) {
        cop.health -= 34;
        b.life = 0;
        addHeat(game, 15, 'Shooting at police');
        if (cop.health <= 0) {
          game.cops = game.cops.filter((c) => c !== cop);
          addHeat(game, 35, 'Officer down');
        }
        break;
      }
    }
    if (b.life <= 0) continue;
    // Hit a car.
    for (const car of game.vehicles) {
      if (!car.dead && dist(car.x, car.y, b.x, b.y) < 30) {
        damageCar(car, 12, game);
        b.life = 0;
        if (car.police) addHeat(game, 12, 'Shooting a cruiser');
        break;
      }
    }
    if (b.life <= 0) continue;
    // Hit a building: spark.
    if (game.city.buildings.some((bd) => b.x >= bd.x && b.x <= bd.x + bd.w && b.y >= bd.y && b.y <= bd.y + bd.h)) {
      game.sparks.push({ x: b.x, y: b.y, t: 0.25 });
      b.life = 0;
    }
  }
  game.bullets = game.bullets.filter((b) => b.life > 0);
}

export function tryEnterCar(game) {
  const p = game.player;
  let best = null;
  let bestD = 78;
  for (const car of game.vehicles) {
    if (car.dead) continue;
    const d = dist(p.x, p.y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  if (!best) return;
  const wasTraffic = best.traffic;
  const wasParked = best.parked;
  game.playerCar = best;
  best.parked = false;
  best.driver = 'player';
  p.x = best.x;
  p.y = best.y;
  if (wasTraffic) {
    best.traffic = false;
    addHeat(game, 25, 'Carjacking');
    game.flashMessage('You stole the ' + best.name + '!', '#ffe600');
  } else if (wasParked) {
    addHeat(game, 25, 'Grand theft auto');
    game.flashMessage('You stole the ' + best.name + '!', '#ffe600');
  }
  game.carsStolen++;
  if (game.audio) game.audio.pickup();
}

export function exitCar(game) {
  const p = game.player;
  const car = game.playerCar;
  if (!car) return;
  const side = car.angle + Math.PI / 2;
  const nx = car.x + Math.cos(side) * 40;
  const ny = car.y + Math.sin(side) * 40;
  const fixed = collideCircleWithCity(game.city, nx, ny, 13);
  p.x = fixed.x;
  p.y = fixed.y;
  p.angle = car.angle;
  car.speed = 0;
  car.driver = null;
  car.parked = true;
  game.playerCar = null;
}

export function hurtPlayer(game, amount, cause) {
  const p = game.player;
  if (p.hurtTimer > 0 || game.state !== 'playing') return;
  p.hurtTimer = 0.5;
  p.health -= amount;
  game.flashDamage();
  if (p.health <= 0) {
    p.health = 0;
    game.wasted(cause || 'You were wasted');
  }
}

export function checkCarPedCollisions(game, dt) {
  const car = game.playerCar;
  if (!car || car.dead) return;
  for (const ped of game.peds) {
    if (ped.down) continue;
    if (dist(ped.x, ped.y, car.x, car.y) < 34 && Math.abs(car.speed) > 40) {
      game.knockPed(ped);
      addHeat(game, 8, 'Hit and run');
      car.speed *= 0.82;
      if (game.audio) game.audio.punch();
    }
  }
  // Collide with other cars: damage both, sparks, and a possible near-miss.
  for (const other of game.vehicles) {
    if (other === car || other.dead) continue;
    const d = dist(car.x, car.y, other.x, other.y);
    if (d < 48) {
      if (Math.abs(car.speed) > 120 || Math.abs(other.speed) > 120) {
        const dmg = 4 + Math.abs(car.speed) / 100;
        game.damagePlayerCar(dmg);
        damageCar(other, dmg, game);
        car.speed *= 0.45;
        other.speed *= 0.5;
        game.sparks.push({ x: (car.x + other.x) / 2, y: (car.y + other.y) / 2, t: 0.3 });
        if (game.audio) game.audio.noiseHit(0.2, 0.3, 900);
      } else {
        // Gentle push apart — and shove the other car too, so a parked
        // car is something you push out of the way, not a concrete wall.
        const push = (48 - d) / 2;
        const a = Math.atan2(car.y - other.y, car.x - other.x);
        car.x += Math.cos(a) * push * 0.5;
        car.y += Math.sin(a) * push * 0.5;
        other.x -= Math.cos(a) * push * 0.5;
        other.y -= Math.sin(a) * push * 0.5;
      }
    }
  }
}
