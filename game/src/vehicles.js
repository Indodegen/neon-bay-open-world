// NEON BAY — vehicles.js
// Six vehicle types with distinct handling, traffic AI that follows the road
// grid and turns at intersections, parked cars to steal, damage with smoke
// and explosions, near-miss bonuses, and the garage repair rule ($150).

import { clamp, dist, mulberry32, pickRandom, randomInt, randomRange, angleDiff } from './utils.js';
import { ROAD_X, ROAD_Y, ROAD_W, WORLD_W, WORLD_H, isOnRoad, circleHitsBuilding } from './city.js';

export const CAR_TYPES = {
  sedan: { name: 'Bayside Sedan', accel: 240, topSpeed: 300, turn: 2.6, grip: 0.9, color: ['#c94f4f', '#4f7ac9', '#c9c9c9', '#4fc98a'], len: 52, wid: 26 },
  taxi: { name: 'Bay Cab', accel: 230, topSpeed: 300, turn: 2.6, grip: 0.9, color: ['#f2c200'], len: 52, wid: 26 },
  sport: { name: 'Vortex GT', accel: 380, topSpeed: 520, turn: 3.4, grip: 1.0, color: ['#ff2e88', '#ffe600', '#00e5ff'], len: 54, wid: 26 },
  truck: { name: 'Hauler Truck', accel: 160, topSpeed: 260, turn: 1.9, grip: 0.7, color: ['#8a7a55', '#6b7a8a', '#a05a2c'], len: 66, wid: 30 },
  van: { name: 'Surf Van', accel: 200, topSpeed: 300, turn: 2.2, grip: 0.8, color: ['#7ac9c9', '#c98a4f', '#9a6bc9'], len: 58, wid: 28 },
  cruiser: { name: 'NBPD Cruiser', accel: 330, topSpeed: 470, turn: 3.1, grip: 0.95, color: ['#1c1c22'], len: 54, wid: 27 },
  bike: { name: 'Neon Bike', accel: 340, topSpeed: 460, turn: 4.2, grip: 0.8, color: ['#ff6a00', '#b967ff'], len: 44, wid: 16 },
};

export function makeCar(id, type, x, y, angle, opts) {
  const t = CAR_TYPES[type];
  const o = opts || {};
  return {
    id, type, name: t.name, x, y, angle, speed: 0,
    color: o.color || pickRandom(mulberry32(id * 7919 + 13), t.color),
    len: t.len, wid: t.wid, health: 100, maxHealth: 100,
    traffic: !!o.traffic, parked: !!o.parked, police: type === 'cruiser',
    driver: o.traffic ? 'traffic' : (o.parked ? null : 'player'),
    targetAngle: angle, stuck: 0, smoke: 0, dead: false, ramCooldown: 0,
    sirenPhase: 0, honkCooldown: 0, wasSpeed: 0,
  };
}

export function spawnTrafficCars(city, rng, count) {
  const cars = [];
  const types = ['sedan', 'taxi', 'sport', 'truck', 'van', 'sedan', 'taxi', 'van'];
  for (let i = 0; i < count; i++) {
    const horizontal = rng() < 0.5;
    let x, y, angle;
    if (horizontal) {
      y = ROAD_Y[Math.floor(rng() * ROAD_Y.length)] + (rng() < 0.5 ? -16 : 16);
      x = randomRange(rng, 200, 3800);
      angle = y % 2 === 0 ? 0 : Math.PI;
      angle = (ROAD_Y.indexOf(y - (rng() < 0.5 ? -16 : 16)) % 2 === 0) ? 0 : Math.PI;
      angle = rng() < 0.5 ? 0 : Math.PI;
    } else {
      x = ROAD_X[Math.floor(rng() * ROAD_X.length)] + (rng() < 0.5 ? -16 : 16);
      y = randomRange(rng, 200, 3000);
      angle = rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    }
    const car = makeCar(1000 + i, pickRandom(rng, types), x, y, angle, { traffic: true });
    car.speed = randomRange(rng, 90, 170);
    cars.push(car);
  }
  return cars;
}

export function spawnParkedCars(city, rng, count) {
  const cars = [];
  const types = ['sedan', 'sport', 'van', 'sedan', 'taxi', 'bike', 'sedan', 'sport'];
  for (let i = 0; i < count; i++) {
    const horizontal = rng() < 0.5;
    let x, y, angle;
    if (horizontal) {
      const ry = ROAD_Y[Math.floor(rng() * ROAD_Y.length)];
      y = ry + (rng() < 0.5 ? -ROAD_W / 2 + 8 : ROAD_W / 2 - 8);
      x = randomRange(rng, 400, 3700);
      angle = rng() < 0.5 ? 0 : Math.PI;
    } else {
      const rx = ROAD_X[Math.floor(rng() * ROAD_X.length)];
      x = rx + (rng() < 0.5 ? -ROAD_W / 2 + 8 : ROAD_W / 2 - 8);
      y = randomRange(rng, 400, 2900);
      angle = rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    }
    cars.push(makeCar(2000 + i, pickRandom(rng, types), x, y, angle, { parked: true }));
  }
  return cars;
}

export function driveCar(car, input, dt, audio) {
  const t = CAR_TYPES[car.type];
  const forward = input.down('w', 'arrowup') ? 1 : 0;
  const back = input.down('s', 'arrowdown') ? 1 : 0;
  const steer = (input.down('d', 'arrowright') ? 1 : 0) - (input.down('a', 'arrowleft') ? 1 : 0);
  const handbrake = input.down(' ');
  if (forward) car.speed += t.accel * dt;
  else if (back) car.speed -= (car.speed > 5 ? t.accel * 0.9 : t.accel * 0.45) * dt;
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 90 * dt);
  if (handbrake) {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 420 * dt);
    if (Math.abs(car.speed) > 120 && Math.random() < dt * 6 && audio) audio.skid();
  }
  car.speed = clamp(car.speed, -140, t.topSpeed);
  const spd = Math.abs(car.speed) / t.topSpeed;
  const dir = car.speed >= 0 ? 1 : -1;
  car.angle += steer * t.turn * spd * dir * dt * (handbrake ? 1.35 : 1);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  return { nx, ny };
}

export function collideCarWithWorld(city, car, nx, ny) {
  // Cars slide along building walls instead of stopping dead: try the x
  // move and the y move separately, so a car hugging a wall keeps rolling.
  const r = car.len / 2;
  let x = clamp(nx, 40, WORLD_W - 40);
  let y = clamp(ny, 40, WORLD_H - 40);
  let crashed = false;
  if (circleHitsBuilding(city, x, car.y, r * 0.8)) {
    x = car.x;
    crashed = true;
  }
  if (circleHitsBuilding(city, x, y, r * 0.8)) {
    y = car.y;
    crashed = true;
  }
  if (x >= 4000 && !(y >= 730 && y <= 790)) {
    // Beach / bay edge: sand slows, water stops.
    if (x > 4020) { x = 4020; crashed = Math.abs(car.speed) > 60; }
  }
  if (crashed) car.speed *= 0.8;
  return { x, y, crashed };
}

export function damageCar(car, amount, game) {
  if (car.dead) return;
  car.health -= amount;
  car.smoke = clamp(100 - car.health, 0, 100);
  if (car.health <= 0) {
    car.health = 0;
    car.dead = true;
    if (game) game.explodeCar(car);
  }
}

export function updateTrafficCar(car, dt, city, allCars, rng) {
  if (car.dead) return;
  const t = CAR_TYPES[car.type];
  // Traffic cruises along its road and turns at intersections.
  const onH = Math.abs(car.y - nearestRoadY(car.y)) < ROAD_W / 2 - 6;
  const onV = Math.abs(car.x - nearestRoadX(car.x)) < ROAD_W / 2 - 6;
  let wantAngle = car.angle;
  if (onH && !onV) {
    wantAngle = Math.cos(car.angle) > 0 ? 0 : Math.PI;
  } else if (onV && !onH) {
    wantAngle = Math.sin(car.angle) > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  // At an intersection, sometimes turn.
  if (onH && onV && rng() < dt * 0.25) {
    const options = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    wantAngle = options[Math.floor(rng() * options.length)];
  }
  // Slow for the car ahead.
  let slow = false;
  for (const other of allCars) {
    if (other === car || other.dead) continue;
    const d = dist(car.x, car.y, other.x, other.y);
    if (d < 70) {
      const ahead = Math.cos(car.angle) * (other.x - car.x) + Math.sin(car.angle) * (other.y - car.y);
      if (ahead > 0) { slow = true; break; }
    }
  }
  // Yield to a faster car behind (usually the player): speed up instead of
  // becoming a rolling roadblock the player rear-ends at full speed.
  let target = slow ? 0 : 130;
  for (const other of allCars) {
    if (other === car || other.dead || other.driver !== 'player') continue;
    const d = dist(car.x, car.y, other.x, other.y);
    if (d < 150) {
      const behind = Math.cos(car.angle) * (other.x - car.x) + Math.sin(car.angle) * (other.y - car.y);
      if (behind < 0 && Math.abs(other.speed) > car.speed) {
        slow = false;
        target = Math.max(target, Math.abs(other.speed) + 30);
      }
    }
  }
  car.speed += clamp(target - car.speed, -260 * dt, 160 * dt);
  const diff = angleDiff(car.angle, wantAngle);
  car.angle += clamp(diff, -1.6 * dt, 1.6 * dt);
  car.targetAngle = wantAngle;
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const hit = circleHitsBuilding(city, nx, ny, car.len / 2 * 0.8);
  if (hit || nx < 60 || nx > 3980 || ny < 60 || ny > WORLD_H - 60) {
    car.angle += Math.PI / 2;
    car.speed = 60;
    return;
  }
  car.x = nx;
  car.y = ny;
  car.honkCooldown -= dt;
}

export function nearestRoadX(x) {
  let best = ROAD_X[0];
  let bd = Infinity;
  for (const rx of ROAD_X) {
    const d = Math.abs(x - rx);
    if (d < bd) { bd = d; best = rx; }
  }
  return best;
}

export function nearestRoadY(y) {
  let best = ROAD_Y[0];
  let bd = Infinity;
  for (const ry of ROAD_Y) {
    const d = Math.abs(y - ry);
    if (d < bd) { bd = d; best = ry; }
  }
  return best;
}

export function carNearMiss(playerCar, other, prevDist) {
  // A fast pass within a car length that does not collide: bonus cash.
  if (!playerCar || playerCar.dead || other.dead) return false;
  const d = dist(playerCar.x, playerCar.y, other.x, other.y);
  const closing = prevDist !== undefined && d < prevDist;
  return Math.abs(playerCar.speed) > 220 && d < 64 && d > 34 && closing;
}
