// shots.js — Staged scenes for the four screenshots. Each one puts the game
// in a complete, busy state straight from the URL (?shot=cover / foot /
// chase / mission) with no clicks: the player, traffic, police, pedestrians
// and a live mission are all placed by hand, so every shot is dense.
import { createCar } from './vehicles.js';
import { Rng } from './random.js';

function clearStreets(game) {
  game.traffic.cars = [];
  game.traffic.parked = [];
  game.traffic.playerCar = null;
  game.police.cars = [];
  game.police.officers = [];
  game.police.roadblocks = [];
  game.police.heli = null;
  game.police.wanted = 0;
  game.pedestrians.list = [];
  game.combat.bullets = [];
  game.combat.particles = [];
  game.messages = [];
  game.skidMarks = [];
}

function putPlayerInCar(game, type, x, y, angle, speed, color) {
  const rng = new Rng(99);
  const car = createCar(type, x, y, angle, rng);
  if (color) car.color = color;
  car.driver = 'player';
  car.speed = speed;
  car.parked = false;
  game.traffic.playerCar = car;
  game.player.inCar = true;
  game.player.car = car;
  game.player.x = x;
  game.player.y = y;
  game.player.angle = angle;
  return car;
}

function putTraffic(game, placements) {
  const rng = new Rng(1234);
  for (const p of placements) {
    const car = createCar(p.type || 'sedan', p.x, p.y, p.angle, rng);
    car.driver = 'traffic';
    car.speed = p.speed || 0;
    car.cruiseSpeed = 200;
    car.targetAngle = p.angle;
    car.nextTurnIn = 600;
    car.parked = false;
    game.traffic.cars.push(car);
  }
}

function putParked(game, placements) {
  const rng = new Rng(555);
  for (const p of placements) {
    const car = createCar(p.type || 'sedan', p.x, p.y, p.angle, rng);
    car.parked = true;
    game.traffic.parked.push(car);
  }
}

function putCruisers(game, placements) {
  const rng = new Rng(777);
  const lanes = [-26, 0, 26, -13, 13];
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i];
    const car = createCar('police', p.x, p.y, p.angle, rng);
    car.driver = 'police';
    car.speed = p.speed || 320;
    car.cruiseSpeed = 480;
    car.targetAngle = p.angle;
    car.pursuitLane = lanes[i % lanes.length];
    car.ramCooldown = 0;
    game.police.cars.push(car);
  }
}

function putPedestrians(game, placements) {
  for (const p of placements) {
    game.pedestrians.list.push({
      x: p.x, y: p.y, angle: p.angle || 0, speed: 55, hp: 30,
      shirt: p.shirt || '#ff6b81', skin: '#f1c27d', state: 'walk',
      fleeX: 0, fleeY: 0, fleeTimer: 0, targetX: p.x + 120, targetY: p.y,
      walkPhase: Math.random() * 6, retargetIn: 5, down: false,
    });
  }
}

function stageCommon(game) {
  game.state = 'playing';
  game.playStartedAt = -100; // hide the controls hint
  game.camera.snapTo(game.player.x, game.player.y);
  game.camera.zoom = game.player.inCar ? 0.82 : 1.0;
  game.briefingMission = null;
  game.jobDone = null;
  game.storyDoneShown = false;
}

// Cover: the Coral Heist escape — a sunset chase down Marlin Avenue with
// four stars, the helicopter overhead, traffic ahead and the island ahead.
function stageCover(game) {
  clearStreets(game);
  game.cash = 2450;
  // Southbound lane of Marlin Avenue, heading for the bridge.
  putPlayerInCar(game, 'sports', 1578, 980, Math.PI / 2, 400, '#ff2e88');
  putTraffic(game, [
    { type: 'sedan', x: 1578, y: 700, angle: Math.PI / 2, speed: 200 },
    { type: 'taxi', x: 1622, y: 560, angle: Math.PI / 2, speed: 180 },
    { type: 'van', x: 1622, y: 820, angle: -Math.PI / 2, speed: 160 },
    { type: 'sedan', x: 1200, y: 1100, angle: 0, speed: 190 },
    { type: 'truck', x: 2000, y: 1100, angle: Math.PI, speed: 150 },
    { type: 'sports', x: 2000, y: 760, angle: Math.PI / 2, speed: 260 },
  ]);
  putParked(game, [
    { type: 'sedan', x: 1564, y: 1240, angle: Math.PI / 2 },
    { type: 'van', x: 1640, y: 1300, angle: -Math.PI / 2 },
  ]);
  game.police.setWanted(4);
  // Cruisers staggered behind, fanned across the avenue, close enough to read.
  putCruisers(game, [
    { x: 1552, y: 1220, angle: Math.PI / 2, speed: 380 },
    { x: 1604, y: 1340, angle: Math.PI / 2, speed: 360 },
    { x: 1578, y: 1470, angle: Math.PI / 2, speed: 340 },
    { x: 1626, y: 1600, angle: Math.PI / 2, speed: 330 },
  ]);
  game.police.heli = { x: 1760, y: 820, angle: Math.PI / 2, rotor: 1.2 };
  putPedestrians(game, [
    { x: 1470, y: 900, shirt: '#4ecdc4' },
    { x: 1740, y: 1050, shirt: '#ffe66d' },
    { x: 1480, y: 1240, shirt: '#a78bfa' },
    { x: 1730, y: 800, shirt: '#ff9f43' },
  ]);
  game.missions.start(4, game);
  game.missions.advance(game);
  game.missions.advance(game); // escape step: wanted 4, safehouse target
  stageCommon(game);
}

// On foot: the Night Shift taxi pickup, pedestrians and parked cars around
// a downtown corner, mission marker overhead.
function stageFoot(game) {
  clearStreets(game);
  game.cash = 650;
  game.player.inCar = false;
  game.player.car = null;
  game.player.x = 900;
  game.player.y = 760;
  game.player.angle = -Math.PI / 2;
  game.player.aimAngle = -Math.PI / 2;
  game.player.health = 100;
  game.player.armor = 40;
  putParked(game, [
    { type: 'taxi', x: 864, y: 640, angle: 0 },
    { type: 'sedan', x: 936, y: 860, angle: Math.PI },
    { type: 'sports', x: 1064, y: 700, angle: Math.PI / 2 },
    { type: 'van', x: 764, y: 900, angle: -Math.PI / 2 },
  ]);
  putTraffic(game, [
    { type: 'sedan', x: 700, y: 700, angle: 0, speed: 200 },
    { type: 'truck', x: 1100, y: 1100, angle: Math.PI, speed: 150 },
    { type: 'sedan', x: 1200, y: 700, angle: 0, speed: 220 },
  ]);
  putPedestrians(game, [
    { x: 860, y: 720, shirt: '#ff6b81' },
    { x: 940, y: 690, shirt: '#4ecdc4' },
    { x: 880, y: 820, shirt: '#ffe66d' },
    { x: 1020, y: 760, shirt: '#a78bfa' },
    { x: 780, y: 700, shirt: '#ff9f43' },
    { x: 960, y: 830, shirt: '#54a0ff' },
    { x: 840, y: 660, shirt: '#fd79a8' },
    { x: 1000, y: 700, shirt: '#00cec9' },
  ]);
  game.missions.start(2, game); // Night Shift, first pickup at 900,700
  stageCommon(game);
}

// Chase: five stars, the helicopter, a roadblock ahead, a smoking car.
function stageChase(game) {
  clearStreets(game);
  game.cash = 3800;
  // Eastbound lane of 5th Avenue, foot down.
  const myCar = putPlayerInCar(game, 'sports', 2000, 1478, 0, 480, '#22e6ff');
  myCar.hp = 52;
  myCar.burning = true;
  putTraffic(game, [
    { type: 'sedan', x: 2300, y: 1478, angle: 0, speed: 200 },
    { type: 'van', x: 2400, y: 1522, angle: Math.PI, speed: 170 },
    { type: 'taxi', x: 1700, y: 1478, angle: 0, speed: 190 },
    { type: 'truck', x: 2000, y: 1900, angle: -Math.PI / 2, speed: 150 },
  ]);
  game.police.setWanted(5);
  // Pursuit fanned out behind and to the sides, none on top of the player.
  putCruisers(game, [
    { x: 1720, y: 1478, angle: 0, speed: 460 },
    { x: 1620, y: 1522, angle: 0, speed: 440 },
    { x: 1830, y: 1430, angle: 0, speed: 470 },
    { x: 1500, y: 1478, angle: 0, speed: 430 },
    { x: 2100, y: 1700, angle: -Math.PI / 2, speed: 420 },
  ]);
  game.police.heli = { x: 2200, y: 1280, angle: 0, rotor: 2.4 };
  game.police.spawnRoadblock(game.player);
  putPedestrians(game, [
    { x: 1900, y: 1400, shirt: '#ff6b81' },
    { x: 2200, y: 1600, shirt: '#4ecdc4' },
    { x: 2050, y: 1380, shirt: '#ffe66d' },
  ]);
  game.missions.start(4, game);
  game.missions.advance(game);
  game.missions.advance(game);
  // The heist escape sets 4 stars; this scene is a five-star chase.
  game.police.setWanted(5);
  game.skidMarks.push(
    { x1: 1500, y1: 1490, x2: 1950, y2: 1490, life: 10, maxLife: 12 },
    { x1: 1500, y1: 1512, x2: 1950, y2: 1512, life: 10, maxLife: 12 },
  );
  stageCommon(game);
}

// Mission: the Sunset Courier timed delivery, racing across the Coral Bridge
// toward the island with 47 seconds on the clock.
function stageMission(game) {
  clearStreets(game);
  game.cash = 1050;
  // Southbound lane of the Coral Bridge, racing for the island.
  putPlayerInCar(game, 'sports', 1578, 2220, Math.PI / 2, 330, '#ffd319');
  putTraffic(game, [
    { type: 'sedan', x: 1578, y: 1980, angle: Math.PI / 2, speed: 190 },
    { type: 'van', x: 1622, y: 2080, angle: -Math.PI / 2, speed: 150 },
    { type: 'taxi', x: 1200, y: 2300, angle: 0, speed: 200 },
    { type: 'sedan', x: 2000, y: 1900, angle: Math.PI, speed: 180 },
  ]);
  putPedestrians(game, [
    { x: 1500, y: 2500, shirt: '#ff6b81' },
    { x: 1700, y: 2490, shirt: '#4ecdc4' },
    { x: 1560, y: 2440, shirt: '#ffe66d' },
    { x: 1420, y: 2320, shirt: '#a78bfa' },
  ]);
  game.missions.start(1, game);
  game.missions.advance(game); // timed delivery step
  game.missions.stepTimer = 47;
  stageCommon(game);
}

export function applyShotMode(game, mode) {
  if (mode === 'cover') stageCover(game);
  else if (mode === 'foot') stageFoot(game);
  else if (mode === 'chase') stageChase(game);
  else if (mode === 'mission') stageMission(game);
  else return false;
  game.shotMode = mode;
  return true;
}
