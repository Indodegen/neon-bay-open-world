// Wanted level: stars rise with crimes, Coral Bay PD cruisers chase and ram.
// Round 7: named units with varied roles, a searchlight helicopter from 3 stars,
// roadblocks, spike strips from 4 stars, and black SWAT interceptors at 5 stars.
// Chase math and busted rules are IDENTICAL to round 6.
import * as THREE from 'three';
import { makeRng, range, pick } from './random.js';
import { Car, makeCarMesh } from './vehicles.js';

const UNIT_CALLSIGNS = ['UNIT 07', 'UNIT 12', 'UNIT 19', 'UNIT 23', 'UNIT 31', 'UNIT 44'];
const UNIT_NAMES = ['VEGA', 'RAMOS', 'ORTIZ', 'KANE', 'DUARTE', 'FROST', 'REYES', 'MARLOWE'];

export class Police {
  constructor(scene, rng) {
    this.scene = scene; this.rng = rng;
    this.wanted = 0; this.heat = 0; // heat 0..100 feeds stars
    this.cars = [];
    this.units = []; // parallel to cars: { callsign, name, role, dist }
    this.spawnTimer = 0;
    this.bustedTimer = 0;
    this.flashT = 0;
    this.spikeUsed = false;
    this.roadblocks = [];
    this.spikes = [];
    this.heli = null;
    this.heliCone = null;
    this.heliLight = null;
    this.heliRotor = null;
  }
  addHeat(n) { this.heat = Math.min(100, this.heat + n); this.syncStars(); }
  syncStars() {
    const s = this.heat <= 0 ? 0 : this.heat < 25 ? 1 : this.heat < 50 ? 2 : this.heat < 75 ? 3 : this.heat < 95 ? 4 : 5;
    if (s !== this.wanted) { this.wanted = s; if (s < 4) this.spikeUsed = false; }
  }
  // HUD data: every active unit with callsign, name, role and distance.
  unitList(playerPos) {
    const out = this.cars.map((cop, i) => {
      const u = this.units[i] || { callsign: 'UNIT ??', name: 'PD', role: 'PURSUIT' };
      return {
        callsign: u.callsign, name: u.name, status: u.role,
        dist: Math.round(Math.hypot(cop.mesh.position.x - playerPos.x, cop.mesh.position.z - playerPos.z)),
      };
    });
    if (this.heli) {
      out.push({
        callsign: 'HELI-1', name: 'AIRWATCH', status: 'SEARCHLIGHT',
        dist: Math.round(Math.hypot(this.heli.position.x - playerPos.x, this.heli.position.z - playerPos.z)),
      });
    }
    return out;
  }
  _spawnHeli() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1a1a22 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.8, 2.2), bodyMat);
    g.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.7, 0.7), bodyMat);
    tail.position.set(-4, 0.3, 0); g.add(tail);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1, 2.0),
      new THREE.MeshPhongMaterial({ color: 0x18202e, shininess: 120, specular: 0x99bbff }));
    glass.position.set(2.2, 0.2, 0); g.add(glass);
    const skid1 = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.15, 0.3), bodyMat);
    skid1.position.set(0, -1.3, 0.9); g.add(skid1);
    const skid2 = skid1.clone(); skid2.position.z = -0.9; g.add(skid2);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.12, 0.6), bodyMat);
    rotor.position.y = 1.4; g.add(rotor);
    this.heliRotor = rotor;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.3, 2.25),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    stripe.position.y = 0.2; g.add(stripe);
    const spot = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
    spot.position.set(1.5, -1.1, 0); g.add(spot);
    // Searchlight cone: apex at the heli (top), wide pool of light on the ground.
    // ConeGeometry already puts the apex at +Y, so no rotation is needed.
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(4, 26, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xfff2b0, transparent: true, opacity: 0.09,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    cone.position.y = -13;
    g.add(cone);
    this.heliCone = cone;
    const light = new THREE.SpotLight(0xfff2b0, 0, 90, 0.32, 0.55, 1.2);
    light.position.set(0, -1, 0);
    g.add(light);
    g.add(light.target);
    light.target.position.set(0, -26, 0);
    this.heliLight = light;
    g.position.set(0, 30, 0);
    this.scene.add(g);
    this.heli = g;
    // Start the orbit to the side of the player (not on the chase-camera axis):
    // a searchlight seen end-on reads as a grey wash over the whole frame.
    this.heliOrbit = Math.PI / 2;
  }
  _removeHeli() {
    if (!this.heli) return;
    this.scene.remove(this.heli);
    this.heli = null; this.heliCone = null; this.heliLight = null; this.heliRotor = null;
  }
  // Static roadblock: two cruisers parked across the road. Props only — no AI.
  setRoadblock(x, z, angle) {
    this.clearRoadblocks();
    for (const s of [-1, 1]) {
      const mesh = makeCarMesh(0x111111, true);
      const px = x + Math.cos(angle) * s * 3.2, pz = z - Math.sin(angle) * s * 3.2;
      mesh.position.set(px, 0, pz);
      mesh.rotation.y = angle + Math.PI / 2;
      this.scene.add(mesh);
      this.roadblocks.push(mesh);
    }
  }
  clearRoadblocks() {
    for (const m of this.roadblocks) this.scene.remove(m);
    this.roadblocks = [];
  }
  deploySpike(x, z, angle) {
    const strip = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(6, 0.25, 1.2),
      new THREE.MeshLambertMaterial({ color: 0x222226 }));
    strip.add(base);
    const spikeMat = new THREE.MeshLambertMaterial({ color: 0x8a8f96 });
    for (let i = -2; i <= 2; i++) {
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 6), spikeMat);
      s.position.set(i * 1.2, 0.45, 0); strip.add(s);
    }
    strip.position.set(x, 0.12, z);
    strip.rotation.y = angle;
    this.scene.add(strip);
    this.spikes.push(strip);
  }
  clearSpikes() {
    for (const s of this.spikes) this.scene.remove(s);
    this.spikes = [];
  }
  update(dt, player, audio) {
    this.flashT += dt;
    // Roadblock cruisers strobe their light bars so the block reads at night
    // — they are plain meshes, not chase cars, so they need their own flash.
    const rbOn = Math.floor(this.flashT * 8) % 2 === 0;
    for (const m of this.roadblocks) {
      const bar = m.userData.lightBar;
      if (!bar) continue;
      bar[0].material.color.setHex(rbOn ? 0xff2222 : 0x440000);
      bar[1].material.color.setHex(rbOn ? 0x000044 : 0x2244ff);
    }
    // Wanted decays slowly when the player stays clean and out of sight.
    if (this.wanted > 0) {
      this.heat = Math.max(0, this.heat - dt * 1.1);
      this.syncStars();
    }
    const wantCount = this.wanted === 0 ? 0 : Math.min(4, this.wanted + 1);
    this.spawnTimer -= dt;
    if (this.cars.length < wantCount && this.spawnTimer <= 0) {
      this.spawnTimer = 1.2;
      const p = player.inCar ? player.inCar.mesh.position : player.mesh.position;
      const a = range(this.rng, 0, Math.PI * 2);
      const swat = this.wanted >= 5 && this.cars.filter((c) => c.swat).length < 2;
      const car = new Car(this.scene, p.x + Math.sin(a) * 55, p.z + Math.cos(a) * 55, a, 0x111111,
        {
          police: true,
          maxSpeed: swat ? 40 : 30 + this.wanted * 2.5,
          accel: swat ? 26 : 20,
          name: swat ? 'SWAT INTERCEPTOR' : undefined,
        });
      car.swat = swat;
      this.cars.push(car);
      const idx = this.cars.length - 1;
      this.units.push({
        callsign: swat ? 'SWAT-1' : UNIT_CALLSIGNS[idx % UNIT_CALLSIGNS.length],
        name: swat ? 'TACTICAL' : UNIT_NAMES[Math.floor(this.rng() * UNIT_NAMES.length)],
        role: swat ? 'BOXING IN' : idx === 0 ? 'PURSUIT' : idx === 1 ? 'RAMMING' : this.wanted >= 3 ? 'ROADBLOCK' : 'PURSUIT',
      });
    }
    // Helicopter joins at 3 stars, leaves when the heat dies.
    if (this.wanted >= 3 && !this.heli) this._spawnHeli();
    if (this.wanted < 3 && this.heli) this._removeHeli();
    if (this.heli) {
      const target = player.inCar ? player.inCar.mesh.position : player.mesh.position;
      // Orbit the player instead of hovering dead overhead: the searchlight
      // cone then reads as an angled beam, not a grey wash over the camera.
      this.heliOrbit = (this.heliOrbit || 0) + dt * 0.25;
      const hx = target.x + Math.cos(this.heliOrbit) * 16;
      const hz = target.z + Math.sin(this.heliOrbit) * 16;
      this.heli.position.x += (hx - this.heli.position.x) * Math.min(1, 1.2 * dt);
      this.heli.position.z += (hz - this.heli.position.z) * Math.min(1, 1.2 * dt);
      this.heli.position.y = 28 + Math.sin(this.flashT * 0.7) * 1.5;
      this.heliRotor.rotation.y = this.flashT * 22;
      // The searchlight is the night chase's signature — brighter spot and
      // a denser cone so the beam reads from the chase camera.
      this.heliLight.intensity = 6;
      this.heliLight.target.position.set(target.x - this.heli.position.x, -28, target.z - this.heli.position.z);
      // Aim the cone at the player: its -Y (wide base) points along heli->player.
      const toPlayer = new THREE.Vector3(
        target.x - this.heli.position.x, -28, target.z - this.heli.position.z);
      const dist = toPlayer.length();
      const dir = toPlayer.normalize();
      this.heliCone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
      this.heliCone.position.copy(dir).multiplyScalar(dist / 2);
    }
    // Spike strip: once per 4-star heat, laid ahead of the player's heading.
    if (this.wanted >= 4 && !this.spikeUsed && player.inCar) {
      this.spikeUsed = true;
      const c = player.inCar;
      this.deploySpike(
        c.mesh.position.x + Math.sin(c.angle) * 30,
        c.mesh.position.z + Math.cos(c.angle) * 30,
        c.angle,
      );
    }
    // Spike hit: the car loses most of its speed and the strip is gone.
    if (player.inCar) {
      for (let i = this.spikes.length - 1; i >= 0; i--) {
        const s = this.spikes[i];
        const d = Math.hypot(s.position.x - player.inCar.mesh.position.x, s.position.z - player.inCar.mesh.position.z);
        if (d < 3) {
          player.inCar.speed *= 0.25;
          this.scene.remove(s);
          this.spikes.splice(i, 1);
          audio.crash();
        }
      }
    }
    const target = player.inCar ? player.inCar.mesh.position : player.mesh.position;
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const cop = this.cars[i];
      cop.flashLights(this.flashT);
      if (this.wanted === 0) {
        // No heat: cruiser pulls away and despawns.
        const away = Math.atan2(cop.mesh.position.x - target.x, cop.mesh.position.z - target.z);
        cop.driveAI(dt, away, 14);
        if (Math.hypot(cop.mesh.position.x - target.x, cop.mesh.position.z - target.z) > 90) {
          this.scene.remove(cop.mesh); this.cars.splice(i, 1); this.units.splice(i, 1);
        }
        continue;
      }
      const dx = target.x - cop.mesh.position.x, dz = target.z - cop.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      const role = (this.units[i] && this.units[i].role) || 'PURSUIT';
      let wantAngle = Math.atan2(dx, dz);
      let speed = cop.maxSpeed;
      if (role === 'ROADBLOCK' && dist > 18) {
        // Drive ahead of the player and park across the road.
        const hx = target.x + Math.sin(player.inCar ? player.inCar.angle : player.angle) * 26;
        const hz = target.z + Math.cos(player.inCar ? player.inCar.angle : player.angle) * 26;
        wantAngle = Math.atan2(hx - cop.mesh.position.x, hz - cop.mesh.position.z);
      } else if (role === 'ROADBLOCK') {
        speed = 0; // parked across the road, waiting
      } else if (role === 'RAMMING') {
        // Aim at where the player WILL be, not where they are.
        const lead = 0.9;
        const vx = player.inCar ? Math.sin(player.inCar.angle) * player.inCar.speed : 0;
        const vz = player.inCar ? Math.cos(player.inCar.angle) * player.inCar.speed : 0;
        wantAngle = Math.atan2(dx + vx * lead, dz + vz * lead);
      }
      cop.driveAI(dt, wantAngle, speed);
      if (dist < 3.4) {
        // Ram: shove the player's car and hurt the player on foot.
        if (player.inCar) {
          player.inCar.speed *= 0.55;
          player.inCar.mesh.position.x += (dx / (dist || 1)) * -1.2;
          player.inCar.mesh.position.z += (dz / (dist || 1)) * -1.2;
          audio.crash();
        } else {
          if (player.damage(14 * dt * 4)) { /* death handled by main */ }
          this.bustedTimer += dt;
        }
        cop.speed *= 0.4;
      }
      if (dist < 2.6 && !player.inCar) {
        // Busted on foot: cops catch you.
        this.bustedTimer += dt * 2;
      } else if (dist > 6) {
        this.bustedTimer = Math.max(0, this.bustedTimer - dt);
      }
    }
    audio.setSiren(this.wanted > 0);
    return this.bustedTimer > 2.2;
  }
  clear() {
    for (const c of this.cars) this.scene.remove(c.mesh);
    this.cars = []; this.units = []; this.wanted = 0; this.heat = 0; this.bustedTimer = 0;
    this._removeHeli(); this.clearRoadblocks(); this.clearSpikes();
    this.spikeUsed = false;
  }
}
