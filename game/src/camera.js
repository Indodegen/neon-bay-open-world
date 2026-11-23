// Third-person follow camera: smooth chase behind the player or car, mouse-drag orbit.
import * as THREE from 'three';

export class FollowCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0; this.pitch = 0.28;
    this.pos = new THREE.Vector3(0, 8, 16);
    // Round-6 defaults. Shots override with setFraming for a lower, closer
    // chase cam; locked stops update() so staged shots keep their camera.
    // Defaults sit a touch lower and closer than round 6 (13 → 12, 5.2 → 4.8)
    // so the car fills more of the frame in normal play, like the staged shots.
    this.dist = 12; this.height = 4.8;
    this.locked = false;
  }
  setFraming(dist, height, pitch) {
    this.dist = dist; this.height = height;
    if (pitch !== undefined) this.pitch = pitch;
  }
  resetFraming() { this.dist = 12; this.height = 4.8; this.pitch = 0.28; }
  update(dt, input, targetPos, targetAngle, inCar) {
    if (this.locked) return;
    const drag = input.consumeDrag();
    this.yaw -= drag.dx * 0.005;
    // Wider pitch range (0.06..0.95) + snappier yaw ease (1.6 → 2.0): the
    // camera settles behind the car faster after a turn.
    this.pitch = Math.max(0.06, Math.min(0.95, this.pitch + drag.dy * 0.003));
    if (!input.dragging) {
      // Ease the camera behind the direction of travel.
      let d = targetAngle - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, 2.0 * dt);
    }
    const dist = inCar ? this.dist : 9;
    const height = inCar ? this.height : 4.2;
    const cx = targetPos.x - Math.sin(this.yaw) * dist * Math.cos(this.pitch);
    const cz = targetPos.z - Math.cos(this.yaw) * dist * Math.cos(this.pitch);
    const cy = targetPos.y + height + Math.sin(this.pitch) * dist * 0.4;
    const k = Math.min(1, 8 * dt);
    this.pos.x += (cx - this.pos.x) * k;
    this.pos.y += (cy - this.pos.y) * k;
    this.pos.z += (cz - this.pos.z) * k;
    this.camera.position.copy(this.pos);
    this.camera.lookAt(targetPos.x, targetPos.y + (inCar ? 1.6 : 1.4), targetPos.z);
  }
  snap(targetPos, targetAngle, inCar) {
    this.yaw = targetAngle;
    const dist = inCar ? this.dist : 9;
    const height = inCar ? this.height : 4.2;
    this.pos.set(
      targetPos.x - Math.sin(this.yaw) * dist,
      targetPos.y + height,
      targetPos.z - Math.cos(this.yaw) * dist,
    );
    this.camera.position.copy(this.pos);
    this.camera.lookAt(targetPos.x, targetPos.y + 1.5, targetPos.z);
  }
  // Place the camera freely (garage / title shots) and freeze the follow cam.
  placeAt(x, y, z, lx, ly, lz) {
    this.locked = true;
    this.pos.set(x, y, z);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(lx, ly, lz);
  }
}
