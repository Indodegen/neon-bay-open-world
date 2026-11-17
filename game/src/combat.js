// combat.js — Fists, pistols and explosions: bullets, muzzle flashes,
// punches, car wrecks that blow up, and the particles that sell the impact.
import { PLAYER } from './config.js';

export class Combat {
  constructor() {
    this.bullets = [];
    this.particles = [];
    this.shockwaves = [];
  }

  shoot(fromX, fromY, angle, owner) {
    const bullet = {
      x: fromX + Math.cos(angle) * 22,
      y: fromY + Math.sin(angle) * 22,
      vx: Math.cos(angle) * PLAYER.bulletSpeed,
      vy: Math.sin(angle) * PLAYER.bulletSpeed,
      life: 0.9,
      owner, // 'player' | 'police'
      damage: PLAYER.pistolDamage,
    };
    this.bullets.push(bullet);
    this.spawnMuzzle(fromX + Math.cos(angle) * 24, fromY + Math.sin(angle) * 24, angle);
    return bullet;
  }

  spawnMuzzle(x, y, angle) {
    for (let i = 0; i < 5; i++) {
      this.particles.push({
        x, y,
        vx: Math.cos(angle + (Math.random() - 0.5) * 0.9) * (180 + Math.random() * 160),
        vy: Math.sin(angle + (Math.random() - 0.5) * 0.9) * (180 + Math.random() * 160),
        life: 0.16,
        maxLife: 0.16,
        size: 3 + Math.random() * 3,
        color: '#ffd319',
        gravity: 0,
        drag: 0.9,
      });
    }
  }

  spawnSparks(x, y, count, color) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 120 + Math.random() * 320;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 0.4 + Math.random() * 0.3,
        maxLife: 0.7,
        size: 2 + Math.random() * 3,
        color: color || '#ffb347',
        gravity: 0,
        drag: 0.92,
      });
    }
  }

  spawnSmoke(x, y, count) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 16,
        y: y + (Math.random() - 0.5) * 16,
        vx: (Math.random() - 0.5) * 40,
        vy: -30 - Math.random() * 50,
        life: 0.9 + Math.random() * 0.7,
        maxLife: 1.6,
        size: 7 + Math.random() * 9,
        color: 'rgba(60, 58, 70, 0.55)',
        gravity: -20,
        drag: 0.97,
      });
    }
  }

  spawnBlood(x, y) {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 180;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 0.5,
        maxLife: 0.5,
        size: 2 + Math.random() * 3,
        color: '#c0392b',
        gravity: 0,
        drag: 0.88,
      });
    }
  }

  explosion(x, y) {
    this.shockwaves.push({ x, y, radius: 8, maxRadius: 130, life: 0.5, maxLife: 0.5 });
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 380;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 0.5 + Math.random() * 0.5,
        maxLife: 1,
        size: 3 + Math.random() * 6,
        color: ['#ffd319', '#ff7e5f', '#ff2e88', '#ff9f43'][Math.floor(Math.random() * 4)],
        gravity: 0,
        drag: 0.9,
      });
    }
    this.spawnSmoke(x, y, 12);
  }

  // Punch: a short arc in front of the player that knocks a pedestrian down.
  punchArc(player) {
    return {
      x: player.x + Math.cos(player.aimAngle) * 22,
      y: player.y + Math.sin(player.aimAngle) * 22,
      radius: PLAYER.punchRange,
    };
  }

  update(dt, game) {
    // Bullets fly, hit cars, pedestrians, officers and walls.
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0;
      if (!dead) {
        dead = this.checkBulletHits(b, game);
      }
      if (dead) this.bullets.splice(i, 1);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += (p.gravity || 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
    }
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.life -= dt;
      s.radius += (s.maxRadius - s.radius) * 6 * dt;
      if (s.life <= 0) this.shockwaves.splice(i, 1);
    }
  }

  checkBulletHits(bullet, game) {
    const { city, traffic, pedestrians, police, player } = game;
    // Buildings stop bullets.
    if (city && city.buildings) {
      for (const b of city.buildings) {
        if (bullet.x > b.x && bullet.x < b.x + b.w && bullet.y > b.y && bullet.y < b.y + b.h) {
          this.spawnSparks(bullet.x, bullet.y, 4, '#c9c9d4');
          return true;
        }
      }
    }
    // Cars.
    const cars = [];
    if (traffic) cars.push(...traffic.allCars());
    if (police) cars.push(...police.cars);
    for (const car of cars) {
      if (car.dead) continue;
      const dx = bullet.x - car.x;
      const dy = bullet.y - car.y;
      const along = Math.cos(car.angle) * dx + Math.sin(car.angle) * dy;
      const side = -Math.sin(car.angle) * dx + Math.cos(car.angle) * dy;
      if (Math.abs(along) < car.length / 2 + 4 && Math.abs(side) < car.width / 2 + 4) {
        this.spawnSparks(bullet.x, bullet.y, 6);
        game.onCarShot(car, bullet);
        return true;
      }
    }
    // Pedestrians.
    if (bullet.owner === 'player' && pedestrians) {
      for (const ped of pedestrians.list) {
        if (ped.down) continue;
        if (Math.hypot(ped.x - bullet.x, ped.y - bullet.y) < 13) {
          ped.hp -= bullet.damage;
          this.spawnBlood(ped.x, ped.y);
          if (ped.hp <= 0) {
            ped.down = true;
            game.onPedestrianKilled(ped);
          } else {
            pedestrians.scare(ped.x, ped.y, 200);
          }
          return true;
        }
      }
    }
    // Police officers on foot.
    if (bullet.owner === 'player' && police) {
      for (const cop of police.officers) {
        if (cop.down) continue;
        if (Math.hypot(cop.x - bullet.x, cop.y - bullet.y) < 13) {
          cop.hp -= bullet.damage;
          this.spawnBlood(cop.x, cop.y);
          if (cop.hp <= 0) {
            cop.down = true;
            game.onOfficerKilled(cop);
          }
          return true;
        }
      }
    }
    // The player, when police shoot.
    if (bullet.owner === 'police' && player && !player.inCar) {
      if (Math.hypot(player.x - bullet.x, player.y - bullet.y) < 13) {
        player.takeDamage(bullet.damage * 0.6);
        game.onPlayerShot();
        return true;
      }
    }
    return false;
  }

  draw(ctx) {
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + alpha * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const b of this.bullets) {
      ctx.strokeStyle = '#ffe9a8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (const s of this.shockwaves) {
      const alpha = Math.max(0, s.life / s.maxLife);
      ctx.strokeStyle = `rgba(255, 211, 25, ${alpha * 0.8})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255, 46, 136, ${alpha * 0.5})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius * 0.7, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
