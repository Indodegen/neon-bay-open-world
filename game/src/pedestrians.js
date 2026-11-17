// pedestrians.js — The people of Neon Bay: they stroll the sidewalks, cross
// the streets, and run for their lives when shots ring out or cars mount
// the curb. They are also the witnesses that call the cops on a car thief.
import { Rng } from './random.js';
import { randomSidewalkPoint, resolveCollision, isRoad } from './city.js';
import { WORLD } from './config.js';

const PED_COUNT = 30;
const SHIRT_COLORS = ['#ff6b81', '#4ecdc4', '#ffe66d', '#a78bfa', '#ff9f43', '#54a0ff', '#fd79a8', '#00cec9', '#e17055', '#fdcb6e'];
const SKIN_COLORS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];

export class Pedestrians {
  constructor(city) {
    this.city = city;
    this.rng = new Rng(4242);
    this.list = [];
  }

  populate() {
    for (let i = 0; i < PED_COUNT; i++) this.spawn(true);
  }

  spawn(anywhere) {
    const spot = randomSidewalkPoint(this.city, this.rng);
    const ped = {
      x: spot.x,
      y: spot.y,
      angle: this.rng.range(0, Math.PI * 2),
      speed: this.rng.range(38, 72),
      hp: 30,
      shirt: this.rng.pick(SHIRT_COLORS),
      skin: this.rng.pick(SKIN_COLORS),
      state: 'walk', // walk | flee | down | cross
      fleeX: 0,
      fleeY: 0,
      fleeTimer: 0,
      targetX: spot.x,
      targetY: spot.y,
      walkPhase: this.rng.range(0, Math.PI * 2),
      retargetIn: this.rng.range(1, 4),
      down: false,
    };
    this.pickNewTarget(ped);
    this.list.push(ped);
    return ped;
  }

  pickNewTarget(ped) {
    const spot = randomSidewalkPoint(this.city, this.rng);
    ped.targetX = spot.x;
    ped.targetY = spot.y;
    ped.retargetIn = this.rng.range(3, 9);
  }

  // A loud event (gunshot, crash, explosion) sends everyone nearby running.
  scare(x, y, radius) {
    for (const ped of this.list) {
      if (ped.down) continue;
      const d = Math.hypot(ped.x - x, ped.y - y);
      if (d < radius) {
        ped.state = 'flee';
        const away = Math.atan2(ped.y - y, ped.x - x);
        ped.fleeX = ped.x + Math.cos(away) * 320;
        ped.fleeY = ped.y + Math.sin(away) * 320;
        ped.fleeTimer = this.rng.range(2.5, 5);
      }
    }
  }

  update(dt, time, playerPos, danger) {
    if (this.list.length < PED_COUNT) this.spawn();
    for (const ped of this.list) {
      if (ped.down) continue;
      ped.walkPhase += dt * (ped.state === 'flee' ? 14 : 7);
      if (ped.state === 'flee') {
        ped.fleeTimer -= dt;
        const dx = ped.fleeX - ped.x;
        const dy = ped.fleeY - ped.y;
        const d = Math.hypot(dx, dy);
        if (d > 12 && ped.fleeTimer > 0) {
          ped.angle = Math.atan2(dy, dx);
          ped.x += Math.cos(ped.angle) * 165 * dt;
          ped.y += Math.sin(ped.angle) * 165 * dt;
        } else {
          ped.state = 'walk';
          this.pickNewTarget(ped);
        }
      } else {
        ped.retargetIn -= dt;
        const dx = ped.targetX - ped.x;
        const dy = ped.targetY - ped.y;
        const d = Math.hypot(dx, dy);
        if (d < 16 || ped.retargetIn <= 0) {
          this.pickNewTarget(ped);
        } else {
          ped.angle = Math.atan2(dy, dx);
          ped.x += Math.cos(ped.angle) * ped.speed * dt;
          ped.y += Math.sin(ped.angle) * ped.speed * dt;
        }
      }
      // Stay out of buildings and water, and off the middle of the road
      // unless they are crossing it.
      resolveCollision(this.city, ped, 10);
      if (isRoad(this.city, ped.x, ped.y) && ped.state !== 'flee') {
        // Hurry across: double speed while on the asphalt.
        ped.x += Math.cos(ped.angle) * ped.speed * dt;
        ped.y += Math.sin(ped.angle) * ped.speed * dt;
      }
      ped.x = Math.max(30, Math.min(WORLD.width - 30, ped.x));
      ped.y = Math.max(30, Math.min(WORLD.height - 30, ped.y));
    }
    void time;
    void playerPos;
    void danger;
  }

  // The nearest pedestrian who can see a crime happen.
  nearestWitness(x, y, radius) {
    let best = null;
    let bestDist = radius;
    for (const ped of this.list) {
      if (ped.down) continue;
      const d = Math.hypot(ped.x - x, ped.y - y);
      if (d < bestDist) {
        best = ped;
        bestDist = d;
      }
    }
    return best;
  }

  draw(ctx, time, view) {
    for (const ped of this.list) {
      if (ped.x < view.x - 30 || ped.x > view.x + view.w + 30 || ped.y < view.y - 30 || ped.y > view.y + view.h + 30) continue;
      ctx.save();
      ctx.translate(ped.x, ped.y);
      if (ped.down) {
        // Lying flat after a bad day.
        ctx.rotate(ped.angle + Math.PI / 2);
        ctx.fillStyle = ped.shirt;
        ctx.beginPath();
        ctx.ellipse(0, 0, 13, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ped.skin;
        ctx.beginPath();
        ctx.arc(14, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }
      const bob = Math.sin(ped.walkPhase) * 1.5;
      ctx.rotate(ped.angle);
      // Shadow.
      ctx.fillStyle = 'rgba(8, 4, 18, 0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 2, 10, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      // Body and head, top-down.
      ctx.fillStyle = ped.shirt;
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ped.skin;
      ctx.beginPath();
      ctx.arc(3, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      // Walking feet.
      ctx.fillStyle = '#1c1a26';
      ctx.beginPath();
      ctx.arc(-6, -4 + bob, 2.5, 0, Math.PI * 2);
      ctx.arc(-6, 4 - bob, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    void time;
  }
}
