// traffic.js — The living streets: parked cars to steal and traffic that
// drives the grid, brakes for the car ahead, and honks when it gets stuck.
import { createCar, driveCar, drawCar } from './vehicles.js';
import { randomRoadPoint } from './city.js';
import { Rng } from './random.js';
import { WORLD } from './config.js';

const TRAFFIC_COUNT = 15;
const PARKED_COUNT = 16;

export class Traffic {
  constructor(city) {
    this.city = city;
    this.rng = new Rng(777);
    this.cars = [];
    this.parked = [];
    this.playerCar = null;
  }

  populate() {
    for (let i = 0; i < PARKED_COUNT; i++) {
      this.parked.push(this.makeParkedCar());
    }
    for (let i = 0; i < TRAFFIC_COUNT; i++) this.spawnTrafficCar(true);
  }

  makeParkedCar() {
    const rng = this.rng;
    const type = rng.pick(['sedan', 'sedan', 'sports', 'van', 'truck', 'taxi']);
    const vertical = rng.chance(0.5);
    let x, y, angle;
    if (vertical) {
      const rx = rng.pick(this.city.roadsV);
      x = rx + (rng.chance(0.5) ? -1 : 1) * 36;
      y = rng.range(120, 2280);
      angle = rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
    } else {
      const ry = rng.pick(this.city.roadsH);
      x = rng.range(420, 3500);
      y = ry + (rng.chance(0.5) ? -1 : 1) * 36;
      angle = rng.chance(0.5) ? 0 : Math.PI;
    }
    const car = createCar(type, x, y, angle, rng);
    car.parked = true;
    return car;
  }

  spawnTrafficCar(anywhere) {
    const spot = randomRoadPoint(this.city, this.rng);
    const type = this.rng.pick(['sedan', 'sedan', 'sedan', 'taxi', 'van', 'truck', 'sports']);
    const car = createCar(type, spot.x, spot.y, spot.angle, this.rng);
    car.driver = 'traffic';
    car.speed = this.rng.range(140, 260);
    car.cruiseSpeed = this.rng.range(150, 280);
    car.targetAngle = spot.angle;
    car.nextTurnIn = this.rng.range(200, 700);
    car.stuckTimer = 0;
    this.cars.push(car);
    return car;
  }

  // A traffic car is "ahead" when it sits in front of me on my lane.
  carAhead(me) {
    let nearest = null;
    let nearestDist = 95;
    for (const other of this.allCars()) {
      if (other === me || other.dead) continue;
      const dx = other.x - me.x;
      const dy = other.y - me.y;
      const dist = Math.hypot(dx, dy);
      if (dist > nearestDist) continue;
      const forward = Math.cos(me.angle) * dx + Math.sin(me.angle) * dy;
      if (forward < 0) continue;
      const side = Math.abs(-Math.sin(me.angle) * dx + Math.cos(me.angle) * dy);
      if (side > 26) continue;
      nearest = other;
      nearestDist = dist;
    }
    return nearest;
  }

  allCars() {
    const list = this.cars.concat(this.parked);
    if (this.playerCar) list.push(this.playerCar);
    return list;
  }

  update(dt, player, policeCars, onNearMiss, audio) {
    // Keep the streets full: respawn traffic far from the player.
    if (this.cars.length < TRAFFIC_COUNT) {
      const spot = randomRoadPoint(this.city, this.rng);
      if (Math.hypot(spot.x - player.x, spot.y - player.y) > 700) this.spawnTrafficCar();
    }
    for (const car of this.cars) {
      if (car.dead) continue;
      this.updateTrafficCar(car, dt, player, audio);
    }
    // Remove wrecks once they have burned out, and cars that drifted off.
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      if (c.dead) {
        c.burnTimer = (c.burnTimer || 6) - dt;
        if (c.burnTimer <= 0) this.cars.splice(i, 1);
        continue;
      }
      if (c.x < -60 || c.x > WORLD.width + 60 || c.y < -60 || c.y > WORLD.height + 60) {
        this.cars.splice(i, 1);
      }
    }
    this.checkNearMisses(player, onNearMiss);
  }

  updateTrafficCar(car, dt, player, audio) {
    car.nextTurnIn -= Math.abs(car.speed) * dt;
    // At an intersection, sometimes turn, sometimes carry on straight.
    if (car.nextTurnIn <= 0) {
      const onVertical = Math.abs(Math.sin(car.angle)) > 0.7;
      const turn = this.rng.pick([-Math.PI / 2, 0, Math.PI / 2, 0]);
      car.targetAngle = car.angle + turn;
      car.nextTurnIn = this.rng.range(260, 720);
      void onVertical;
    }
    // Steer toward the target angle.
    let diff = car.targetAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 2.2));
    const ahead = this.carAhead(car);
    // Brake for a pedestrian crossing right in front, too.
    let pedAhead = null;
    if (this.peds) {
      for (const ped of this.peds.list) {
        if (ped.down) continue;
        const dx = ped.x - car.x;
        const dy = ped.y - car.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 70 && Math.cos(car.angle) * dx + Math.sin(car.angle) * dy > 0) {
          pedAhead = ped;
          break;
        }
      }
    }
    let throttle = 1;
    if (ahead || pedAhead) {
      throttle = 0;
      car.speed -= 300 * dt;
      car.stuckTimer += dt;
      if (car.stuckTimer > 2.5 && car.honkCooldown <= 0 && audio) {
        audio.honk();
        car.honkCooldown = 6;
      }
    } else {
      car.stuckTimer = 0;
      if (car.speed < car.cruiseSpeed) throttle = 1;
      else throttle = 0;
    }
    car.honkCooldown = Math.max(0, car.honkCooldown - dt);
    // Panic: swerve away from a fast player car bearing down on them.
    const playerCar = this.playerCar;
    if (playerCar && Math.abs(playerCar.speed) > 260) {
      const d = Math.hypot(playerCar.x - car.x, playerCar.y - car.y);
      if (d < 160) throttle = 0.4;
    }
    driveCar(car, this.city, throttle, steer, false, dt, null);
    // Nudge back onto the road centre if it drifted onto the sidewalk.
    const half = 48;
    const onVertical = Math.abs(Math.sin(car.angle)) > 0.7;
    if (onVertical) {
      const nearestRoad = this.city.roadsV.reduce((a, b) => (Math.abs(b - car.x) < Math.abs(a - car.x) ? b : a));
      const lane = nearestRoad + (Math.sin(car.angle) > 0 ? -22 : 22);
      car.x += (lane - car.x) * 0.25 * dt;
      void half;
    } else {
      const nearestRoad = this.city.roadsH.reduce((a, b) => (Math.abs(b - car.y) < Math.abs(a - car.y) ? b : a));
      const lane = nearestRoad + (Math.cos(car.angle) > 0 ? -22 : 22);
      car.y += (lane - car.y) * 0.25 * dt;
    }
  }

  checkNearMisses(player, onNearMiss) {
    if (!player.inCar || !player.car || !onNearMiss) return;
    const myCar = player.car;
    if (Math.abs(myCar.speed) < 300) return;
    for (const other of this.cars) {
      if (other.dead) continue;
      const d = Math.hypot(other.x - myCar.x, other.y - myCar.y);
      if (d < 78 && !other.nearMissed) {
        other.nearMissed = true;
        onNearMiss();
      } else if (d > 160) {
        other.nearMissed = false;
      }
    }
  }

  draw(ctx, time, view) {
    for (const car of this.parked) {
      if (car.dead) continue;
      if (car.x < view.x - 80 || car.x > view.x + view.w + 80 || car.y < view.y - 80 || car.y > view.y + view.h + 80) continue;
      drawCar(ctx, car, time);
    }
    for (const car of this.cars) {
      if (car.x < view.x - 80 || car.x > view.x + view.w + 80 || car.y < view.y - 80 || car.y > view.y + view.h + 80) continue;
      drawCar(ctx, car, time);
    }
  }
}
