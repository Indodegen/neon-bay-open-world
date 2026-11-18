// Staged screenshots: each scene sets the real game state (time of day,
// weather, wanted level, mission, cars) and then plays the real simulation
// forward with a simple autopilot, so the frame is genuine gameplay from a
// fixed seed — the same URL always gives the same frame.
import { angleDelta, distance2D } from './utils.js';
import { showDialog } from './hud.js';

const STEP = 1 / 60;

/** Keys an autopilot holds to drive a car toward (tx, tz). */
function autopilotKeys(game, tx, tz) {
  const car = game.car;
  const keys = new Set(['KeyW']);
  if (!car) return keys;
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const rx = Math.cos(car.heading);
  const rz = -Math.sin(car.heading);
  // Steer around any car sitting in our lane ahead.
  let blockedSide = 0;
  for (const v of game.vehicles) {
    if (v === car || v.dead) continue;
    const dx = v.x - car.x;
    const dz = v.z - car.z;
    const along = dx * fx + dz * fz;
    const lat = dx * rx + dz * rz;
    if (along > 0 && along < 17 && Math.abs(lat) < 3.6) {
      blockedSide = lat >= 0 ? -1 : 1;
      break;
    }
  }
  if (blockedSide !== 0) {
    keys.add(blockedSide < 0 ? 'KeyA' : 'KeyD');
    return keys;
  }
  const bearing = Math.atan2(tx - car.x, tz - car.z);
  const turn = angleDelta(car.heading, bearing);
  if (turn > 0.12) keys.add('KeyA');
  else if (turn < -0.12) keys.add('KeyD');
  return keys;
}

function driveFor(game, seconds, tx, tz) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    game.input.keys.clear();
    for (const k of autopilotKeys(game, tx, tz)) game.input.keys.add(k);
    game.step(STEP);
  }
  game.input.keys.clear();
}

function stepFor(game, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) game.step(STEP);
}

function walkFor(game, seconds, keys) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    game.input.keys.clear();
    for (const k of keys) game.input.keys.add(k);
    game.step(STEP);
  }
  game.input.keys.clear();
}

function cinematic(game, eye, focus) {
  game.cameraMode = 'cinematic';
  game.cinematicEye = eye;
  game.cinematicFocus = focus;
  game.renderFrame();
}

/**
 * Chase camera for a staged shot: behind the focus point, offset to the side
 * so the vehicle reads large, looking ahead down the road it travels.
 */
function chaseCam(game, focus, dist, side, height, lookAhead) {
  const fx = Math.sin(focus.heading);
  const fz = Math.cos(focus.heading);
  const rx = Math.cos(focus.heading);
  const rz = -Math.sin(focus.heading);
  cinematic(game,
    {
      x: focus.x - fx * dist + rx * side,
      y: height,
      z: focus.z - fz * dist + rz * side,
    },
    {
      x: focus.x + fx * lookAhead,
      y: 2.2,
      z: focus.z + fz * lookAhead,
    });
}

/** Stage one named scene and leave the game rendered on it. */
export function stageShot(name, game) {
  game.resetWorld();
  game.hideTitle();
  if (name === 'night') {
    // Neon night shootout in the rain: armed on foot, CBPD closing in,
    // muzzle flash and tracer frozen in the frame.
    game.setTimeOfDay(22.3);
    game.setWeather('rain');
    game.teleportPlayer(8.5, 52, Math.PI);
    // Clear the crowd right around the hero so the frame stays readable.
    for (const p of [...game.peds]) {
      if (distance2D(p.x, p.z, game.player.x, game.player.z) < 10) {
        game.scene.remove(p.group);
        game.peds.splice(game.peds.indexOf(p), 1);
      }
    }
    game.player.cameraYaw = Math.PI;
    game.player.armed = true;
    game.player.ammo = 12;
    game.setWantedLevel(3);
    stepFor(game, 4.0);
    showDialog(game.hud, 'mara', 'Chief Mara — CBPD', 'All units, armed suspect on Ocean Drive. Move in, weapons free.', 120000);
    game.firePistol();
    chaseCam(game, game.player, 9, 2, 3.4, 14);
    return { screen: 'play', label: 'neon night shootout in the rain' };
  }
  if (name === 'garage') {
    // Mako Garage at night: the Comet on the floor, neon outside, the
    // upgrade menu open with prices.
    game.setTimeOfDay(21.0);
    game.setWeather('clear');
    const car = game.spawnPlayerCar('sports', -90, 46, Math.PI);
    car.health = 250;
    car.maxHealth = 250;
    game.enterCar(car);
    game.cash = 5200;
    game.openGarageScreen();
    chaseCam(game, game.car, 7.5, 3, 2.8, 10);
    return { screen: 'garage', label: 'garage upgrades at night' };
  }
  if (name === 'map') {
    // Golden hour, the full map open: story list, stats, legend, completion.
    game.setTimeOfDay(17.6);
    game.setWeather('clear');
    game.missions.completed = ['errand', 'hotwheels', 'payday'];
    game.missions.nextIndex = 3;
    game.missions.stashesFound = 3;
    game.missions.propertiesOwned = ['garage'];
    game.cash = 8450;
    game.cashEarned = 2900;
    game.stats.distanceDriven = 8400;
    game.stats.carsStolen = 2;
    game.stats.shotsFired = 18;
    game.stats.shotsHit = 11;
    game.stats.nearMisses = 6;
    game.playSeconds = 2400;
    game.bestWanted = 3;
    game.startMissionIndex(3);
    const car = game.spawnPlayerCar('sedan', -40, 0, Math.PI / 2);
    game.enterCar(car);
    driveFor(game, 3.0, 120, 0);
    game.openMapScreen();
    cinematic(game,
      { x: -60, y: 60, z: -100 },
      { x: 60, y: 4, z: 20 });
    return { screen: 'map', label: 'full map screen at golden hour' };
  }
  // Default: 'cover' — golden-hour chase down Ocean Drive INTO the sunset,
  // mission 1 running, 4 stars, helicopter overhead, cruisers behind.
  game.setTimeOfDay(17.5);
  game.setWeather('clear');
  const car = game.spawnPlayerCar('sports', -100, 0, Math.PI / 2);
  car.health = 250;
  car.maxHealth = 250;
  game.enterCar(car);
  game.startMissionIndex(0);
  driveFor(game, 3.0, 180, 0);
  game.setWantedLevel(4);
  // Two cruisers staged just behind the hero so the chase reads in frame,
  // and one head-on in the opposite lane ahead.
  game.stageCop(game.car.x - 24, -2.5, Math.PI / 2);
  game.stageCop(game.car.x - 32, 2.5, Math.PI / 2);
  driveFor(game, 3.0, 180, 0);
  game.stageCop(game.car.x + 25, -2.5, -Math.PI / 2);
  chaseCam(game, game.car || game.player, 8, 1.2, 3.0, 22);
  return { screen: 'play', label: 'dusk chase with wanted stars' };
}

export const SHOT_NAMES = ['cover', 'night', 'garage', 'map'];
