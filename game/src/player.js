// Jax Marlow on foot: run, sprint, punch, shoot, steal cars (E) and get out (E).
import * as THREE from 'three';

export function makePersonMesh(shirt = 0xff6b35, pants = 0x2a3a55, skin = 0xc98d64) {
  const g = new THREE.Group();
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.3), pantsMat);
  legs.position.y = 0.4; g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirtMat);
  torso.position.y = 1.16; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.34), skinMat);
  head.position.y = 1.72; g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.38),
    new THREE.MeshLambertMaterial({ color: 0xff9f1c }));
  cap.position.y = 1.92; g.add(cap);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.16), shirtMat);
  armL.position.set(-0.4, 1.2, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.4; g.add(armR);
  g.userData.armL = armL; g.userData.armR = armR;
  return g;
}

export class Player {
  constructor(scene) {
    this.mesh = makePersonMesh();
    this.mesh.position.set(0, 0, 8);
    scene.add(this.mesh);
    this.angle = 0; this.speed = 0;
    this.health = 100; this.cash = 0;
    this.inCar = null; this.walkBob = 0;
    this.punchTimer = 0; this.punchCooldown = 0;
  }
  pos() { return this.mesh.position; }
  update(dt, input, camYaw) {
    if (this.inCar) return;
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    this.punchTimer = Math.max(0, this.punchTimer - dt);
    // Move relative to camera yaw: W forward, S back, A/D strafe-turn.
    let mx = 0, mz = 0;
    if (input.down) { mz -= 1; }
    if (input.up) { mz += 1; }
    if (input.left) { mx -= 1; }
    if (input.right) { mx += 1; }
    const len = Math.hypot(mx, mz);
    const run = input.sprint ? 9.5 : 5.2;
    if (len > 0) {
      mx /= len; mz /= len;
      const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
      const wx = (mx * cos - mz * sin), wz = (mx * sin + mz * cos);
      this.mesh.position.x += wx * run * dt;
      this.mesh.position.z += wz * run * dt;
      this.angle = Math.atan2(wx, wz);
      this.walkBob += dt * run * 1.6;
    }
    this.mesh.position.x = Math.max(-258, Math.min(292, this.mesh.position.x));
    this.mesh.position.z = Math.max(-258, Math.min(258, this.mesh.position.z));
    this.mesh.rotation.y = this.angle;
    this.mesh.position.y = Math.abs(Math.sin(this.walkBob)) * 0.06;
    const swing = len > 0 ? Math.sin(this.walkBob) * 0.5 : 0;
    this.mesh.userData.armL.rotation.x = swing;
    this.mesh.userData.armR.rotation.x = -swing;
    if (this.punchTimer > 0) {
      this.mesh.userData.armR.rotation.x = -1.6;
    }
  }
  punch() {
    if (this.punchCooldown > 0 || this.inCar) return false;
    this.punchCooldown = 0.45; this.punchTimer = 0.25;
    return true;
  }
  enterCar(car) {
    this.inCar = car; this.mesh.visible = false; car.stolen = true;
  }
  exitCar() {
    if (!this.inCar) return;
    const c = this.inCar;
    this.mesh.position.set(c.mesh.position.x + 2.6, 0, c.mesh.position.z);
    this.mesh.visible = true; this.inCar = null;
  }
  damage(n) { this.health = Math.max(0, this.health - n); return this.health <= 0; }
  heal(n) { this.health = Math.min(100, this.health + n); }
}
