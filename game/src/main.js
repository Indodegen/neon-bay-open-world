// main.js — NEON BAY's wiring: the game loop, the state machine (title,
// playing, paused, busted, wasted), stealing and driving, shooting and
// punching, missions, the economy, saving, and every callback the systems
// use to talk to each other.
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { buildCity, drawCity, drawSunsetLight, isRoad } from './city.js';
import { Camera } from './camera.js';
import { Player } from './player.js';
import { Traffic } from './traffic.js';
import { Pedestrians } from './pedestrians.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { driveCar, damageCar, drawCar, repairCar } from './vehicles.js';
import * as hud from './hud.js';
import { applyShotMode } from './shots.js';
import { PLAYER, ECONOMY, SAVE_KEY } from './config.js';

const START_POS = { x: 1500, y: 1150 };

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.screenW = window.innerWidth;
    this.screenH = window.innerHeight;
    canvas.width = this.screenW;
    canvas.height = this.screenH;

    this.input = new Input(canvas);
    this.audio = new AudioEngine();
    this.city = buildCity();
    this.camera = new Camera(this.screenW, this.screenH);
    this.player = new Player(START_POS.x, START_POS.y);
    this.traffic = new Traffic(this.city);
    this.traffic.populate();
    this.pedestrians = new Pedestrians(this.city);
    this.pedestrians.populate();
    this.traffic.peds = this.pedestrians; // traffic brakes for pedestrians
    this.police = new Police(this.city);
    this.combat = new Combat();
    this.missions = new Missions(this.city);

    this.cash = ECONOMY.startCash;
    this.state = 'title';
    this.time = 0;
    this.playStartedAt = 0;
    this.messages = [];
    this.buttons = [];
    this.skidMarks = [];
    this.pickups = [];
    this.spawnPickups();
    this.save = null;
    this.saveExists = false;
    this.showHowTo = false;
    this.briefingMission = null;
    this.briefingAt = 0;
    this.jobDone = null;
    this.jobDoneAt = 0;
    this.storyDoneShown = false;
    this.endKind = null;
    this.endLost = 0;
    this.nextMissionTimer = 0;
    this.safeTimer = 0;
    this.safeAnnounced = false;
    this.shotWantedCooldown = 0;
    this.shotMode = null;
    this.lastTimestamp = 0;
    this.ended = false;

    this.loadSave();
    this.camera.snapTo(1800, 1200);

    window.addEventListener('resize', () => {
      this.screenW = window.innerWidth;
      this.screenH = window.innerHeight;
      this.canvas.width = this.screenW;
      this.canvas.height = this.screenH;
      this.camera.resize(this.screenW, this.screenH);
    });
    window.__neonbay = { state: this.state, errors: [], shotReady: false };
    window.addEventListener('error', (event) => {
      window.__neonbay.errors.push(String(event.message || event.error));
    });

    const params = new URLSearchParams(window.location.search);
    const shot = params.get('shot');
    if (shot) {
      this.startNewGame();
      if (applyShotMode(this, shot)) {
        this.state = 'playing';
      }
    }
    // ?selftest=1 reports the live state in the page title for headless checks.
    if (params.get('selftest')) {
      setInterval(() => {
        document.title = `NEONBAY ${this.state} errors=${window.__neonbay.errors.length} wanted=${this.police.wanted} cash=${this.cash}`;
      }, 500);
    }
    // One frame right away so a screenshot never catches a blank canvas.
    this.render();
  }

  // --- save / load ---------------------------------------------------------
  loadSave() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && typeof data.cash === 'number') {
        this.save = data;
        this.saveExists = true;
      }
    } catch (e) {
      this.save = null;
    }
  }

  saveGame() {
    try {
      const data = {
        cash: this.cash,
        completed: this.missions.completedCount,
        index: this.missions.index,
        storyDone: this.missions.storyDone,
        health: Math.round(this.player.health),
        armor: Math.round(this.player.armor),
        x: Math.round(this.player.x),
        y: Math.round(this.player.y),
      };
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      this.save = data;
      this.saveExists = true;
    } catch (e) {
      // Storage unavailable (private mode): the game still plays.
    }
  }

  // --- game flow -----------------------------------------------------------
  startNewGame() {
    this.player = new Player(START_POS.x, START_POS.y);
    this.traffic = new Traffic(this.city);
    this.traffic.populate();
    this.pedestrians = new Pedestrians(this.city);
    this.pedestrians.populate();
    this.traffic.peds = this.pedestrians;
    this.police = new Police(this.city);
    this.combat = new Combat();
    this.missions = new Missions(this.city);
    this.cash = ECONOMY.startCash;
    this.messages = [];
    this.skidMarks = [];
    this.spawnPickups();
    this.state = 'playing';
    this.playStartedAt = this.time;
    this.jobDone = null;
    this.storyDoneShown = false;
    this.endKind = null;
    this.nextMissionTimer = 0;
    this.camera.snapTo(this.player.x, this.player.y);
    this.startMission(0);
    this.saveGame();
  }

  continueGame() {
    const data = this.save;
    if (!data) return;
    this.startNewGame();
    this.cash = data.cash;
    this.missions.completedCount = data.completed || 0;
    this.missions.index = data.index || 0;
    this.missions.storyDone = !!data.storyDone;
    this.player.health = data.health || PLAYER.maxHealth;
    this.player.armor = data.armor || 0;
    this.player.x = data.x || START_POS.x;
    this.player.y = data.y || START_POS.y;
    this.camera.snapTo(this.player.x, this.player.y);
    if (this.missions.storyDone) {
      this.storyDoneShown = true;
    } else if (this.missions.nextMission) {
      this.startMission(this.missions.index);
    }
    this.state = 'playing';
    this.playStartedAt = this.time;
  }

  startMission(index) {
    const mission = this.missions.start(index, this);
    if (!mission) return;
    this.briefingMission = mission;
    this.briefingAt = this.time;
    hud.pushMessage(this, `NEW JOB: ${mission.title} — $${mission.reward.toLocaleString('en-US')}`, '#ffd319');
    if (this.audio.context) this.audio.pickup();
  }

  spawnPickups() {
    const spots = [
      { type: 'health', x: 920, y: 1180 },
      { type: 'armor', x: 2560, y: 1600 },
      { type: 'ammo', x: 1800, y: 2140 },
      { type: 'health', x: 230, y: 740 },
      { type: 'armor', x: 2320, y: 1390 },
      { type: 'ammo', x: 420, y: 2040 },
    ];
    this.pickups = spots.map((s) => ({ ...s, taken: false, respawnIn: 0 }));
  }

  // --- main loop -------------------------------------------------------------
  loop(timestamp) {
    const dt = Math.min(0.05, Math.max(0.001, (timestamp - this.lastTimestamp) / 1000 || 0.016));
    this.lastTimestamp = timestamp;
    this.update(dt);
    this.render();
    this.input.endFrame();
    if (window.__neonbay) window.__neonbay.state = this.state;
    requestAnimationFrame((t) => this.loop(t));
  }

  start() {
    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    // Any key press is a user gesture: start the audio engine on it too,
    // so keyboard-only players (Enter to start) still get sound.
    if (this.input.anyKey) this.audio.ensure();
    // Menu clicks use the buttons drawn last frame.
    if (this.input.mouse.clicked) this.handleMenuClick(this.input.mouse.x, this.input.mouse.y);
    if (this.state === 'title') {
      this.time += dt;
      this.camera.x = 1800 + Math.cos(this.time * 0.06) * 650;
      this.camera.y = 1250 + Math.sin(this.time * 0.045) * 420;
      this.camera.zoom += (0.85 - this.camera.zoom) * dt;
      this.traffic.update(dt, this.player, this.police.cars, null, this.audio);
      this.pedestrians.update(dt, this.time);
      this.combat.update(dt, this);
      if (this.input.wasPressed('Enter')) this.startNewGame();
      return;
    }
    if (this.state === 'paused') {
      if (this.input.wasPressed('KeyP') || this.input.wasPressed('Escape')) this.state = 'playing';
      return;
    }
    if (this.state === 'busted' || this.state === 'wasted') {
      return;
    }
    // Playing.
    this.time += dt;
    this.updatePlaying(dt);
  }

  updatePlaying(dt) {
    const input = this.input;
    const player = this.player;

    if (input.wasPressed('KeyP') || input.wasPressed('Escape')) {
      this.state = 'paused';
      return;
    }
    if (input.wasPressed('KeyM')) {
      const muted = this.audio.toggleMute();
      hud.pushMessage(this, muted ? 'Sound off' : 'Sound on', '#c9b8e8');
    }

    this.shotWantedCooldown = Math.max(0, this.shotWantedCooldown - dt);

    // Entering and leaving cars.
    if (input.wasPressed('KeyE')) this.tryEnterExitCar();

    // Punching.
    if (input.wasPressed('KeyF') && !player.inCar) this.handlePunch();

    // Reload, or repair at the garage.
    if (input.wasPressed('KeyR')) {
      if (player.inCar && player.car) this.tryRepair();
      else player.startReload();
    }

    // Driving or walking.
    const aimWorld = this.camera.screenToWorld(input.mouse.x, input.mouse.y);
    if (player.inCar && player.car) {
      let throttle = input.axis('KeyS', 'KeyW') + input.axis('ArrowDown', 'ArrowUp');
      let steer = input.axis('KeyA', 'KeyD') + input.axis('ArrowLeft', 'ArrowRight');
      // Staged screenshot scenes drive themselves toward the objective,
      // so the shot stays alive and fast with no input.
      if (this.shotMode) {
        const target = this.missions.target();
        throttle = 1;
        if (target) {
          const desired = Math.atan2(target.y - player.y, target.x - player.x);
          let diff = desired - player.car.angle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          steer = Math.max(-1, Math.min(1, diff * 2));
        } else {
          steer = 0;
        }
      }
      const handbrake = input.isDown('Space');
      driveCar(player.car, this.city, throttle, steer, handbrake, dt, (car, impact) => {
        this.audio.crash(impact / 400);
        this.camera.addShake(Math.min(10, impact / 40));
        damageCar(car, impact * 0.06);
        this.combat.spawnSparks(car.x, car.y, 8);
        if (car.dead) this.explodeCar(car);
      });
      if (handbrake && Math.abs(player.car.speed) > 150) this.addSkidMark(player.car);
      else if (Math.abs(steer) > 0.7 && Math.abs(player.car.speed) > 320) this.addSkidMark(player.car);
      player.x = player.car.x;
      player.y = player.car.y;
      player.angle = player.car.angle;
      this.checkPlayerCarCollisions();
      this.checkRunOverPeds();
      this.audio.updateEngine(Math.abs(player.car.speed) / 560, false);
    } else {
      player.update(dt, input, this.city, aimWorld);
      this.handleShooting();
      this.audio.updateEngine(0, true);
      this.checkPlayerHitByTraffic();
    }

    this.traffic.update(dt, player, this.police.cars, () => this.onNearMiss(), this.audio);
    this.pedestrians.update(dt, this.time);
    this.police.update(dt, this);
    this.combat.update(dt, this);
    this.updatePickups(dt);
    this.updateSafehouseAndMissions(dt);
    this.updateSkidMarks(dt);

    // Wasted?
    if (player.dead) {
      this.onWasted();
      return;
    }

    // Next mission auto-starts a couple of seconds after the last one pays.
    if (!this.missions.active && !this.missions.storyDone && this.missions.nextMission) {
      this.nextMissionTimer += dt;
      if (this.nextMissionTimer > 2.5) {
        this.nextMissionTimer = 0;
        this.startMission(this.missions.index);
      }
    }

    this.camera.update(dt, player.x, player.y, player.inCar);
  }

  // --- stealing cars ---------------------------------------------------------
  nearestCarToPlayer(maxDist) {
    let best = null;
    let bestDist = maxDist;
    const cars = this.traffic.allCars().concat(this.police.cars, this.police.roadblocks);
    for (const car of cars) {
      if (car.dead) continue;
      if (car === this.player.car) continue;
      const d = Math.hypot(car.x - this.player.x, car.y - this.player.y);
      if (d < bestDist) {
        best = car;
        bestDist = d;
      }
    }
    return best;
  }

  tryEnterExitCar() {
    const player = this.player;
    if (player.inCar && player.car) {
      const car = player.car;
      player.inCar = false;
      player.car = null;
      this.traffic.playerCar = null;
      car.parked = true;
      car.driver = null;
      this.traffic.parked.push(car);
      // Step out to the side of the car.
      player.x = car.x - Math.sin(car.angle) * 34;
      player.y = car.y + Math.cos(car.angle) * 34;
      player.angle = car.angle;
      return;
    }
    const car = this.nearestCarToPlayer(52);
    if (!car) return;
    const wasTraffic = this.traffic.cars.includes(car);
    const wasPolice = this.police.cars.includes(car) || this.police.roadblocks.includes(car);
    if (wasTraffic) {
      this.traffic.cars.splice(this.traffic.cars.indexOf(car), 1);
      // The driver bails and runs.
      this.pedestrians.scare(car.x, car.y, 120);
      hud.pushMessage(this, 'You jacked a moving car!', '#ff9f43');
    } else if (wasPolice) {
      hud.pushMessage(this, 'You stole a police cruiser!', '#ff4757');
    }
    if (this.traffic.parked.includes(car)) {
      this.traffic.parked.splice(this.traffic.parked.indexOf(car), 1);
    }
    if (wasPolice) {
      this.police.cars = this.police.cars.filter((c) => c !== car);
      this.police.roadblocks = this.police.roadblocks.filter((c) => c !== car);
    }
    car.parked = false;
    car.driver = 'player';
    player.inCar = true;
    player.car = car;
    this.traffic.playerCar = car;
    this.audio.pickup();
    // Seen stealing? The law notices.
    const witness = this.pedestrians.nearestWitness(car.x, car.y, 260);
    const copNear = this.police.nearestCopDistance(player) < 420;
    if (witness || copNear || wasTraffic || wasPolice) {
      this.police.addWanted(1, 'steal');
      hud.pushMessage(this, 'Someone saw that — wanted level up!', '#ff4757');
    }
  }

  tryRepair() {
    const garage = this.city.landmarks.garage;
    const player = this.player;
    if (Math.hypot(player.x - garage.x, player.y - garage.y) > 110) {
      hud.pushMessage(this, 'Drive to Sunset Garage to repair', '#c9b8e8');
      return;
    }
    if (player.car.hp >= player.car.maxHp) {
      hud.pushMessage(this, 'This car is already in perfect shape', '#c9b8e8');
      return;
    }
    if (this.cash < ECONOMY.repairCost) {
      hud.pushMessage(this, `Repair costs $${ECONOMY.repairCost} — you are short`, '#ff4757');
      return;
    }
    this.cash -= ECONOMY.repairCost;
    repairCar(player.car);
    this.audio.cash();
    hud.pushMessage(this, `Car repaired for $${ECONOMY.repairCost}`, '#39ff88');
  }

  // --- combat input ----------------------------------------------------------
  handleShooting() {
    const player = this.player;
    const input = this.input;
    if (!input.mouse.down || player.shootCooldown > 0 || player.reloadTimer > 0) return;
    if (player.ammo <= 0) {
      player.startReload();
      return;
    }
    player.ammo--;
    player.shootCooldown = PLAYER.pistolCooldown;
    const aimWorld = this.camera.screenToWorld(input.mouse.x, input.mouse.y);
    const angle = Math.atan2(aimWorld.y - player.y, aimWorld.x - player.x);
    player.aimAngle = angle;
    this.combat.shoot(player.x, player.y, angle, 'player');
    this.audio.shoot();
    this.camera.addShake(1.2);
    this.pedestrians.scare(player.x, player.y, 340);
    if (this.shotWantedCooldown <= 0 && this.police.nearestCopDistance(player) < 380) {
      this.police.addWanted(1, 'shoot');
      this.shotWantedCooldown = 4;
      hud.pushMessage(this, 'Shots fired near the cops!', '#ff4757');
    }
  }

  handlePunch() {
    const player = this.player;
    if (player.punchCooldown > 0) return;
    player.punchCooldown = PLAYER.punchCooldown;
    this.audio.punch();
    const arc = this.combat.punchArc(player);
    let hitSomething = false;
    for (const ped of this.pedestrians.list) {
      if (ped.down) continue;
      if (Math.hypot(ped.x - arc.x, ped.y - arc.y) < arc.radius) {
        ped.hp -= PLAYER.punchDamage;
        this.combat.spawnBlood(ped.x, ped.y);
        hitSomething = true;
        if (ped.hp <= 0) {
          ped.down = true;
          this.onPedestrianKilled(ped);
        } else {
          this.pedestrians.scare(ped.x, ped.y, 200);
        }
      }
    }
    for (const cop of this.police.officers) {
      if (cop.down) continue;
      if (Math.hypot(cop.x - arc.x, cop.y - arc.y) < arc.radius) {
        cop.hp -= PLAYER.punchDamage;
        this.combat.spawnBlood(cop.x, cop.y);
        hitSomething = true;
        if (cop.hp <= 0) {
          cop.down = true;
          this.onOfficerKilled(cop);
        }
      }
    }
    if (hitSomething) this.camera.addShake(2);
  }

  // --- collisions ------------------------------------------------------------
  checkPlayerCarCollisions() {
    const myCar = this.player.car;
    if (!myCar || myCar.dead) return;
    const others = this.traffic.allCars().concat(this.police.cars, this.police.roadblocks);
    for (const other of others) {
      if (other === myCar || other.dead) continue;
      const dx = other.x - myCar.x;
      const dy = other.y - myCar.y;
      const d = Math.hypot(dx, dy);
      const minDist = (myCar.length + other.length) / 2 - 6;
      if (d < minDist && d > 0.01) {
        const nx = dx / d;
        const ny = dy / d;
        const overlap = minDist - d;
        const impact = Math.abs(myCar.speed - other.speed);
        myCar.x -= nx * overlap * 0.6;
        myCar.y -= ny * overlap * 0.6;
        if (!other.parked && other.driver === 'traffic') {
          other.x += nx * overlap * 0.4;
          other.y += ny * overlap * 0.4;
        }
        if (impact > 110 && this.time - (myCar.lastHitAt || -9) > 0.6) {
          myCar.lastHitAt = this.time;
          this.audio.crash(impact / 500);
          this.camera.addShake(Math.min(9, impact / 45));
          this.combat.spawnSparks(myCar.x + nx * 20, myCar.y + ny * 20, 8);
          damageCar(myCar, impact * 0.045);
          if (!other.parked) damageCar(other, impact * 0.045);
          if (other.driver === 'police') {
            this.police.addWanted(1, 'hit-cop');
            hud.pushMessage(this, 'You rammed a police cruiser!', '#ff4757');
          }
          if (other.dead) this.explodeCar(other);
          if (myCar.dead) this.explodeCar(myCar);
        }
      }
    }
  }

  checkRunOverPeds() {
    const myCar = this.player.car;
    if (!myCar || Math.abs(myCar.speed) < 50) return;
    for (const ped of this.pedestrians.list) {
      if (ped.down) continue;
      if (Math.hypot(ped.x - myCar.x, ped.y - myCar.y) < 26) {
        ped.down = true;
        ped.hp = 0;
        this.combat.spawnBlood(ped.x, ped.y);
        this.onPedestrianKilled(ped);
        myCar.speed *= 0.86;
      }
    }
  }

  checkPlayerHitByTraffic() {
    const player = this.player;
    for (const car of this.traffic.cars) {
      if (car.dead || Math.abs(car.speed) < 80) continue;
      if (Math.hypot(car.x - player.x, car.y - player.y) < 26) {
        if (this.time - (car.lastPedHit || -9) > 1) {
          car.lastPedHit = this.time;
          player.takeDamage(15);
          this.camera.addShake(6);
          this.audio.crash(0.5);
          this.combat.spawnSparks(player.x, player.y, 8);
          car.speed *= 0.4;
        }
      }
    }
  }

  addSkidMark(car) {
    const backX = car.x - Math.cos(car.angle) * car.length * 0.4;
    const backY = car.y - Math.sin(car.angle) * car.length * 0.4;
    const prev = this.skidMarks[this.skidMarks.length - 1];
    if (prev && Math.hypot(backX - prev.x2, backY - prev.y2) < 4) {
      prev.x2 = backX;
      prev.y2 = backY;
      prev.life = 12;
      return;
    }
    this.skidMarks.push({ x1: backX, y1: backY, x2: backX, y2: backY, life: 12, maxLife: 12 });
    if (this.skidMarks.length > 420) this.skidMarks.shift();
  }

  updateSkidMarks(dt) {
    for (let i = this.skidMarks.length - 1; i >= 0; i--) {
      this.skidMarks[i].life -= dt;
      if (this.skidMarks[i].life <= 0) this.skidMarks.splice(i, 1);
    }
  }

  // --- pickups, safehouse, missions -----------------------------------------
  updatePickups(dt) {
    const player = this.player;
    for (const pickup of this.pickups) {
      if (pickup.taken) {
        pickup.respawnIn -= dt;
        if (pickup.respawnIn <= 0) pickup.taken = false;
        continue;
      }
      if (Math.hypot(player.x - pickup.x, player.y - pickup.y) < 30) {
        pickup.taken = true;
        pickup.respawnIn = 45;
        this.audio.pickup();
        if (pickup.type === 'health') {
          player.heal(50);
          hud.pushMessage(this, '+50 health', '#39ff88');
        } else if (pickup.type === 'armor') {
          player.addArmor(50);
          hud.pushMessage(this, '+50 armor', '#22e6ff');
        } else {
          player.ammoReserve += 48;
          hud.pushMessage(this, '+48 ammo', '#ffd319');
        }
      }
    }
  }

  updateSafehouseAndMissions(dt) {
    const sh = this.city.landmarks.safehouse;
    const d = Math.hypot(this.player.x - sh.x, this.player.y - sh.y);
    if (d < 120) {
      this.player.heal(8 * dt);
      this.safeTimer += dt;
      if (this.safeTimer > 3 && this.police.wanted > 0) {
        this.police.clearWanted();
        if (!this.safeAnnounced) {
          this.safeAnnounced = true;
          hud.pushMessage(this, 'Safehouse — the heat is off. You are clean.', '#39ff88');
          this.audio.pickup();
        }
      }
    } else {
      this.safeTimer = 0;
      this.safeAnnounced = false;
    }
    const ev = this.missions.update(dt, this);
    if (!ev) return;
    if (ev.event === 'complete') {
      const mission = ev.mission;
      this.cash += mission.reward;
      this.jobDone = mission;
      this.jobDoneAt = this.time;
      this.audio.missionWin();
      this.audio.cash();
      hud.pushMessage(this, `JOB DONE: ${mission.name} — +$${mission.reward.toLocaleString('en-US')}`, '#39ff88');
      if (this.missions.storyDone) {
        this.storyDoneShown = true;
        hud.pushMessage(this, 'STORY COMPLETE — Neon Bay is yours, Rex!', '#ffd319');
      }
      this.nextMissionTimer = 0;
      this.saveGame();
    } else if (ev.event === 'fail') {
      this.audio.missionFail();
      hud.pushMessage(this, `JOB FAILED: ${ev.reason}`, '#ff4757');
      this.missions.fail();
      this.nextMissionTimer = 0;
    } else if (ev.event === 'step') {
      this.audio.pickup();
    }
  }

  // --- event callbacks from the systems --------------------------------------
  onNearMiss() {
    this.cash += ECONOMY.nearMissBonus;
    hud.pushMessage(this, `NEAR MISS  +$${ECONOMY.nearMissBonus}`, '#22e6ff');
  }

  onCarShot(car, bullet) {
    const destroyed = damageCar(car, bullet.damage);
    if (car.driver === 'police' && !car.reported) {
      car.reported = true;
      this.police.addWanted(1, 'hit-cop');
      hud.pushMessage(this, 'You shot a police cruiser!', '#ff4757');
    }
    if (destroyed) this.explodeCar(car);
  }

  onPedestrianKilled(ped) {
    this.police.addWanted(1, 'kill-ped');
    this.pedestrians.scare(ped.x, ped.y, 300);
    hud.pushMessage(this, 'Pedestrian down — the city saw it', '#ff4757');
  }

  onOfficerKilled(cop) {
    this.police.addWanted(2, 'kill-cop');
    hud.pushMessage(this, 'Officer down! The NBPD is coming for you.', '#ff4757');
  }

  onPlayerShot() {
    this.camera.addShake(3);
  }

  onPoliceCrash(car, impact) {
    this.combat.spawnSparks(car.x, car.y, 6);
    if (car.dead) this.explodeCar(car);
  }

  onPlayerCarRam(amount) {
    this.camera.addShake(4);
  }

  onPlayerCarDestroyed(car) {
    this.explodeCar(car);
  }

  explodeCar(car) {
    if (car.exploded) return;
    car.exploded = true;
    this.combat.explosion(car.x, car.y);
    this.audio.explosion();
    this.camera.addShake(12);
    // Blast radius: hurt the player, nearby cars and pedestrians.
    const player = this.player;
    if (!player.inCar && Math.hypot(player.x - car.x, player.y - car.y) < 130) {
      player.takeDamage(30);
    }
    for (const other of this.traffic.allCars().concat(this.police.cars)) {
      if (other === car || other.dead) continue;
      if (Math.hypot(other.x - car.x, other.y - car.y) < 110) {
        if (damageCar(other, 55) && !other.exploded) this.explodeCar(other);
      }
    }
    for (const ped of this.pedestrians.list) {
      if (!ped.down && Math.hypot(ped.x - car.x, ped.y - car.y) < 95) {
        ped.down = true;
        this.combat.spawnBlood(ped.x, ped.y);
      }
    }
    this.pedestrians.scare(car.x, car.y, 420);
    if (car === player.car) {
      player.inCar = false;
      player.car = null;
      this.traffic.playerCar = null;
      player.x = car.x + 40;
      player.y = car.y + 40;
      player.takeDamage(20);
      hud.pushMessage(this, 'Your car blew up!', '#ff4757');
    }
  }

  onWantedCleared() {
    hud.pushMessage(this, 'You lost the cops.', '#39ff88');
    this.audio.pickup();
  }

  onBusted() {
    if (this.state !== 'playing') return;
    this.endKind = 'busted';
    this.endLost = Math.floor(this.cash * ECONOMY.bustedFine);
    this.cash -= this.endLost;
    this.police.clearWanted();
    this.missions.fail();
    if (this.player.inCar && this.player.car) {
      this.player.inCar = false;
      this.player.car = null;
      this.traffic.playerCar = null;
    }
    const station = this.city.landmarks.policeStation;
    this.player.x = station.x;
    this.player.y = station.y + 60;
    this.player.health = 60;
    this.player.dead = false;
    this.audio.busted();
    this.state = 'busted';
    this.saveGame();
  }

  onWasted() {
    if (this.state !== 'playing') return;
    this.endKind = 'wasted';
    this.endLost = Math.floor(this.cash * ECONOMY.wastedFine);
    this.cash -= this.endLost;
    this.police.clearWanted();
    this.missions.fail();
    if (this.player.inCar && this.player.car) {
      this.player.inCar = false;
      this.player.car = null;
      this.traffic.playerCar = null;
    }
    const hospital = this.city.landmarks.hospital;
    this.player.x = hospital.x;
    this.player.y = hospital.y + 60;
    this.player.health = 60;
    this.player.dead = false;
    this.audio.busted();
    this.state = 'wasted';
    this.saveGame();
  }

  // --- menus -----------------------------------------------------------------
  handleMenuClick(x, y) {
    for (const button of this.buttons) {
      if (x >= button.x && x <= button.x + button.w && y >= button.y && y <= button.y + button.h) {
        this.audio.ensure();
        this.audio.click();
        if (button.id === 'newgame') this.startNewGame();
        else if (button.id === 'continue') this.continueGame();
        else if (button.id === 'howto') this.showHowTo = !this.showHowTo;
        else if (button.id === 'resume') this.state = 'playing';
        else if (button.id === 'restart-mission') {
          if (this.missions.active) {
            const index = this.missions.list.indexOf(this.missions.active);
            this.startMission(index);
          } else if (this.missions.nextMission) {
            this.startMission(this.missions.index);
          }
          this.state = 'playing';
        } else if (button.id === 'mute') this.audio.toggleMute();
        else if (button.id === 'quit-title') {
          this.saveGame();
          this.state = 'title';
          this.loadSave();
          this.camera.snapTo(1800, 1200);
        } else if (button.id === 'respawn') {
          this.state = 'playing';
          this.playStartedAt = this.time;
          this.player.invulnerableTimer = 2;
          this.camera.snapTo(this.player.x, this.player.y);
        }
        return;
      }
    }
  }

  // --- rendering ---------------------------------------------------------------
  render() {
    const ctx = this.ctx;
    const W = this.screenW;
    const H = this.screenH;
    ctx.clearRect(0, 0, W, H);
    const view = this.camera.viewRect();

    this.camera.apply(ctx);
    drawCity(ctx, this.city, view, this.time);
    this.missions.drawMarker(ctx, this.time);
    this.drawSkidMarks(ctx);
    this.drawPickups(ctx);
    this.traffic.draw(ctx, this.time, view);
    if (this.player.inCar && this.player.car) drawCar(ctx, this.player.car, this.time);
    this.police.draw(ctx, this.time, view);
    this.pedestrians.draw(ctx, this.time, view);
    this.player.draw(ctx, this.time);
    this.combat.draw(ctx);
    this.camera.reset(ctx);
    drawSunsetLight(ctx, W, H, this.time);

    this.buttons = [];
    if (this.state === 'title') {
      hud.drawTitleScreen(ctx, this, this.buttons);
    } else if (this.state === 'paused') {
      hud.drawHUD(ctx, this);
      hud.drawPauseScreen(ctx, this, this.buttons);
    } else if (this.state === 'busted' || this.state === 'wasted') {
      hud.drawHUD(ctx, this);
      hud.drawEndScreen(ctx, this, this.buttons);
    } else {
      hud.drawHUD(ctx, this);
      hud.drawMissionBriefing(ctx, this);
      hud.drawJobDoneBanner(ctx, this);
      hud.drawStoryDoneBanner(ctx, this);
    }
    if (window.__neonbay) window.__neonbay.shotReady = true;
  }

  drawSkidMarks(ctx) {
    for (const mark of this.skidMarks) {
      ctx.strokeStyle = `rgba(10, 8, 16, ${Math.min(0.55, (mark.life / mark.maxLife) * 0.55)})`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(mark.x1, mark.y1);
      ctx.lineTo(mark.x2, mark.y2);
      ctx.stroke();
    }
  }

  drawPickups(ctx) {
    for (const pickup of this.pickups) {
      if (pickup.taken) continue;
      const bob = Math.sin(this.time * 3 + pickup.x) * 3;
      ctx.save();
      ctx.translate(pickup.x, pickup.y + bob);
      ctx.fillStyle = 'rgba(255, 246, 236, 0.12)';
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fill();
      if (pickup.type === 'health') {
        ctx.fillStyle = '#39ff88';
        ctx.fillRect(-4, -11, 8, 22);
        ctx.fillRect(-11, -4, 22, 8);
      } else if (pickup.type === 'armor') {
        ctx.fillStyle = '#22e6ff';
        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.lineTo(10, -7);
        ctx.lineTo(10, 3);
        ctx.quadraticCurveTo(10, 10, 0, 13);
        ctx.quadraticCurveTo(-10, 10, -10, 3);
        ctx.lineTo(-10, -7);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = '#ffd319';
        ctx.fillRect(-10, -8, 20, 16);
        ctx.fillStyle = '#14121f';
        ctx.font = 'bold 10px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('AMMO', 0, 3);
      }
      ctx.restore();
    }
  }
}

// Boot the game.
const canvas = document.getElementById('game');
const game = new Game(canvas);
window.__neonbay.game = game; // exposed for headless playtests and debugging
game.start();
