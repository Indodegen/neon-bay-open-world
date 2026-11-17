// camera.js — The camera that follows Rex: smooth lerp, a wider view in a
// car, and shake when things explode or crash.
import { WORLD } from './config.js';

export class Camera {
  constructor(screenW, screenH) {
    this.x = WORLD.width / 2;
    this.y = WORLD.height / 2;
    this.zoom = 1;
    this.targetZoom = 1;
    this.shake = 0;
    this.screenW = screenW;
    this.screenH = screenH;
  }

  resize(screenW, screenH) {
    this.screenW = screenW;
    this.screenH = screenH;
  }

  snapTo(x, y) {
    this.x = x;
    this.y = y;
  }

  addShake(amount) {
    this.shake = Math.min(22, this.shake + amount);
  }

  update(dt, targetX, targetY, inCar) {
    this.targetZoom = inCar ? 0.82 : 1.0;
    this.zoom += (this.targetZoom - this.zoom) * Math.min(1, dt * 2.5);
    const lookAhead = inCar ? 46 : 18;
    const tx = targetX;
    const ty = targetY;
    void lookAhead;
    this.x += (tx - this.x) * Math.min(1, dt * 5);
    this.y += (ty - this.y) * Math.min(1, dt * 5);
    const halfW = this.screenW / 2 / this.zoom;
    const halfH = this.screenH / 2 / this.zoom;
    this.x = Math.max(halfW - 120, Math.min(WORLD.width - halfW + 120, this.x));
    this.y = Math.max(halfH - 120, Math.min(WORLD.height - halfH + 120, this.y));
    this.shake = Math.max(0, this.shake - dt * 34);
  }

  // The world rectangle currently on screen, for culling.
  viewRect() {
    const w = this.screenW / this.zoom;
    const h = this.screenH / this.zoom;
    return { x: this.x - w / 2, y: this.y - h / 2, w, h };
  }

  apply(ctx) {
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    ctx.setTransform(this.zoom, 0, 0, this.zoom, 0, 0);
    ctx.translate(this.screenW / 2 / this.zoom + sx, this.screenH / 2 / this.zoom + sy);
    ctx.translate(-this.x, -this.y);
  }

  reset(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // World position under a screen pixel (for mouse aiming).
  screenToWorld(sx, sy) {
    return {
      x: this.x + (sx - this.screenW / 2) / this.zoom,
      y: this.y + (sy - this.screenH / 2) / this.zoom,
    };
  }
}
