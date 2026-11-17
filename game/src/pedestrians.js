// NEON BAY — pedestrians.js
// Pedestrians with varied behaviour: strollers, joggers, phone-starers,
// window shoppers and panickers who flee gunshots and explosions. They walk
// the sidewalks, cross at intersections, and react to the player — a living
// city, not decoration. Hitting one is a crime the police notice.

import { clamp, dist, mulberry32, pickRandom, randomRange } from './utils.js';
import { ROAD_X, ROAD_Y, ROAD_W, WORLD_H, collideCircleWithCity } from './city.js';

const SKINS = ['#f2c79b', '#c98d5f', '#8a5a3b', '#f2d8b0', '#a06a42'];
const SHIRTS = ['#ff5a5a', '#4f9ac9', '#7ac94f', '#ffe600', '#b967ff', '#ff6a00', '#e8e8e8', '#222831', '#00e5ff', '#ff2e88'];
const PANTS = ['#222831', '#3a4a6b', '#6b5a3a', '#4a5540', '#c9c9c9'];

export function makePed(id, rng, city) {
  const onH = rng() < 0.5;
  let x, y;
  if (onH) {
    const ry = ROAD_Y[Math.floor(rng() * ROAD_Y.length)];
    y = ry + (rng() < 0.5 ? -ROAD_W / 2 - 16 : ROAD_W / 2 + 16);
    x = randomRange(rng, 200, 3800);
  } else {
    const rx = ROAD_X[Math.floor(rng() * ROAD_X.length)];
    x = rx + (rng() < 0.5 ? -ROAD_W / 2 - 16 : ROAD_W / 2 + 16);
    y = randomRange(rng, 200, 3000);
  }
  const behavior = pickRandom(rng, ['stroll', 'stroll', 'stroll', 'jog', 'phone', 'shop', 'stroll']);
  return {
    id, x, y, angle: rng() * Math.PI * 2,
    speed: behavior === 'jog' ? randomRange(rng, 95, 130) : randomRange(rng, 34, 62),
    behavior, state: 'walk', panic: 0, down: false, downTimer: 0,
    skin: pickRandom(rng, SKINS), shirt: pickRandom(rng, SHIRTS), pants: pickRandom(rng, PANTS),
    bobPhase: rng() * Math.PI * 2, idleTimer: randomRange(rng, 0, 6),
    targetX: x, targetY: y,
  };
}

export function spawnPedestrians(city, rng, count) {
  const peds = [];
  for (let i = 0; i < count; i++) peds.push(makePed(5000 + i, rng, city));
  return peds;
}

export function scarePeds(peds, x, y, radius) {
  for (const p of peds) {
    if (p.down) continue;
    if (dist(p.x, p.y, x, y) < radius) {
      p.state = 'panic';
      p.panic = 2.5;
      p.angle = Math.atan2(p.y - y, p.x - x);
    }
  }
}

export function updatePed(p, dt, city, danger) {
  if (p.down) {
    p.downTimer -= dt;
    if (p.downTimer <= 0) {
      p.down = false;
      p.state = 'panic';
      p.panic = 2;
    }
    return;
  }
  if (p.panic > 0) {
    p.panic -= dt;
    p.state = p.panic > 0 ? 'panic' : 'walk';
  }
  let speed = p.speed;
  if (p.state === 'panic') speed = p.speed * 2.4;
  if (p.behavior === 'phone' && p.state === 'walk') {
    p.idleTimer -= dt;
    if (p.idleTimer > 0) return; // standing still, staring at the phone
    if (p.idleTimer < -8) p.idleTimer = randomRange(Math.random, 2, 6);
  }
  if (p.behavior === 'shop' && p.state === 'walk') {
    p.idleTimer -= dt;
    if (p.idleTimer > 0) return; // window shopping
    if (p.idleTimer < -10) p.idleTimer = randomRange(Math.random, 3, 7);
  }
  // Wander: pick a new sidewalk target when close to the old one.
  if (dist(p.x, p.y, p.targetX, p.targetY) < 24 || p.state === 'panic') {
    if (p.state === 'panic') {
      p.targetX = p.x + Math.cos(p.angle) * 300;
      p.targetY = p.y + Math.sin(p.angle) * 300;
    } else {
      const onH = Math.random() < 0.5;
      if (onH) {
        const ry = ROAD_Y[Math.floor(Math.random() * ROAD_Y.length)];
        p.targetY = ry + (Math.random() < 0.5 ? -ROAD_W / 2 - 16 : ROAD_W / 2 + 16);
        p.targetX = clamp(p.x + randomRange(Math.random, -500, 500), 150, 3850);
      } else {
        const rx = ROAD_X[Math.floor(Math.random() * ROAD_X.length)];
        p.targetX = rx + (Math.random() < 0.5 ? -ROAD_W / 2 - 16 : ROAD_W / 2 + 16);
        p.targetY = clamp(p.y + randomRange(Math.random, -500, 500), 150, WORLD_H - 150);
      }
    }
  }
  const want = Math.atan2(p.targetY - p.y, p.targetX - p.x);
  let diff = want - p.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  p.angle += clamp(diff, -3.2 * dt, 3.2 * dt);
  const nx = p.x + Math.cos(p.angle) * speed * dt;
  const ny = p.y + Math.sin(p.angle) * speed * dt;
  const fixed = collideCircleWithCity(city, nx, ny, 10);
  p.x = fixed.x;
  p.y = fixed.y;
  p.bobPhase += dt * (speed / 9);
}

export function knockPedDown(p, fromX, fromY) {
  if (p.down) return;
  p.down = true;
  p.downTimer = 2.2;
  p.angle = Math.atan2(p.y - fromY, p.x - fromX);
}
