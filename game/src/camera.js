// Third-person follow camera: smooth chase behind the player or car, mouse-drag orbit.
import * as THREE from 'three';

export class FollowCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0; this.pitch = 0.32;
    this.pos = new THREE.Vector3(0, 8, 16);
  }
  update(dt, input, targetPos, targetAngle, inCar) {
    const drag = input.consumeDrag();
    this.yaw -= drag.dx * 0.005;
    this.pitch = Math.max(0.08, Math.min(0.9, this.pitch + drag.dy * 0.003));
    if (!input.dragging) {
      // Ease the camera behind the direction of travel.
      let d = targetAngle - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, 1.6 * dt);
    }
    const dist = inCar ? 13 : 9;
    const height = inCar ? 5.2 : 4.2;
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
    const dist = inCar ? 13 : 9;
    this.pos.set(
      targetPos.x - Math.sin(this.yaw) * dist,
      targetPos.y + (inCar ? 5.2 : 4.2),
      targetPos.z - Math.cos(this.yaw) * dist,
    );
    this.camera.position.copy(this.pos);
    this.camera.lookAt(targetPos.x, targetPos.y + 1.5, targetPos.z);
  }
}
