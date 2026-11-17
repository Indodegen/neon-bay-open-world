// NEON BAY — main.js
// Boot, game state and the main loop. NEON BAY is an original open-world
// crime game: explore Neon Bay on foot and by car, steal vehicles, run eight
// story missions for the fixer Vera Solano, and outrun the NBPD's 0–5 star
// wanted system — with traffic, pedestrians, a day/night cycle, rain, a live
// minimap, synthesized sound and a save that survives reloads.

import { generateCity, WORLD_W, WORLD_H, collideCircleWithCity, nearestRoadPoint, circleHitsBuilding, isOnRoad } from './city.js';
import { NeonAudio } from './audio.js';
import { NeonInput } from './input.js';
import { makePlayer, updatePlayerOnFoot, updateBullets, tryEnterCar, exitCar, hurtPlayer, checkCarPedCollisions } from './player.js';
import { makeCar, spawnTrafficCars, spawnParkedCars, driveCar, collideCarWithWorld, updateTrafficCar, damageCar, carNearMiss } from './vehicles.js';
import { spawnPedestrians, updatePed, scarePeds, knockPedDown } from './pedestrians.js';
import { updatePolice, addHeat, starsFromHeat } from './police.js';
import { MISSIONS, missionByIndex, startMissionState, updateMission } from './missions.js';
import { renderWorld, daylightFactor } from './render.js';
import { drawHUD, drawTitleScreen, drawPauseScreen, drawBustedScreen, drawWastedScreen, drawBriefingScreen, drawMissionCompleteScreen } from './hud.js';
import { writeSave, readSave, hasSave } from './save.js';
import { applyShotPreset } from './shots.js';
import { clamp, dist, mulberry32, formatCash } from './utils.js';

const SEED = 7;

export class NeonBayGame {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = new NeonInput(canvas);
    this.audio = new NeonAudio();
    this.city = generateCity(SEED);
    this.rng = mulberry32(SEED);
    this.state = 'title'; // title | briefing | playing | paused | busted | wasted | complete
    this.started = false;
    this.time = 0;
    this.timeOfDay = 17.2;
    this.rain = 0;
    this.rainTarget = 0;
    this.money = 250;
    this.totalEarned = 0;
    this.carsStolen = 0;
    this.nextId = 1;
    this.player = makePlayer(1500, 1330);
    this.playerCar = null;
    this.vehicles = [];
    this.peds = [];
    this.cops = [];
    this.roadblocks = [];
    this.heli = null;
    this.bullets = [];
    this.particles = [];
    this.sparks = [];
    this.pickups = [];
    for (let i = 0; i < 8; i++) this.pickups.push(this.spawnPickup());
    this.rainDrops = [];
    this.heat = 0;
    this.wantedStars = 0;
    this.spawnTimer = 1;
    this.mission = null;
    this.missionIndex = 0;
    this.missionStage = 0;
    this.missionActive = false;
    this.missionTarget = null;
    this.completedMissions = [];
    this.lastCompleted = null;
    this.nextMissionTitle = '';
    this.toast = '';
    this.toastColor = '#ffffff';
    this.toastT = 0;
    this.hintText = '';
    this.hintT = 0;
    this.damageFlash = 0;
    this.crashCooldown = 0;
    this.endReason = '';
    this.lastFine = 0;
    this.saveNotice = '';
    this.hasSaveData = hasSave();
    this.shotMode = null;
    this.shotRain = 0;
    this.shotTime = 17.2;
    this.aiming = false;
    this.muzzleFx = null;
    this.punchFx = null;
    this.lightCanvas = null;
    this.camera = { x: this.player.x, y: this.player.y, zoom: 1 };
    this.buttons = [];
    this.nearMissCooldown = {};
    this.trafficRng = mulberry32(SEED + 101);
    this.pedRng = mulberry32(SEED + 202);
    this.width = 1280;
    this.height = 800;

    this.vehicles.push(...spawnTrafficCars(this.city, this.trafficRng, 14));
    this.vehicles.push(...spawnParkedCars(this.city, this.trafficRng, 12));
    this.peds = spawnPedestrians(this.city, this.pedRng, 26);
    for (let i = 0; i < 90; i++) {
      this.rainDrops.push({ x: Math.random() * 1280, y: Math.random() * 800, splash: 0 });
    }
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  renderWorld(ctx, w, h, backdrop) {
    renderWorld(this, ctx, w, h, backdrop);
  }

  spawnPickup() {
    // Street cash on a sidewalk corner: free-roam income between missions.
    const rx = [300, 900, 1500, 2100, 2700, 3300, 3900][Math.floor(this.rng() * 7)];
    const ry = [300, 800, 1300, 1800, 2300, 2800][Math.floor(this.rng() * 6)];
    return {
      x: rx + (this.rng() < 0.5 ? -70 : 70) + this.rng() * 40 - 20,
      y: ry + (this.rng() < 0.5 ? -70 : 70) + this.rng() * 40 - 20,
      value: 50,
    };
  }

  pedsFleeFastCars(dt) {
    // Pedestrians dive out of the way of a fast car bearing down on them,
    // so a chase down a busy street does not become a hit-and-run spree.
    for (const car of this.vehicles) {
      if (car.dead || Math.abs(car.speed) < 180) continue;
      const cx = Math.cos(car.angle);
      const cy = Math.sin(car.angle);
      for (const p of this.peds) {
        if (p.down || p.state === 'panic') continue;
        const dx = p.x - car.x;
        const dy = p.y - car.y;
        const d = Math.hypot(dx, dy);
        // Flee any fast car close by, not just one coming head-on: a car
        // shoved sideways into the sidewalk is just as deadly.
        if (d < 100) {
          p.state = 'panic';
          p.panic = 1.6;
          p.angle = Math.atan2(dy, dx);
        }
      }
    }
  }

  collectPickups() {
    const p = this.player;
    for (let i = 0; i < this.pickups.length; i++) {
      const pk = this.pickups[i];
      if (Math.hypot(p.x - pk.x, p.y - pk.y) < 36) {
        this.money += pk.value;
        this.totalEarned += pk.value;
        this.flashMessage('STREET CASH  +$' + pk.value, '#7cff00');
        if (this.audio) this.audio.pickup();
        this.pickups[i] = this.spawnPickup();
      }
    }
  }

  mouseWorld() {
    const cam = this.camera;
    return {
      x: (this.input.mouseX - this.width / 2) / cam.zoom + cam.x,
      y: (this.input.mouseY - this.height / 2) / cam.zoom + cam.y,
    };
  }

  cameraSnap() {
    this.camera.x = this.player.x;
    this.camera.y = this.player.y;
    this.camera.zoom = this.playerCar ? 0.82 : 1;
  }

  weatherLabel() {
    if (this.rain > 0.6) return 'Heavy rain';
    if (this.rain > 0.25) return 'Light rain';
    const day = daylightFactor(this.timeOfDay);
    if (day > 0.9) return 'Sunny';
    if (day > 0.4) return 'Golden hour';
    return 'Night';
  }

  flashMessage(text, color) {
    this.toast = text;
    this.toastColor = color || '#ffffff';
    this.toastT = 3.2;
  }

  hint(text, seconds) {
    this.hintText = text;
    this.hintT = seconds || 3;
  }

  flashDamage() {
    this.damageFlash = 1;
  }

  scareNearby(x, y, radius) {
    scarePeds(this.peds, x, y, radius);
  }

  knockPed(ped) {
    knockPedDown(ped, this.player.x, this.player.y);
  }

  // ---- Test / staging helpers (also used by shots.js) ----
  placePlayerOnFoot(x, y, angle) {
    this.playerCar = null;
    this.player.x = x;
    this.player.y = y;
    this.player.angle = angle || 0;
    this.player.health = 100;
  }

  placePlayerInCar(type, x, y, angle) {
    const car = makeCar(8000 + this.nextId++, type, x, y, angle, {});
    // Never stage a car inside a building: nudge it onto the nearest road.
    if (circleHitsBuilding(this.city, x, y, car.len / 2)) {
      const near = nearestRoadPoint(x, y);
      car.x = near.x;
      car.y = near.y;
      x = near.x;
      y = near.y;
    }
    car.driver = 'player';
    this.vehicles.push(car);
    this.playerCar = car;
    this.player.x = x;
    this.player.y = y;
    this.player.angle = angle;
    return car;
  }

  setWanted(stars) {
    this.heat = [0, 20, 45, 70, 90, 115][stars] || 0;
    this.wantedStars = stars;
    this.spawnTimer = 0;
  }

  spawnCruiserBehind(count) {
    const px = this.player.x;
    const py = this.player.y;
    for (let i = 0; i < count; i++) {
      const car = makeCar(9000 + this.nextId++, 'cruiser', px - 520 - i * 150, py + 40 + i * 60, 0, {});
      car.police = true;
      car.kind = 'cruiser';
      car.speed = 300;
      this.cops.push(car);
      this.vehicles.push(car);
    }
  }

  spawnRoadblockAhead() {
    const pc = this.playerCar;
    const heading = pc ? pc.angle : 0;
    const ax = this.player.x + Math.cos(heading) * 460;
    const ay = this.player.y + Math.sin(heading) * 460;
    for (const off of [-34, 34]) {
      const car = makeCar(9300 + this.nextId++, 'cruiser', ax + Math.cos(heading + Math.PI / 2) * off, ay + Math.sin(heading + Math.PI / 2) * off, heading + Math.PI / 2, {});
      car.police = true;
      car.kind = 'cruiser';
      car.parked = true;
      this.roadblocks.push(car);
      this.vehicles.push(car);
      this.cops.push(car);
    }
  }

  startMissionIndex(index, stage) {
    this.missionIndex = index;
    startMissionState(this, index);
    this.missionStage = stage || 0;
    this.state = 'playing';
  }

  showBriefing(mission) {
    this.state = 'briefing';
  }

  showMissionComplete(mission) {
    this.lastCompleted = mission;
    this.nextMissionTitle = this.missionIndex < MISSIONS.length
      ? MISSIONS[this.missionIndex].title : '';
    this.state = 'complete';
  }

  spawnMissionTarget(x, y) {
    const car = makeCar(9700 + this.nextId++, 'sedan', x + 60, y + 30, Math.PI / 2, {});
    car.color = '#222831';
    this.missionTarget = car;
    this.vehicles.push(car);
    this.flashMessage('TARGET: the black sedan by the hospital', '#ff3860');
  }

  damageMissionTarget(amount) {
    if (!this.missionTarget) return;
    damageCar(this.missionTarget, amount, this);
  }

  damagePlayerCar(amount) {
    const car = this.playerCar;
    if (!car) return;
    // One damage tick per 0.7s: a cruiser leaning on the car or a traffic
    // jam must not shred it frame by frame.
    if (this.crashCooldown > 0) return;
    this.crashCooldown = 0.7;
    damageCar(car, amount, this);
    if (car.dead && this.playerCar === car) {
      this.playerCar = null;
      this.player.x = car.x + 50;
      this.player.y = car.y + 50;
      hurtPlayer(this, 35, 'Your car exploded');
    }
  }

  explodeCar(car) {
    if (this.audio) this.audio.explosion();
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 260;
      this.particles.push({
        x: car.x, y: car.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.7 + Math.random() * 0.5, maxLife: 1.2, size: 6 + Math.random() * 12,
        color: Math.random() < 0.5 ? '#ff7a2a' : '#ffcf3a', kind: 'fire',
      });
    }
    for (let i = 0; i < 10; i++) {
      this.particles.push({
        x: car.x, y: car.y, vx: (Math.random() - 0.5) * 300, vy: (Math.random() - 0.5) * 300,
        life: 1.1, maxLife: 1.1, size: 5, color: '#333333', kind: 'debris',
      });
    }
    this.scareNearby(car.x, car.y, 500);
    addHeat(this, 10, 'Explosion');
    if (this.playerCar === car) {
      this.playerCar = null;
      this.player.x = car.x + 60;
      this.player.y = car.y;
      hurtPlayer(this, 40, 'Your car exploded');
    }
    // Chain damage to nearby cars.
    for (const other of this.vehicles) {
      if (other !== car && !other.dead && dist(other.x, other.y, car.x, car.y) < 120) {
        damageCar(other, 40, this);
      }
    }
  }

  autosave() {
    writeSave(this);
  }

  saveGame() {
    if (writeSave(this)) {
      this.saveNotice = 'Game saved — cash, missions and position kept.';
    } else {
      this.saveNotice = 'Save failed — browser storage is unavailable.';
    }
  }

  loadSaveData(data) {
    this.money = data.money;
    this.missionIndex = data.missionIndex;
    this.completedMissions = data.completed.slice();
    this.totalEarned = data.totalEarned || 0;
    this.player.x = data.playerX;
    this.player.y = data.playerY;
    this.player.health = data.health;
    this.timeOfDay = data.timeOfDay;
    this.cameraSnap();
  }

  startNewGame() {
    this.money = 250;
    this.totalEarned = 0;
    this.completedMissions = [];
    this.missionIndex = 0;
    this.heat = 0;
    this.wantedStars = 0;
    this.cops = [];
    this.roadblocks = [];
    this.heli = null;
    this.player = makePlayer(1500, 1330);
    this.playerCar = null;
    this.timeOfDay = 17.2;
    this.started = true;
    startMissionState(this, 0);
    this.cameraSnap();
    this.audio.unlock();
  }

  continueGame() {
    const data = readSave();
    if (data) this.loadSaveData(data);
    this.started = true;
    startMissionState(this, Math.min(this.missionIndex, MISSIONS.length - 1));
    this.audio.unlock();
  }

  busted(reason) {
    if (this.state !== 'playing') return;
    this.endReason = reason || 'The NBPD caught up with you.';
    this.lastFine = Math.min(this.money, 250);
    this.money -= this.lastFine;
    this.heat = 0;
    this.wantedStars = 0;
    this.cops = [];
    this.roadblocks = [];
    this.heli = null;
    if (this.audio) this.audio.failSting();
    this.state = 'busted';
    this.autosave();
  }

  wasted(reason) {
    if (this.state !== 'playing') return;
    this.endReason = reason || 'You did not make it.';
    this.lastFine = Math.min(this.money, 150);
    this.money -= this.lastFine;
    this.heat = 0;
    this.wantedStars = 0;
    this.cops = [];
    this.roadblocks = [];
    this.heli = null;
    if (this.audio) this.audio.failSting();
    this.state = 'wasted';
    this.autosave();
  }

  respawn(kind) {
    const lm = kind === 'busted' ? this.city.landmarks.policeHQ : this.city.landmarks.hospital;
    this.player.x = lm.x;
    this.player.y = lm.y + 60;
    this.player.health = 100;
    this.playerCar = null;
    this.state = 'playing';
    this.cameraSnap();
    this.flashMessage(kind === 'busted' ? 'Back on the streets. Stay sharp.' : 'Patched up at Coral General.', '#7cff00');
    this.autosave();
  }

  handleButton(label) {
    if (!label) return;
    if (label.startsWith('START ENGINE') || label.startsWith('NEW GAME')) this.startNewGame();
    else if (label.startsWith('CONTINUE')) this.continueGame();
    else if (label.startsWith('RESUME')) { this.state = 'playing'; this.saveNotice = ''; }
    else if (label === 'SAVE GAME') this.saveGame();
    else if (label.startsWith('RESTART MISSION') || label.startsWith('START MISSION')) {
      startMissionState(this, this.missionIndex);
    } else if (label === 'QUIT TO TITLE') { this.state = 'title'; this.hasSaveData = hasSave(); }
    else if (label === 'BACK ON THE STREETS') this.respawn('busted');
    else if (label === 'WAKE UP') this.respawn('wasted');
    else if (label === 'ACCEPT THE JOB') this.state = 'playing';
    else if (label === 'KEEP PLAYING') this.state = 'playing';
  }

  update(dt) {
    this.time += dt;
    this.toastT = Math.max(0, this.toastT - dt);
    this.hintT = Math.max(0, this.hintT - dt);
    this.crashCooldown = Math.max(0, this.crashCooldown - dt);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.2);
    if (this.muzzleFx) this.muzzleFx.t -= dt;
    if (this.punchFx) this.punchFx.t -= dt;
    for (const s of this.sparks) s.t -= dt;
    this.sparks = this.sparks.filter((s) => s.t > 0);

    // Title backdrop: slow cinematic pan over downtown.
    if (this.state === 'title') {
      this.camera.x = 1500 + Math.cos(this.time * 0.05) * 500;
      this.camera.y = 1300 + Math.sin(this.time * 0.04) * 320;
      this.camera.zoom = 0.9;
      this.timeOfDay = 18.4;
      this.updateAmbient(dt);
      return;
    }

    if (this.state === 'paused' || this.state === 'briefing' ||
        this.state === 'busted' || this.state === 'wasted' || this.state === 'complete') {
      return;
    }

    // Day/night + weather drift — pinned while a screenshot is staged.
    if (!this.shotMode) {
      this.timeOfDay = (this.timeOfDay + dt * (24 / 540)) % 24;
      if (Math.random() < dt * 0.02) this.rainTarget = Math.random() < 0.3 ? 0.4 + Math.random() * 0.6 : 0;
      this.rain += clamp(this.rainTarget - this.rain, -dt * 0.2, dt * 0.2);
    } else {
      this.rain = this.shotRain;
      this.timeOfDay = this.shotTime;
    }
    this.updateAmbient(dt);

    // Player: on foot or driving.
    if (this.playerCar) {
      const car = this.playerCar;
      if (car.dead) {
        this.playerCar = null;
      } else {
        const before = { x: car.x, y: car.y };
        const step = driveCar(car, this.input, dt, this.audio);
        const hit = collideCarWithWorld(this.city, car, step.nx, step.ny);
        car.x = hit.x;
        car.y = hit.y;
        // The player IS the car while driving: keep their position, angle
        // and the camera in sync, or missions, the minimap and the camera
        // all read a stale spot where the player got in.
        this.player.x = car.x;
        this.player.y = car.y;
        this.player.angle = car.angle;
        // Off-road drag: grass, sand and sidewalks bleed speed, so the
        // fastest line is always the road — and cars stop wedging into walls.
        if (!isOnRoad(car.x, car.y)) {
          car.speed -= car.speed * 1.4 * dt;
          if (Math.abs(car.speed) > 150) car.speed = Math.sign(car.speed) * 150;
        }
        car.braking = this.input.down('s', 'arrowdown');
        if (hit.crashed) {
          // Impact damage only: scraping along a wall at crawling speed
          // must not bleed the car dry over a long chase.
          if (Math.abs(car.speed) > 100) this.damagePlayerCar(2);
          if (Math.abs(car.speed) > 200) this.sparks.push({ x: car.x, y: car.y, t: 0.3 });
        }
        if (this.input.justPressed('e')) exitCar(this);
        if (this.input.justPressed('r')) this.tryRepair();
        this.checkNearMiss(car, before);
        checkCarPedCollisions(this, dt);
        if (this.audio) this.audio.setEngine(Math.abs(car.speed) / 520, true);
      }
    } else {
      updatePlayerOnFoot(this, dt);
      if (this.audio) this.audio.setEngine(0, false);
    }

    // Traffic, peds, police, missions, bullets, particles, pickups.
    for (const car of this.vehicles) {
      if (car.traffic && !car.dead) updateTrafficCar(car, dt, this.city, this.vehicles, this.trafficRng);
    }
    this.collectPickups();
    this.pedsFleeFastCars(dt);
    this.vehicles = this.vehicles.filter((c) => !c.dead || c === this.playerCar || c.police);
    for (const p of this.peds) updatePed(p, dt, this.city);
    updatePolice(this, dt);
    updateMission(this, dt);
    updateBullets(this, dt);
    this.updateParticles(dt);
    this.updateRainDrops(dt);

    // Camera follows the player, wider when driving.
    const targetZoom = this.playerCar ? 0.82 : 1;
    this.camera.zoom += (targetZoom - this.camera.zoom) * Math.min(1, dt * 2);
    this.camera.x += (this.player.x - this.camera.x) * Math.min(1, dt * 5);
    this.camera.y += (this.player.y - this.camera.y) * Math.min(1, dt * 5);
  }

  updateAmbient(dt) {
    // Traffic horns and distant sirens keep the city alive.
    if (Math.random() < dt * 0.05 && this.audio && this.state === 'playing') {
      this.audio.horn();
    }
  }

  tryRepair() {
    const car = this.playerCar;
    if (!car) return;
    const g = this.city.landmarks.garage;
    if (dist(car.x, car.y, g.x, g.y) > 170) {
      this.hint("Repairs happen at Rico's Garage — follow the green marker", 3);
      return;
    }
    if (car.health >= 100) {
      this.hint('This car does not need repairs.', 2);
      return;
    }
    if (this.money < 150) {
      this.hint('Repairs cost $150 — you cannot afford them yet.', 3);
      return;
    }
    this.money -= 150;
    car.health = 100;
    car.smoke = 0;
    if (this.audio) this.audio.cashRegister();
    this.flashMessage("Rico's Garage — car repaired for $150", '#7cff00');
  }

  checkNearMiss(car, before) {
    if (Math.abs(car.speed) < 220) return;
    for (const other of this.vehicles) {
      if (other === car || other.dead || !other.traffic) continue;
      const d = dist(car.x, car.y, other.x, other.y);
      const prev = dist(before.x, before.y, other.x, other.y);
      if (d < 66 && d > 34 && d < prev && !this.nearMissCooldown[other.id]) {
        this.nearMissCooldown[other.id] = 2;
        this.money += 25;
        this.flashMessage('NEAR MISS  +$25', '#7cff00');
        if (this.audio) this.audio.pickup();
      }
    }
    for (const id of Object.keys(this.nearMissCooldown)) {
      this.nearMissCooldown[id] -= 1 / 60;
      if (this.nearMissCooldown[id] <= 0) delete this.nearMissCooldown[id];
    }
  }

  updateParticles(dt) {
    for (const pt of this.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += pt.kind === 'debris' ? 120 * dt : -20 * dt;
      pt.life -= dt;
    }
    this.particles = this.particles.filter((pt) => pt.life > 0);
  }

  updateRainDrops(dt) {
    const w = this.width;
    const h = this.height;
    for (const d of this.rainDrops) {
      d.y += 900 * dt * (0.7 + this.rain * 0.6);
      d.x -= 260 * dt;
      if (d.y > h) {
        d.y = -20;
        d.x = Math.random() * (w + 100);
        d.splash = 0.3;
      }
      d.splash = Math.max(0, d.splash - dt);
    }
  }

  handleKeys() {
    const input = this.input;
    if (input.justPressed('m')) {
      this.audio.setMuted(!this.audio.muted);
      this.flashMessage(this.audio.muted ? 'Sound muted' : 'Sound on', '#ffffff');
    }
    if (this.state === 'title') {
      if (input.justPressed('enter')) {
        if (this.hasSaveData) this.continueGame();
        else this.startNewGame();
      }
      return;
    }
    if (this.state === 'playing') {
      if (input.justPressed('p', 'escape')) {
        this.state = 'paused';
        this.saveNotice = '';
        this.autosave();
      }
      return;
    }
    if (this.state === 'paused') {
      if (input.justPressed('p', 'escape', 'enter')) this.state = 'playing';
      return;
    }
    if (this.state === 'briefing' || this.state === 'complete') {
      if (input.justPressed('enter')) this.state = 'playing';
      return;
    }
    if (this.state === 'busted' || this.state === 'wasted') {
      if (input.justPressed('enter')) this.respawn(this.state);
    }
  }

  handleClicks() {
    if (!this.input.justClicked()) return;
    this.audio.unlock();
    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    for (const b of this.buttons) {
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
        this.handleButton(b.label);
        return;
      }
    }
  }

  frame(now) {
    const dt = clamp((now - (this.lastNow || now)) / 1000, 0, 0.05);
    this.lastNow = now;
    this.buttons = [];
    this.handleKeys();
    this.handleClicks();
    this.update(dt);
    const w = this.width;
    const h = this.height;
    if (this.state === 'title') {
      drawTitleScreen(this, this.ctx, w, h);
    } else {
      renderWorld(this, this.ctx, w, h, false);
      drawHUD(this, this.ctx, w, h);
      if (this.state === 'paused') drawPauseScreen(this, this.ctx, w, h);
      else if (this.state === 'busted') drawBustedScreen(this, this.ctx, w, h);
      else if (this.state === 'wasted') drawWastedScreen(this, this.ctx, w, h);
      else if (this.state === 'briefing') drawBriefingScreen(this, this.ctx, w, h);
      else if (this.state === 'complete') drawMissionCompleteScreen(this, this.ctx, w, h);
    }
    // Status line for screen readers.
    const status = document.getElementById('status');
    if (status && this.frameCount % 30 === 0) {
      status.textContent = 'Neon Bay: ' + formatCash(this.money) + ', wanted ' + this.wantedStars +
        ' stars, mission ' + (this.mission ? this.mission.title : 'none') +
        ', health ' + Math.round(this.player.health);
    }
    this.frameCount = (this.frameCount || 0) + 1;
    this.input.endFrame();
  }

  start() {
    applyShotPreset(this, window.location.search);
    const loop = (now) => {
      try {
        this.frame(now);
      } catch (err) {
        // Never let one bad frame kill the game; surface it for debugging.
        window.__NEONBAY_ERROR__ = String(err && err.stack || err);
        console.error(err);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

export function bootGame() {
  const canvas = document.getElementById('game');
  const game = new NeonBayGame(canvas);
  window.NB = {
    game,
    state() {
      return {
        state: game.state,
        money: Math.round(game.money),
        health: Math.round(game.player.health),
        wanted: game.wantedStars,
        heat: Math.round(game.heat),
        x: Math.round(game.player.x),
        y: Math.round(game.player.y),
        inCar: !!game.playerCar,
        carHealth: game.playerCar ? Math.round(game.playerCar.health) : null,
        carSpeed: game.playerCar ? Math.round(game.playerCar.speed) : 0,
        carType: game.playerCar ? game.playerCar.type : null,
        mission: game.mission ? game.mission.title : null,
        missionStage: game.missionStage,
        missionActive: game.missionActive,
        completed: game.completedMissions.slice(),
        timeOfDay: Math.round(game.timeOfDay * 100) / 100,
        rain: Math.round(game.rain * 100) / 100,
        cops: game.cops.length,
        heli: !!game.heli,
        peds: game.peds.length,
        pickups: game.pickups.length,
        traffic: game.vehicles.filter((c) => c.traffic).length,
        error: window.__NEONBAY_ERROR__ || null,
      };
    },
    start() { game.startNewGame(); },
    continueGame() { game.continueGame(); },
    missionTarget() {
      const s = game.missionActive && game.mission ? game.mission.stages[game.missionStage] : null;
      return s ? { x: s.x, y: s.y, kind: s.kind, label: s.label } : null;
    },
    save() { game.saveGame(); return !!window.localStorage.getItem('neonbay-save-v3'); },
  };
  game.start();
  return game;
}

bootGame();
