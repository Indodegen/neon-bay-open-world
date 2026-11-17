// vehicles.js — Cars: what they are, how they drive, and how they look.
// One Car object serves parked cars, traffic, police and the player's ride;
// the physics here is the arcade handling the whole game shares.
import { CAR_TYPES, CAR_COLORS } from './config.js';
import { Rng } from './random.js';
import { resolveCollision, isRoad, isWater } from './city.js';

let carIdCounter = 1;

export function createCar(type, x, y, angle, rng) {
  const spec = CAR_TYPES[type] || CAR_TYPES.sedan;
  const car = {
    id: carIdCounter++,
    type,
    name: spec.name,
    x, y,
    angle,
    speed: 0,
    steer: 0,
    hp: spec.hp,
    maxHp: spec.hp,
    color: type === 'taxi' ? '#ffd319' : type === 'police' ? '#e8ecf4' : (rng ? rng.pick(CAR_COLORS) : '#ff2e88'),
    topSpeed: spec.topSpeed,
    accel: spec.accel,
    brake: spec.brake,
    grip: spec.grip,
    length: spec.length,
    width: spec.width,
    parked: false,
    driver: null, // 'traffic' | 'police' | 'player' | null
    dead: false,
    burning: false,
    brakeLights: false,
    sirenPhase: 0,
    honkCooldown: 0,
    skidTimer: 0,
  };
  return car;
}

export function randomParkedCar(city, rng) {
  const type = rng.pick(['sedan', 'sedan', 'sports', 'van', 'truck', 'taxi']);
  // Parked along a road edge, facing along the road.
  const vertical = rng.chance(0.5);
  let x, y, angle;
  if (vertical) {
    const rx = rng.pick(city.roadsV);
    x = rx + (rng.chance(0.5) ? -1 : 1) * 36;
    y = rng.range(120, 2280);
    angle = rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
  } else {
    const ry = rng.pick(city.roadsH);
    x = rng.range(420, 3500);
    y = ry + (rng.chance(0.5) ? -1 : 1) * 36;
    angle = rng.chance(0.5) ? 0 : Math.PI;
  }
  const car = createCar(type, x, y, angle, rng);
  car.parked = true;
  return car;
}

// Arcade driving: throttle, steering that scales down with speed, drift on
// handbrake, off-road drag, and building collision with a damage penalty.
export function driveCar(car, city, throttle, steerInput, handbrake, dt, onCrash) {
  const spec = CAR_TYPES[car.type];
  const onRoad = isRoad(city, car.x, car.y);
  const surface = onRoad ? 1 : 0.55;
  const water = isWater(city, car.x, car.y);

  if (throttle > 0) {
    car.speed += spec.accel * surface * throttle * dt;
  } else if (throttle < 0) {
    if (car.speed > 12) car.speed += spec.brake * throttle * dt;
    else car.speed += spec.accel * 0.55 * throttle * dt; // reverse
  }
  if (handbrake) {
    car.speed -= Math.sign(car.speed) * 620 * dt;
    if (Math.abs(car.speed) < 8) car.speed = 0;
  }
  // Rolling drag and off-road slowdown.
  car.speed -= car.speed * (onRoad ? 0.35 : 1.15) * dt;
  if (water) car.speed *= 0.86;
  const maxForward = spec.topSpeed * surface;
  const maxReverse = 150;
  if (car.speed > maxForward) car.speed = maxForward;
  if (car.speed < -maxReverse) car.speed = -maxReverse;
  if (Math.abs(car.speed) < 3 && throttle === 0) car.speed = 0;

  const speedFactor = Math.min(1, Math.abs(car.speed) / 220);
  const steerRate = spec.grip * (handbrake ? 1.7 : 1) * (1 - speedFactor * 0.45);
  car.angle += steerInput * steerRate * dt * Math.sign(car.speed || 1) * (car.speed < 0 ? -1 : 1);

  const prevX = car.x;
  const prevY = car.y;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;

  const hit = resolveCollision(city, car, car.length * 0.42);
  if (hit) {
    const impact = Math.abs(car.speed);
    if (impact > 90 && onCrash) onCrash(car, impact);
    car.speed *= 0.35;
    // Slide along the wall instead of sticking to it.
    const dx = car.x - prevX;
    const dy = car.y - prevY;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) > 0.5) car.x = prevX;
    if (Math.abs(dy) < 0.5 && Math.abs(dx) > 0.5) car.y = prevY;
  }
  car.brakeLights = throttle < 0 || handbrake;
  if (car.hp < car.maxHp * 0.4) car.burning = true;
  return car;
}

export function damageCar(car, amount) {
  if (car.dead) return false;
  car.hp -= amount;
  if (car.hp <= 0) {
    car.hp = 0;
    car.dead = true;
    car.burning = true;
    return true; // destroyed
  }
  return false;
}

export function repairCar(car) {
  car.hp = car.maxHp;
  car.dead = false;
  car.burning = false;
}

// Top-down car with headlights, windshield, neon underglow on sports cars.
export function drawCar(ctx, car, time) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const halfL = car.length / 2;
  const halfW = car.width / 2;

  // Shadow.
  ctx.fillStyle = 'rgba(8, 4, 18, 0.4)';
  ctx.beginPath();
  ctx.ellipse(3, 5, halfL + 2, halfW + 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Neon underglow for the fast cars.
  if (car.type === 'sports' || car.type === 'police') {
    ctx.fillStyle = car.type === 'sports' ? 'rgba(255, 46, 136, 0.28)' : 'rgba(34, 230, 255, 0.22)';
    ctx.beginPath();
    ctx.ellipse(0, 0, halfL + 7, halfW + 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Body.
  ctx.fillStyle = car.color;
  roundRect(ctx, -halfL, -halfW, car.length, car.width, 8);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  roundRect(ctx, -halfL, -halfW, car.length, 7, 6);
  ctx.fill();

  // Police livery.
  if (car.type === 'police') {
    ctx.fillStyle = '#14121f';
    ctx.fillRect(-halfL + 4, -halfW, 16, car.width);
    ctx.fillStyle = '#fff6ec';
    ctx.font = 'bold 9px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NBPD', 2, 3);
    // Flashing light bar.
    const phase = Math.floor(time * 6) % 2 === 0;
    ctx.fillStyle = phase ? '#ff2244' : '#2266ff';
    ctx.fillRect(-6, -halfW - 3, 10, 6);
    ctx.fillStyle = phase ? '#2266ff' : '#ff2244';
    ctx.fillRect(-6, halfW - 3, 10, 6);
    ctx.fillStyle = phase ? 'rgba(255,34,68,0.25)' : 'rgba(34,102,255,0.25)';
    ctx.beginPath();
    ctx.arc(0, 0, 46, 0, Math.PI * 2);
    ctx.fill();
  }

  // Taxi checker stripe.
  if (car.type === 'taxi') {
    ctx.fillStyle = '#14121f';
    for (let i = 0; i < 6; i++) ctx.fillRect(-halfL + 6 + i * 7, -3, 5, 6);
  }

  // Windshield and rear window.
  ctx.fillStyle = 'rgba(16, 20, 38, 0.85)';
  roundRect(ctx, halfL - 18, -halfW + 4, 12, car.width - 8, 3);
  ctx.fill();
  roundRect(ctx, -halfL + 6, -halfW + 4, 9, car.width - 8, 3);
  ctx.fill();

  // Headlights: warm cones ahead.
  ctx.fillStyle = 'rgba(255, 240, 180, 0.9)';
  ctx.fillRect(halfL - 1, -halfW + 3, 3, 5);
  ctx.fillRect(halfL - 1, halfW - 8, 3, 5);
  ctx.fillStyle = 'rgba(255, 240, 180, 0.10)';
  ctx.beginPath();
  ctx.moveTo(halfL, -halfW + 4);
  ctx.lineTo(halfL + 58, -halfW - 6);
  ctx.lineTo(halfL + 58, halfW + 6);
  ctx.lineTo(halfL, halfW - 4);
  ctx.closePath();
  ctx.fill();

  // Taillights.
  ctx.fillStyle = car.brakeLights ? '#ff2233' : 'rgba(255, 60, 60, 0.75)';
  ctx.fillRect(-halfL - 1, -halfW + 3, 3, 5);
  ctx.fillRect(-halfL - 1, halfW - 8, 3, 5);

  // Burning wreck smoke marker.
  if (car.burning && !car.dead) {
    ctx.fillStyle = 'rgba(40, 40, 48, 0.5)';
    ctx.beginPath();
    ctx.arc(-halfL + 8 + Math.sin(time * 9) * 2, -4, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
