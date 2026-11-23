// Jax Marlow on foot: run, sprint, punch, shoot, steal cars (E) and get out (E).
// People are a generation past the old boxes: round head, hair, jacket with a
// collar, separate legs that swing, shoes, hands. API identical to round 6.
import * as THREE from 'three';
import { clamp } from './random.js';

export function makePersonMesh(shirt = 0xff6b35, pants = 0x2a3a55, skin = 0xc98d64, opts = {}) {
  const g = new THREE.Group();
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a1a22 });
  // legs: two separate legs so the walk reads as a walk, not a slide
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.26), pantsMat);
  legL.position.set(-0.14, 0.4, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.14; g.add(legR);
  // shoes
  for (const sx of [-0.14, 0.14]) {
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.38), darkMat);
    shoe.position.set(sx, 0.06, 0.04); g.add(shoe);
  }
  // torso + jacket front panel + collar
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirtMat);
  torso.position.y = 1.16; g.add(torso);
  const jacket = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.06),
    new THREE.MeshLambertMaterial({ color: opts.jacket ?? 0x22222e }));
  jacket.position.set(0, 1.16, 0.19); g.add(jacket);
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.36), darkMat);
  collar.position.y = 1.52; g.add(collar);
  // round head + hair + (Jax's cap, or a plain haircut for everyone else)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), skinMat);
  head.position.y = 1.74; g.add(head);
  const hairMat = new THREE.MeshLambertMaterial({ color: opts.hair ?? 0x2a1a12 });
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.215, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
  hair.position.y = 1.76; g.add(hair);
  // Cap is opt-in (Jax + Dex only) — pedestrians and guards wear plain hair.
  if (opts.cap === true) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.38),
      new THREE.MeshLambertMaterial({ color: opts.capColor ?? 0xff9f1c }));
    cap.position.y = 1.94; g.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.18),
      new THREE.MeshLambertMaterial({ color: opts.capColor ?? 0xff9f1c }));
    brim.position.set(0, 1.9, 0.26); g.add(brim);
  }
  // arms: cylinders with hands, they swing when walking
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.62, 8), shirtMat);
  armL.position.set(-0.4, 1.2, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.4; g.add(armR);
  const handL = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), skinMat);
  handL.position.set(-0.4, 0.86, 0); g.add(handL);
  const handR = handL.clone(); handR.position.x = 0.4; g.add(handR);
  // soft blob shadow so feet touch the ground
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.55, 14),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.03;
  g.add(blob);
  g.userData.armL = armL; g.userData.armR = armR;
  g.userData.legL = legL; g.userData.legR = legR;
  g.userData.handL = handL; g.userData.handR = handR;
  return g;
}

// Named crew looks — the same faces the dialog portraits draw.
export const CREW_LOOKS = {
  jax: { shirt: 0xff6b35, pants: 0x2a3a55, skin: 0xc98d64, opts: { cap: true, capColor: 0xff9f1c, jacket: 0x22222e } },
  rosa: { shirt: 0xff2e88, pants: 0x1a1a22, skin: 0xd8a077, opts: { cap: false, hair: 0x1a0a0a, jacket: 0x3a0a22 } },
  dex: { shirt: 0x2ed573, pants: 0x333344, skin: 0x8a6b4a, opts: { cap: true, capColor: 0x2ed573, jacket: 0x1a2a1a } },
  lucia: { shirt: 0x00e5ff, pants: 0x1a1a22, skin: 0xc98d64, opts: { cap: false, hair: 0x3a1a0a, jacket: 0x0a2a3a } },
  preacher: { shirt: 0xe8e8e8, pants: 0x1a1a22, skin: 0x5a3a22, opts: { cap: false, hair: 0x111111, jacket: 0x222222 } },
};

export class Player {
  constructor(scene) {
    this.mesh = makePersonMesh(0xff6b35, 0x2a3a55, 0xc98d64, { cap: true, capColor: 0xff9f1c, jacket: 0x22222e });
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
    // Sprint is a touch faster (9.5 → 10.5) so on-foot chases and escapes
    // keep up with the arcade pace of the driving.
    const run = input.sprint ? 10.5 : 5.2;
    if (len > 0) {
      mx /= len; mz /= len;
      const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
      const wx = (mx * cos - mz * sin), wz = (mx * sin + mz * cos);
      this.mesh.position.x += wx * run * dt;
      this.mesh.position.z += wz * run * dt;
      this.angle = Math.atan2(wx, wz);
      this.walkBob += dt * run * 1.6;
    }
    this.mesh.position.x = clamp(this.mesh.position.x, -258, 292);
    this.mesh.position.z = clamp(this.mesh.position.z, -258, 258);
    this.mesh.rotation.y = this.angle;
    this.mesh.position.y = Math.abs(Math.sin(this.walkBob)) * 0.06;
    const swing = len > 0 ? Math.sin(this.walkBob) * 0.5 : 0;
    this.mesh.userData.armL.rotation.x = swing;
    this.mesh.userData.armR.rotation.x = -swing;
    this.mesh.userData.legL.rotation.x = -swing;
    this.mesh.userData.legR.rotation.x = swing;
    if (this.punchTimer > 0) {
      this.mesh.userData.armR.rotation.x = -1.6;
    }
  }
  punch() {
    // Punch lands a little quicker (0.45s → 0.38s cooldown) so on-foot
    // combat missions flow instead of stuttering.
    if (this.punchCooldown > 0 || this.inCar) return false;
    this.punchCooldown = 0.38; this.punchTimer = 0.25;
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
  damage(n) {
    // Armor absorbs damage first; health only drops once the armor is gone.
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, n);
      this.armor -= absorbed; n -= absorbed;
    }
    this.health = Math.max(0, this.health - n); return this.health <= 0;
  }
  heal(n) { this.health = Math.min(100, this.health + n); }
}
