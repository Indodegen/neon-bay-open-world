// NEON BAY — police.js
// The 0–5 star wanted system. Heat rises with crimes and decays when no cop
// can see the player; stars drive the response: cruisers pursue from 1 star,
// foot officers join at 2, roadblocks appear at 3, and the police helicopter
// with its searchlight arrives at 4. Cops arrest on touch (busted) and cruisers
// ram the player's car.

import { clamp, dist, angleDiff, randomRange } from './utils.js';
import { WORLD_W, WORLD_H, ROAD_X, ROAD_Y, nearestRoadPoint, collideCircleWithCity } from './city.js';
import { makeCar, CAR_TYPES } from './vehicles.js';

export const STAR_HEAT = [0, 20, 45, 70, 90, 115];

export function starsFromHeat(heat) {
  let s = 0;
  for (let i = 1; i <= 5; i++) if (heat >= STAR_HEAT[i]) s = i;
  return s;
}

export function addHeat(game, amount, reason) {
  const before = game.wantedStars;
  game.heat = clamp(game.heat + amount, 0, 140);
  game.lastCrimeT = game.time;
  game.wantedStars = starsFromHeat(game.heat);
  if (game.wantedStars > before) {
    game.flashMessage('WANTED LEVEL ' + game.wantedStars + ' — ' + reason, '#ff3860');
    if (game.audio) game.audio.sirenBlip();
  }
}

export function makeOfficer(id, x, y) {
  return {
    id, kind: 'officer', x, y, angle: 0, speed: 0,
    health: 60, state: 'chase', stuck: 0, punchCooldown: 0,
    skin: '#c98d5f', shirt: '#1c2f55', pants: '#1c2f55', hat: true,
  };
}

export function makeHeli(id, x, y) {
  return { id, kind: 'heli', x, y, angle: 0, speed: 120, rotor: 0, searchX: x, searchY: y };
}

export function updatePolice(game, dt) {
  const p = game.player;
  const px = p.x;
  const py = p.y;
  const stars = game.wantedStars;

  // Heat decays only when the player is out of sight of every cop —
  // never while a screenshot scene is staged. It also cools slowly during
  // clean driving (no crime for 8s), so a 1-star tail can be shaken and a
  // stolen sedan is not a life sentence.
  let seen = false;
  for (const c of game.cops) if (dist(c.x, c.y, px, py) < 520) { seen = true; break; }
  if (!seen && stars > 0 && !game.shotMode) {
    game.heat -= dt * 2.2;
  } else if (stars > 0 && !game.shotMode && game.time - (game.lastCrimeT || 0) > 8) {
    game.heat -= dt * 0.7;
  }
  if (stars > 0 && game.heat < STAR_HEAT[stars]) {
    const ns = starsFromHeat(game.heat);
    if (ns !== game.wantedStars) {
      game.wantedStars = ns;
      if (ns === 0) {
        game.cops = [];
        game.roadblocks = [];
        game.heli = null;
        game.flashMessage('You lost the cops. Stay clean.', '#7cff00');
      }
    }
  }
  if (stars > 0 && game.heat <= 0) {
    game.heat = 0;
    game.wantedStars = 0;
    game.cops = [];
    game.roadblocks = [];
    game.heli = null;
    game.flashMessage('You lost the cops. Stay clean.', '#7cff00');
  }

  // Desired force scales with stars.
  const wantCruisers = stars >= 1 ? Math.min(1 + stars, 6) : 0;
  const wantOfficers = stars >= 2 ? Math.min(stars - 1, 4) : 0;
  game.spawnTimer -= dt;
  if (game.spawnTimer <= 0) {
    game.spawnTimer = 1.4;
    const cruisers = game.cops.filter((c) => c.kind === 'cruiser' && !c.parked).length;
    const officers = game.cops.filter((c) => c.kind === 'officer').length;
    if (cruisers < wantCruisers) {
      const spot = spawnSpotNear(game, px, py, 650);
      const car = makeCar(9000 + game.nextId++, 'cruiser', spot.x, spot.y, Math.atan2(py - spot.y, px - spot.x), {});
      car.police = true;
      car.kind = 'cruiser';
      game.cops.push(car);
      game.vehicles.push(car);
      if (game.audio) game.audio.sirenBlip();
    } else if (officers < wantOfficers) {
      const spot = spawnSpotNear(game, px, py, 420);
      game.cops.push(makeOfficer(9100 + game.nextId++, spot.x, spot.y));
    }
    // Roadblocks at 3+ stars: two cruisers across the road ahead.
    if (stars >= 3 && game.roadblocks.length < 2) {
      const ahead = roadblockSpot(game, px, py);
      if (ahead) {
        const c1 = makeCar(9300 + game.nextId++, 'cruiser', ahead.x - 30, ahead.y, ahead.angle + Math.PI / 2, {});
        const c2 = makeCar(9301 + game.nextId++, 'cruiser', ahead.x + 30, ahead.y, ahead.angle + Math.PI / 2, {});
        c1.kind = 'cruiser'; c2.kind = 'cruiser';
        c1.parked = true; c2.parked = true;
        c1.police = true; c2.police = true;
        game.roadblocks.push(c1, c2);
        game.vehicles.push(c1, c2);
        game.cops.push(c1, c2);
        game.flashMessage('ROADBLOCK AHEAD', '#ffe600');
      }
    }
    // Helicopter at 4+ stars.
    if (stars >= 4 && !game.heli) {
      game.heli = makeHeli(9500, px - 200, py - 300);
      game.flashMessage('POLICE HELICOPTER OVERHEAD', '#ff3860');
    }
    if (stars < 4) game.heli = null;
  }

  // Cruiser pursuit: steer toward the player, ram at speed.
  for (const cop of game.cops) {
    if (cop.kind !== 'cruiser' || cop.dead || cop.parked) continue;
    // Cruiser pursuit: steer toward an intercept point ahead of the
    // player, so cruisers cut the player off instead of pinballing them.
    const t = CAR_TYPES.cruiser;
    const lead = 0.45;
    const tx = px + (game.playerCar ? Math.cos(game.playerCar.angle) * game.playerCar.speed * lead : 0);
    const ty = py + (game.playerCar ? Math.sin(game.playerCar.angle) * game.playerCar.speed * lead : 0);
    const want = Math.atan2(ty - cop.y, tx - cop.x);
    const diff = angleDiff(cop.angle, want);
    cop.angle += clamp(diff, -2.8 * dt, 2.8 * dt);
    // One star is a tail, not a death squad: cruisers cruise at 72% until
    // the heat climbs, so a stolen sedan can actually break away.
    const aggression = stars <= 1 ? 0.72 : 0.92;
    const targetSpeed = dist(cop.x, cop.y, px, py) > 160 ? t.topSpeed * aggression : 140;
    cop.speed += clamp(targetSpeed - cop.speed, -300 * dt, 320 * dt);
    cop.sirenPhase += dt * 6;
    const nx = cop.x + Math.cos(cop.angle) * cop.speed * dt;
    const ny = cop.y + Math.sin(cop.angle) * cop.speed * dt;
    const fixed = collideCircleWithCity(game.city, nx, ny, 24);
    cop.x = fixed.x;
    cop.y = fixed.y;
    // Ram the player's car — one solid hit per second, not a damage hose,
    // and a light tap, not a shove into the nearest wall. Only a fast
    // cruiser landing a real ram moves the player's car at all.
    cop.ramCooldown = Math.max(0, (cop.ramCooldown || 0) - dt);
    const pc = game.playerCar;
    if (pc && !pc.dead && dist(cop.x, cop.y, pc.x, pc.y) < 52 && Math.abs(cop.speed) > 200) {
      const push = 18 * dt;
      pc.x += Math.cos(cop.angle) * push;
      pc.y += Math.sin(cop.angle) * push;
      if (Math.abs(cop.speed) > 200 && cop.ramCooldown <= 0) {
        cop.ramCooldown = 1.0;
        game.damagePlayerCar(4);
        cop.speed *= 0.4;
      }
    }
    // Busted on foot: a cruiser stopping beside the player arrests them.
    if (!pc && dist(cop.x, cop.y, px, py) < 40 && Math.abs(cop.speed) < 60) {
      game.busted('NBPD cruiser pulled up beside you');
    }
  }

  // Foot officers chase and arrest on touch.
  for (const cop of game.cops) {
    if (cop.kind !== 'officer') continue;
    cop.punchCooldown -= dt;
    const d = dist(cop.x, cop.y, px, py);
    const want = Math.atan2(py - cop.y, px - cop.x);
    const diff = angleDiff(cop.angle, want);
    cop.angle += clamp(diff, -4 * dt, 4 * dt);
    const spd = d > 300 ? 175 : 150;
    const nx = cop.x + Math.cos(cop.angle) * spd * dt;
    const ny = cop.y + Math.sin(cop.angle) * spd * dt;
    const fixed = collideCircleWithCity(game.city, nx, ny, 12);
    cop.x = fixed.x;
    cop.y = fixed.y;
    if (d < 34 && !game.playerCar) {
      game.busted('An NBPD officer cuffed you');
    } else if (d < 44 && cop.punchCooldown <= 0 && game.playerCar) {
      cop.punchCooldown = 1.2;
      game.damagePlayerCar(8);
    }
  }

  // Helicopter shadows the player with a searchlight.
  if (game.heli) {
    const h = game.heli;
    h.rotor += dt * 22;
    const want = Math.atan2(py - h.y, px - h.x);
    const diff = angleDiff(h.angle, want);
    h.angle += clamp(diff, -1.4 * dt, 1.4 * dt);
    h.x += Math.cos(h.angle) * h.speed * dt;
    h.y += Math.sin(h.angle) * h.speed * dt;
    h.searchX = px;
    h.searchY = py;
  }
}

function spawnSpotNear(game, px, py, range) {
  for (let tries = 0; tries < 12; tries++) {
    const a = Math.random() * Math.PI * 2;
    const r = randomRange(Math.random, range * 0.6, range);
    const x = clamp(px + Math.cos(a) * r, 120, WORLD_W - 120);
    const y = clamp(py + Math.sin(a) * r, 120, WORLD_H - 120);
    const near = nearestRoadPoint(x, y);
    if (dist(x, y, near.x, near.y) < 320) return { x: near.x, y: near.y };
  }
  const near = nearestRoadPoint(px, py);
  return { x: near.x + 300, y: near.y };
}

function roadblockSpot(game, px, py) {
  // Pick an intersection ahead of the player's heading.
  const pc = game.playerCar;
  const heading = pc ? pc.angle : game.player.angle;
  const ax = px + Math.cos(heading) * 520;
  const ay = py + Math.sin(heading) * 520;
  const near = nearestRoadPoint(ax, ay);
  if (dist(near.x, near.y, px, py) < 240) return null;
  return { x: near.x, y: near.y, angle: heading };
}
