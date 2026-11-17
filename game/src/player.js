// player.js — Rex Marlowe on foot: walking, sprinting, punching, shooting,
// and getting in and out of cars. Driving itself lives in vehicles.js.
import { PLAYER } from './config.js';
import { resolveCollision } from './city.js';

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.angle = -Math.PI / 2;
    this.aimAngle = -Math.PI / 2;
    this.health = PLAYER.maxHealth;
    this.armor = 0;
    this.ammo = PLAYER.pistolAmmo;
    this.ammoReserve = 96;
    this.inCar = false;
    this.car = null;
    this.punchCooldown = 0;
    this.shootCooldown = 0;
    this.reloadTimer = 0;
    this.invulnerableTimer = 0;
    this.walkPhase = 0;
    this.moving = false;
    this.dead = false;
  }

  get speed() {
    return this.inCar && this.car ? Math.abs(this.car.speed) : 0;
  }

  takeDamage(amount) {
    if (this.invulnerableTimer > 0 || this.dead) return;
    let remaining = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, remaining * 0.7);
      this.armor -= absorbed;
      remaining -= absorbed;
    }
    this.health -= remaining;
    this.invulnerableTimer = 0.35;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
    }
  }

  heal(amount) {
    this.health = Math.min(PLAYER.maxHealth, this.health + amount);
  }

  addArmor(amount) {
    this.armor = Math.min(PLAYER.maxArmor, this.armor + amount);
  }

  update(dt, input, city, aimWorld) {
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    this.invulnerableTimer = Math.max(0, this.invulnerableTimer - dt);
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const needed = PLAYER.pistolAmmo - this.ammo;
        const taken = Math.min(needed, this.ammoReserve);
        this.ammo += taken;
        this.ammoReserve -= taken;
      }
    }
    if (this.inCar) return;
    this.aimAngle = aimWorld ? Math.atan2(aimWorld.y - this.y, aimWorld.x - this.x) : this.angle;

    const moveX = input.axis('KeyA', 'KeyD') + input.axis('ArrowLeft', 'ArrowRight');
    const moveY = input.axis('KeyW', 'KeyS') + input.axis('ArrowUp', 'ArrowDown');
    const sprinting = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = sprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    this.moving = moveX !== 0 || moveY !== 0;
    if (this.moving) {
      const len = Math.hypot(moveX, moveY) || 1;
      this.x += (moveX / len) * speed * dt;
      this.y += (moveY / len) * speed * dt;
      this.angle = Math.atan2(moveY, moveX);
      this.walkPhase += dt * (sprinting ? 13 : 9);
    }
    resolveCollision(city, this, PLAYER.radius);
  }

  startReload() {
    if (this.reloadTimer > 0 || this.ammo >= PLAYER.pistolAmmo || this.ammoReserve <= 0) return false;
    this.reloadTimer = PLAYER.reloadTime;
    return true;
  }

  // Drawn top-down: shoulders, head, and the pistol when armed.
  draw(ctx, time) {
    if (this.inCar) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    const bob = this.moving ? Math.sin(this.walkPhase) * 1.5 : 0;
    // Soft white ring so the player reads at a glance, even shrunk.
    ctx.strokeStyle = 'rgba(255, 246, 236, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.stroke();
    // Shadow.
    ctx.fillStyle = 'rgba(8, 4, 18, 0.4)';
    ctx.beginPath();
    ctx.ellipse(1, 3, 12, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(this.aimAngle);
    // Jacket.
    ctx.fillStyle = '#ff2e88';
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1c1a26';
    ctx.fillRect(-2, -11, 8, 22);
    // Head.
    ctx.fillStyle = '#f1c27d';
    ctx.beginPath();
    ctx.arc(4, 0, 6.5, 0, Math.PI * 2);
    ctx.fill();
    // Hair.
    ctx.fillStyle = '#241a12';
    ctx.beginPath();
    ctx.arc(2, 0, 6.5, Math.PI * 0.5, Math.PI * 1.5);
    ctx.fill();
    // Pistol in hand, pointing where the mouse aims.
    ctx.fillStyle = '#22222e';
    ctx.fillRect(8, -2, 12, 4);
    // Muzzle flash glow right after a shot.
    if (this.shootCooldown > PLAYER.pistolCooldown - 0.06) {
      ctx.fillStyle = 'rgba(255, 211, 25, 0.9)';
      ctx.beginPath();
      ctx.arc(22, 0, 6 + Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Feet while walking.
    ctx.fillStyle = '#e8e8f0';
    ctx.beginPath();
    ctx.arc(-8, -5 + bob, 3, 0, Math.PI * 2);
    ctx.arc(-8, 5 - bob, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    void time;
  }
}
