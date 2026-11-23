// Cars: smoother low-poly builds — sloped hood/trunk, glass cabin, bumpers,
// spoiler, hubcaps, headlight beams + taillight strips that actually glow at
// night, and a soft blob shadow grounding every car. API identical to round 6.
import * as THREE from 'three';
import { makeRng, pick, range } from './random.js';

export const CAR_COLORS = [0xff4757, 0x2ed573, 0x1e90ff, 0xffa502, 0xeccc68, 0x70a1ff, 0x5352ed, 0xff6b81];
export const CAR_NAMES = ['Sunset GT', 'Bay Cruiser', 'Palm Runner', 'Neon Coupe', 'Coral Sedan', 'Harbor Pickup'];

function glowTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.4, 'rgba(255,255,255,0.4)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const GLOW_TEX = glowTexture();

function glowSprite(color, scale, opacity = 0.85) {
  const m = new THREE.SpriteMaterial({
    map: GLOW_TEX, color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const s = new THREE.Sprite(m);
  s.scale.set(scale, scale, 1);
  return s;
}

export function makeCarMesh(color, isPolice = false, opts = {}) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshPhongMaterial({
    color: isPolice ? 0x1a1a22 : color, shininess: 70, specular: 0x666677,
  });
  // children[0] MUST stay the body: shots.js paints it via children[0].
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.55, 4.4), bodyMat);
  body.position.y = 0.6; body.castShadow = true; g.add(body);
  // sloped hood + trunk so the silhouette stops reading as a plain box
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 1.1), bodyMat);
  hood.position.set(0, 0.9, 1.75); hood.rotation.x = 0.14; g.add(hood);
  const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 0.9), bodyMat);
  trunk.position.set(0, 0.9, -1.85); trunk.rotation.x = -0.12; g.add(trunk);
  // glass cabin + sloped windshield
  const glassMat = new THREE.MeshPhongMaterial({ color: 0x18202e, shininess: 120, specular: 0x99bbff });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 2.0), glassMat);
  cabin.position.set(0, 1.12, -0.25); g.add(cabin);
  const shield = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.08, 0.9), glassMat);
  shield.position.set(0, 1.05, 0.85); shield.rotation.x = 0.5; g.add(shield);
  // bumpers + side skirts
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1c1c22 });
  const bumpF = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.28, 0.35), darkMat);
  bumpF.position.set(0, 0.42, 2.2); g.add(bumpF);
  const bumpR = bumpF.clone(); bumpR.position.z = -2.2; g.add(bumpR);
  for (const sx of [-1, 1]) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 3.2), darkMat);
    skirt.position.set(sx * 1.02, 0.38, 0); g.add(skirt);
  }
  // wheels: more segments + hubcaps
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const hubMat = new THREE.MeshLambertMaterial({ color: opts.hero ? 0xd8a02a : 0x8a8f96 });
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.3, 14), wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.36, z); w.castShadow = true; g.add(w); wheels.push(w);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.32, 10), hubMat);
    hub.rotation.z = Math.PI / 2; hub.position.set(x, 0.36, z); g.add(hub);
  }
  // headlights: lenses + glow + beam cones (beams + glows toggle with
  // setLights — off in daylight, on at night). Glow sprites start hidden.
  const beams = [];
  const headGlows = [];
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const x of [-0.6, 0.6]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.1), lightMat);
    l.position.set(x, 0.68, 2.22); g.add(l);
    const gl = glowSprite(0xfff2b0, 2.4, 1.0);
    gl.position.set(x, 0.68, 2.35); gl.visible = false; g.add(gl); headGlows.push(gl);
    // Beam cone: apex sits at the lamp, wide end falls forward-down onto the road.
    // (rotation.x = -PI/2 + tilt maps +Y to back-up, so the base lands forward-down.)
    // Bright + long on purpose — at night the beams are half the car's readability.
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(1.9, 13, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xfff2b0, transparent: true, opacity: 0.24,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    beam.rotation.x = -Math.PI / 2 + 0.12;
    beam.position.set(x, 0.55, 8.8);
    beam.visible = false;
    g.add(beam); beams.push(beam);
  }
  // taillight strip: full-width red bar + glow
  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.14, 0.08),
    new THREE.MeshBasicMaterial({ color: 0xff2233 }));
  tail.position.set(0, 0.72, -2.23); g.add(tail);
  const tailGlow = glowSprite(0xff2233, 2.6, 0.8);
  tailGlow.position.set(0, 0.72, -2.35); g.add(tailGlow);
  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.4), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    bar.position.set(0, 1.5, -0.25); g.add(bar);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.4), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    bar2.position.set(0, 1.5, -0.25); bar2.position.z = 0.15; g.add(bar2);
    g.userData.lightBar = [bar, bar2];
    const barGlow = glowSprite(0xaa44ff, 2.6, 0.6);
    barGlow.position.set(0, 1.55, -0.05); g.add(barGlow);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.2, 4.42), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    stripe.position.y = 0.85; g.add(stripe);
    // push bar on the nose
    const push = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.25), darkMat);
    push.position.set(0, 0.55, 2.35); g.add(push);
  } else if (opts.hero || Math.random() < 0.5) {
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 4.8),
      new THREE.MeshBasicMaterial({ color: opts.hero ? 0xff2e88 : 0x00e5ff, transparent: true, opacity: 0.28 }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.06; g.add(glow);
  }
  if (opts.hero) {
    // Sunset GT hero car: rear spoiler + gold rims + lower stance
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.5), darkMat);
    spoiler.position.set(0, 1.35, -2.05); g.add(spoiler);
    for (const sx of [-0.8, 0.8]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.4), darkMat);
      fin.position.set(sx, 1.15, -2.05); g.add(fin);
    }
  }
  // soft blob shadow grounding the car
  const blob = new THREE.Mesh(new THREE.CircleGeometry(2.4, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.scale.set(1, 1.9, 1); blob.position.y = 0.04;
  g.add(blob);
  g.userData.wheels = wheels;
  g.userData.beams = beams;
  g.userData.headGlows = headGlows;
  return g;
}

export class Car {
  constructor(scene, x, z, angle, color, opts = {}) {
    this.mesh = makeCarMesh(color, opts.police, opts);
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
    this.hero = !!opts.hero;
  }
  setLights(on) {
    for (const b of this.mesh.userData.beams || []) b.visible = on;
    for (const gl of this.mesh.userData.headGlows || []) gl.visible = on;
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
    // Faster strobe (8 Hz) so the red/blue reads in a still frame.
    const on = Math.floor(t * 8) % 2 === 0;
    this.mesh.userData.lightBar[0].material.color.setHex(on ? 0xff2222 : 0x440000);
    this.mesh.userData.lightBar[1].material.color.setHex(on ? 0x000044 : 0x2244ff);
  }
}
