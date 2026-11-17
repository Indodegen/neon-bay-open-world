// police.js — The NBPD: wanted stars, cruiser chases, foot officers, road
// blocks and the news helicopter. Stars rise with crime and fall when the
// player stays out of sight; getting caught on foot means BUSTED.
import { createCar, driveCar, drawCar, damageCar } from './vehicles.js';
import { randomRoadPoint, resolveCollision } from './city.js';
import { WANTED } from './config.js';
import { Rng } from './random.js';

export class Police {
  constructor(city) {
    this.city = city;
    this.rng = new Rng(909);
    this.wanted = 0;
    this.cars = [];
    this.officers = [];
    this.heli = null;
    this.roadblocks = [];
    this.decayTimer = 0;
    this.spawnTimer = 0;
    this.roadblockTimer = 0;
    this.bustTimer = 0;
    this.lastCrimeAt = 0;
  }

  addWanted(stars, reason) {
    this.wanted = Math.min(WANTED.maxStars, this.wanted + stars);
    this.decayTimer = 0;
    this.lastCrimeAt = reason || '';
  }

  setWanted(stars) {
    this.wanted = Math.max(0, Math.min(WANTED.maxStars, stars));
    this.decayTimer = 0;
  }

  clearWanted() {
    this.wanted = 0;
    this.decayTimer = 0;
    this.cars = [];
    this.officers = [];
    this.heli = null;
    this.roadblocks = [];
  }

  spawnCruiser(player, audio) {
    const spot = randomRoadPoint(this.city, this.rng);
    // Spawn on a road the player can see coming, not on top of them.
    let tries = 0;
    while (Math.hypot(spot.x - player.x, spot.y - player.y) < 420 && tries < 8) {
      const next = randomRoadPoint(this.city, this.rng);
      spot.x = next.x;
      spot.y = next.y;
      spot.angle = next.angle;
      tries++;
    }
    const car = createCar('police', spot.x, spot.y, spot.angle, this.rng);
    car.driver = 'police';
    car.speed = 200;
    car.cruiseSpeed = 480;
    car.targetAngle = spot.angle;
    // Each cruiser takes its own lane in the pursuit so they fan out
    // instead of stacking on the player's bumper.
    car.pursuitLane = this.rng.pick([-26, 0, 26]);
    car.ramCooldown = 0;
    this.cars.push(car);
    if (audio) audio.sirenBlip();
    return car;
  }

  spawnRoadblock(player) {
    const ahead = 420;
    const bx = player.x + Math.cos(player.angle || 0) * ahead;
    const by = player.y + Math.sin(player.angle || 0) * ahead;
    const angle = (player.angle || 0) + Math.PI / 2;
    for (const side of [-1, 1]) {
      const car = createCar('police', bx + Math.cos(angle) * side * 30, by + Math.sin(angle) * side * 30, angle, this.rng);
      car.driver = 'police';
      car.parked = true;
      car.speed = 0;
      this.roadblocks.push(car);
    }
  }

  spawnOfficer(x, y) {
    this.officers.push({
      x, y,
      angle: 0,
      hp: 100,
      speed: 165,
      shootCooldown: this.rng.range(0.5, 1.5),
      down: false,
      bustHold: 0,
    });
  }

  // The helicopter keeps eyes on the player and stops wanted decay.
  updateHelicopter(dt, player) {
    if (this.wanted < WANTED.heliFromStars) {
      this.heli = null;
      return;
    }
    if (!this.heli) {
      this.heli = { x: player.x - 500, y: player.y - 400, angle: 0, rotor: 0 };
    }
    const heli = this.heli;
    heli.rotor += dt * 28;
    const dx = player.x - heli.x;
    const dy = player.y - heli.y;
    const d = Math.hypot(dx, dy);
    heli.angle = Math.atan2(dy, dx);
    if (d > 180) {
      heli.x += (dx / d) * 320 * dt;
      heli.y += (dy / d) * 320 * dt;
    }
  }

  update(dt, game) {
    const { player, audio } = game;
    const wantedCount = WANTED.cruisersForStars[this.wanted] || 0;

    // Spawn cruisers up to the wanted level, a couple of seconds apart.
    this.spawnTimer -= dt;
    if (this.cars.length < wantedCount && this.spawnTimer <= 0 && this.wanted > 0) {
      this.spawnCruiser(player, audio);
      this.spawnTimer = 2.2;
    }
    // Despawn extra cruisers when stars fall.
    while (this.cars.length > wantedCount) this.cars.pop();

    // Roadblocks at 3+ stars, ahead of the player's direction of travel.
    this.roadblockTimer -= dt;
    if (this.wanted >= WANTED.roadblockFromStars && this.roadblockTimer <= 0) {
      this.spawnRoadblock(player);
      this.roadblockTimer = 26;
    }

    this.updateHelicopter(dt, player);

    // Wanted decay: only while no cruiser, officer or helicopter is near.
    const nearestCop = this.nearestCopDistance(player);
    const heliWatching = this.heli && Math.hypot(this.heli.x - player.x, this.heli.y - player.y) < 700;
    if (this.wanted > 0 && nearestCop > 620 && !heliWatching) {
      this.decayTimer += dt;
      if (this.decayTimer > WANTED.decayDelay) {
        this.decayTimer = WANTED.decayDelay;
        this.wantedTimer = (this.wantedTimer || 0) + dt;
        if (this.wantedTimer >= WANTED.decayInterval) {
          this.wantedTimer = 0;
          this.decayTimer = 0;
          this.wanted--;
          if (this.wanted === 0) game.onWantedCleared();
        }
      }
    } else {
      this.decayTimer = 0;
      this.wantedTimer = 0;
    }

    // Cruiser chase: steer at the player, ram their car, box them in.
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      if (car.dead) {
        this.cars.splice(i, 1);
        continue;
      }
      car.ramCooldown = Math.max(0, (car.ramCooldown || 0) - dt);
      this.updateCruiser(car, dt, game);
    }
    // Keep cruisers from piling onto each other: a gentle separation push.
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) {
        const a = this.cars[i];
        const b = this.cars[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d < 62 && d > 0.01) {
          const push = (62 - d) * 0.5;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }

    // Officers on foot: chase and shoot, or hold the player to bust them.
    for (let i = this.officers.length - 1; i >= 0; i--) {
      const cop = this.officers[i];
      if (cop.down) {
        this.officers.splice(i, 1);
        continue;
      }
      this.updateOfficer(cop, dt, game);
    }

    // Roadblock cars are static until rammed; fade them out when wanted ends.
    if (this.wanted < WANTED.roadblockFromStars) {
      this.roadblocks = this.roadblocks.filter((c) => !c.dead);
    }
    for (const block of this.roadblocks) {
      if (block.dead) continue;
      resolveCollision(this.city, block, 24);
    }

    // Busted: an officer standing on the player for a moment.
    if (!player.inCar && this.wanted > 0) {
      const close = this.officers.some((cop) => Math.hypot(cop.x - player.x, cop.y - player.y) < 26);
      const cruiserClose = this.cars.some((car) => Math.hypot(car.x - player.x, car.y - player.y) < 34 && Math.abs(car.speed) < 40);
      if (close || cruiserClose) {
        this.bustTimer += dt;
        if (this.bustTimer > 1.1) {
          this.bustTimer = 0;
          game.onBusted();
        }
      } else {
        this.bustTimer = Math.max(0, this.bustTimer - dt * 2);
      }
    } else {
      this.bustTimer = 0;
    }

    if (audio) audio.setSiren(this.wanted > 0);
  }

  nearestCopDistance(player) {
    let best = Infinity;
    for (const car of this.cars) best = Math.min(best, Math.hypot(car.x - player.x, car.y - player.y));
    for (const cop of this.officers) best = Math.min(best, Math.hypot(cop.x - player.x, cop.y - player.y));
    return best;
  }

  updateCruiser(car, dt, game) {
    const { player, audio } = game;
    const targetX = player.inCar && player.car ? player.car.x : player.x;
    const targetY = player.inCar && player.car ? player.car.y : player.y;
    // Aim at the player's position offset by this cruiser's pursuit lane,
    // so the pack fans out instead of converging on one point.
    const lane = car.pursuitLane || 0;
    const toPlayer = Math.atan2(targetY - car.y, targetX - car.x);
    const aimX = targetX + Math.cos(toPlayer + Math.PI / 2) * lane;
    const aimY = targetY + Math.sin(toPlayer + Math.PI / 2) * lane;
    const dx = aimX - car.x;
    const dy = aimY - car.y;
    const dist = Math.hypot(dx, dy);
    const desired = Math.atan2(dy, dx);
    let diff = desired - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 2.4));

    // Ram the player's car; slow to a stop beside a player on foot.
    let throttle = 1;
    if (!player.inCar && dist < 60) {
      throttle = 0;
      car.speed -= 400 * dt;
      // The officer gets out and chases on foot.
      if (Math.abs(car.speed) < 30 && this.officers.length < 3 && Math.random() < dt * 0.8) {
        this.spawnOfficer(car.x + 20, car.y + 20);
      }
    } else if (player.inCar && dist < 46) {
      throttle = 0.6;
    }
    if (car.speed > 500) car.speed = 500;
    const beforeSpeed = car.speed;
    driveCar(car, this.city, throttle, steer, false, dt, (crashedCar, impact) => {
      if (audio) audio.crash(impact / 400);
      damageCar(crashedCar, impact * 0.05);
      game.onPoliceCrash(crashedCar, impact);
    });
    // Ramming the player's car damages it (with a cooldown per cruiser).
    if (player.inCar && player.car && !player.car.dead) {
      const d = Math.hypot(player.car.x - car.x, player.car.y - car.y);
      if (d < 52 && Math.abs(beforeSpeed) > 120 && car.ramCooldown <= 0) {
        car.ramCooldown = 0.9;
        damageCar(player.car, 6);
        game.onPlayerCarRam(6);
        if (player.car.dead) game.onPlayerCarDestroyed(player.car);
      }
    }
    void audio;
  }

  updateOfficer(cop, dt, game) {
    const { player, combat } = game;
    const dx = player.x - cop.x;
    const dy = player.y - cop.y;
    const dist = Math.hypot(dx, dy);
    cop.angle = Math.atan2(dy, dx);
    if (dist > 24) {
      const speed = cop.speed * (player.inCar ? 1.15 : 1);
      cop.x += Math.cos(cop.angle) * speed * dt;
      cop.y += Math.sin(cop.angle) * speed * dt;
      resolveCollision(this.city, cop, 10);
    }
    cop.shootCooldown -= dt;
    if (!player.inCar && dist < 320 && dist > 40 && cop.shootCooldown <= 0) {
      cop.shootCooldown = 1.6;
      combat.shoot(cop.x, cop.y, cop.angle, 'police');
      if (game.audio) game.audio.shoot();
    }
  }

  draw(ctx, time, view) {
    for (const car of this.roadblocks) {
      if (car.dead) continue;
      drawCar(ctx, car, time);
    }
    for (const car of this.cars) {
      drawCar(ctx, car, time);
    }
    for (const cop of this.officers) {
      if (cop.x < view.x - 30 || cop.x > view.x + view.w + 30 || cop.y < view.y - 30 || cop.y > view.y + view.h + 30) continue;
      ctx.save();
      ctx.translate(cop.x, cop.y);
      ctx.rotate(cop.angle);
      ctx.fillStyle = 'rgba(8, 4, 18, 0.4)';
      ctx.beginPath();
      ctx.ellipse(0, 2, 11, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1d3a8a';
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f1c27d';
      ctx.beginPath();
      ctx.arc(3, 0, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#14121f';
      ctx.beginPath();
      ctx.arc(3, 0, 6.5, Math.PI * 0.6, Math.PI * 1.4);
      ctx.fill();
      ctx.fillStyle = '#22222e';
      ctx.fillRect(8, -2, 11, 3.5);
      ctx.restore();
    }
    // Helicopter with its searchlight: a soft pool of light on the ground,
    // then a clearly drawn airframe above it.
    if (this.heli) {
      const h = this.heli;
      ctx.save();
      ctx.translate(h.x, h.y);
      // Searchlight pool, subtle so it never washes the scene out.
      ctx.fillStyle = 'rgba(255, 240, 180, 0.06)';
      ctx.beginPath();
      ctx.arc(0, 0, 74, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 240, 180, 0.08)';
      ctx.beginPath();
      ctx.arc(0, 0, 42, 0, Math.PI * 2);
      ctx.fill();
      ctx.rotate(h.angle);
      // Shadow.
      ctx.fillStyle = 'rgba(8, 4, 18, 0.35)';
      ctx.beginPath();
      ctx.ellipse(4, 6, 32, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      // Tail boom and fuselage, drawn large enough to read at a glance.
      ctx.fillStyle = '#2b2f3a';
      ctx.fillRect(-42, -5, 26, 10);
      ctx.fillStyle = '#20242e';
      ctx.beginPath();
      ctx.ellipse(0, 0, 24, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      // Canopy, pink stripe, tail fin.
      ctx.fillStyle = '#7fd4ff';
      ctx.beginPath();
      ctx.ellipse(13, 0, 9, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff2e88';
      ctx.fillRect(-16, -4, 24, 8);
      ctx.fillStyle = '#ff2e88';
      ctx.fillRect(-44, -13, 6, 12);
      // Rotor: one thin spinning line, not a cross.
      ctx.strokeStyle = 'rgba(230, 230, 240, 0.85)';
      ctx.lineWidth = 3;
      const rotor = h.rotor;
      ctx.beginPath();
      ctx.moveTo(Math.cos(rotor) * -36, Math.sin(rotor) * -36);
      ctx.lineTo(Math.cos(rotor) * 36, Math.sin(rotor) * 36);
      ctx.stroke();
      // Navigation light.
      ctx.fillStyle = '#ffd319';
      ctx.beginPath();
      ctx.arc(23, 0, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
