// Cars: boxy low-poly builds with wheels, headlights and neon underglow. Driving is arcade physics.
import * as THREE from 'three';
import { makeRng, pick, range } from './random.js';

export const CAR_COLORS = [0xff4757, 0x2ed573, 0x1e90ff, 0xffa502, 0xeccc68, 0x70a1ff, 0x5352ed, 0xff6b81];
export const CAR_NAMES = ['Sunset GT', 'Bay Cruiser', 'Palm Runner', 'Neon Coupe', 'Coral Sedan', 'Harbor Pickup'];

export function makeCarMesh(color, isPolice = false) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0x1a1a22 : color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.62; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.1),
    new THREE.MeshLambertMaterial({ color: 0x18202e }));
  cabin.position.set(0, 1.18, -0.25); g.add(cabin);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10), wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.36, z); g.add(w); wheels.push(w);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const x of [-0.6, 0.6]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), lightMat);
    l.position.set(x, 0.7, 2.22); g.add(l);
  }
  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.4), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    bar.position.set(0, 1.55, -0.25); g.add(bar);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.4), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    bar2.position.set(0, 1.55, -0.25); bar2.position.z = 0.15; g.add(bar2);
    g.userData.lightBar = [bar, bar2];
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.2, 4.42), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    stripe.position.y = 0.85; g.add(stripe);
  } else if (Math.random() < 0.5) {
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 4.8),
      new THREE.MeshBasicMaterial({ color: 0xff2e88, transparent: true, opacity: 0.25 }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.06; g.add(glow);
  }
  g.userData.wheels = wheels;
  return g;
}

export class Car {
  constructor(scene, x, z, angle, color, opts = {}) {
    this.mesh = makeCarMesh(color, opts.police);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = angle;
    scene.add(this.mesh);
    this.speed = 0; this.angle = angle;
    this.maxSpeed = opts.maxSpeed ?? 34;
    this.accel = opts.accel ?? 16;
    this.police = !!opts.police;
    this.name = opts.name ?? pick(makeRng((Math.random() * 1e9) | 0), CAR_NAMES);
    this.stolen = false;
    this.wheelSpin = 0;
  }
  update(dt, input) {
    // Arcade drive: W/S throttle, A/D steer (stronger at speed), Space handbrake.
    const fwd = input.down ? 1 : input.up ? -0.55 : 0;
    this.speed += fwd * this.accel * dt;
    if (input.brake) this.speed *= Math.max(0, 1 - 3.2 * dt);
    this.speed -= this.speed * 0.55 * dt; // drag
    this.speed = Math.max(-12, Math.min(this.maxSpeed, this.speed));
    if (Math.abs(this.speed) > 0.4) {
      const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
      this.angle += steer * 1.9 * dt * Math.sign(this.speed) * Math.min(1, Math.abs(this.speed) / 10);
    }
    const vx = Math.sin(this.angle) * this.speed, vz = Math.cos(this.angle) * this.speed;
    this.mesh.position.x += vx * dt;
    this.mesh.position.z += vz * dt;
    this.mesh.position.x = Math.max(-258, Math.min(292, this.mesh.position.x));
    this.mesh.position.z = Math.max(-258, Math.min(258, this.mesh.position.z));
    this.mesh.rotation.y = this.angle;
    this.wheelSpin += this.speed * dt * 2;
    for (const w of this.mesh.userData.wheels) w.rotation.x = this.wheelSpin;
    return { vx, vz };
  }
  // Simple AI: drive along a heading, used by traffic and police steering.
  driveAI(dt, targetAngle, targetSpeed) {
    let d = targetAngle - this.angle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.angle += Math.max(-1.6 * dt, Math.min(1.6 * dt, d));
    this.speed += (targetSpeed - this.speed) * Math.min(1, 1.4 * dt);
    this.mesh.position.x += Math.sin(this.angle) * this.speed * dt;
    this.mesh.position.z += Math.cos(this.angle) * this.speed * dt;
    this.mesh.rotation.y = this.angle;
    this.wheelSpin += this.speed * dt * 2;
    for (const w of this.mesh.userData.wheels) w.rotation.x = this.wheelSpin;
  }
  flashLights(t) {
    if (!this.mesh.userData.lightBar) return;
    const on = Math.floor(t * 6) % 2 === 0;
    this.mesh.userData.lightBar[0].material.color.setHex(on ? 0xff2222 : 0x440000);
    this.mesh.userData.lightBar[1].material.color.setHex(on ? 0x000044 : 0x2244ff);
  }
}
