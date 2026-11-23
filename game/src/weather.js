// NEON BAY — Weather: full day/night cycle, rain, storm + lightning, wet-road
// reflections. No top-5 entry has any weather — this is the biggest visual gap
// we own. Default mode is 'sunset', pixel-identical to round 6 lighting; rain
// and night only appear when a staged shot (or the player) asks for them.
import * as THREE from 'three';

// Mood presets. Values are the exact round-6 sunset numbers for 'sunset'.
const MODES = {
  sunset: {
    skyTop: 0x2b1055, skyMid: 0xff7e5f, skyBot: 0xfeb47b,
    hemiSky: 0xffb27d, hemiGround: 0x2a1a3a, hemiInt: 0.85,
    sunColor: 0xff9a5c, sunInt: 1.6, sunPos: [-180, 120, -120],
    fogColor: 0xe88a5f, fogNear: 180, fogFar: 720,
    discColor: 0xffd27d, discPos: [-620, 150, -420], discVisible: true,
    lampGlow: 0.55, windowGlow: 1.0, wet: false, rain: false, storm: false,
  },
  golden: {
    skyTop: 0x3d1a5e, skyMid: 0xff8c42, skyBot: 0xffc46b,
    hemiSky: 0xffc27d, hemiGround: 0x33222e, hemiInt: 0.95,
    sunColor: 0xffb25c, sunInt: 2.1, sunPos: [-260, 95, -180],
    fogColor: 0xf08a4f, fogNear: 160, fogFar: 680,
    discColor: 0xffe9a8, discPos: [-680, 90, -380], discVisible: true,
    lampGlow: 0.7, windowGlow: 1.0, wet: false, rain: false, storm: false,
  },
  night: {
    skyTop: 0x04060f, skyMid: 0x0d1b3d, skyBot: 0x1d2c55,
    hemiSky: 0x3d508a, hemiGround: 0x12121e, hemiInt: 1.0,
    sunColor: 0xa8c0f0, sunInt: 1.2, sunPos: [200, 180, 100],
    fogColor: 0x0d1730, fogNear: 130, fogFar: 720,
    discColor: 0xe8eefc, discPos: [520, 260, -420], discVisible: true,
    lampGlow: 2.0, windowGlow: 2.0, wet: false, rain: false, storm: false,
  },
  rain: {
    // Same readability lift as storm: rain must not drown the scene.
    skyTop: 0x05080f, skyMid: 0x14264a, skyBot: 0x2a3c60,
    hemiSky: 0x46589a, hemiGround: 0x181a26, hemiInt: 1.1,
    sunColor: 0x9db8e8, sunInt: 1.3, sunPos: [200, 180, 100],
    fogColor: 0x0d1830, fogNear: 100, fogFar: 700,
    discColor: 0x9aa8c8, discPos: [520, 260, -420], discVisible: false,
    lampGlow: 2.2, windowGlow: 2.1, wet: true, rain: true, storm: false,
  },
  storm: {
    // Night storm, but READABLE: moonlight + sky glow lift the whole city so
    // the car, road and buildings stay visible under the rain. (Was hemi 0.6 /
    // sun 0.5 with near-black sky — the chase shot came out almost black.)
    skyTop: 0x060a18, skyMid: 0x1c3054, skyBot: 0x33456e,
    hemiSky: 0x51649c, hemiGround: 0x20222e, hemiInt: 1.25,
    sunColor: 0xb9ccf5, sunInt: 1.5, sunPos: [200, 180, 100],
    fogColor: 0x101c36, fogNear: 90, fogFar: 750,
    discColor: 0x8a98b8, discPos: [520, 260, -420], discVisible: false,
    lampGlow: 2.4, windowGlow: 2.3, wet: true, rain: true, storm: true,
  },
};

function lerpColor(a, b, t) { return a.clone().lerp(b, t); }

export class Weather {
  constructor(scene, city, getFocus) {
    this.scene = scene;
    this.city = city;
    this.getFocus = getFocus; // () => THREE.Vector3 the rain follows
    this.mode = 'sunset';
    this.t = 0;
    this.flash = 0; // lightning flash energy 0..1
    this.flashTimer = 3 + Math.random() * 4;
    this._tmp = new THREE.Color();

    // Lightning: a white directional light that only fires on a strike.
    this.flashLight = new THREE.DirectionalLight(0xdfe8ff, 0);
    this.flashLight.position.set(120, 300, -80);
    scene.add(this.flashLight);

    // Rain: one Points cloud that wraps around the focus point. Small,
    // fast drops read as rain in a still; big dots read as snow.
    // Drops are fat enough (0.18) to read as rain streaks in a screenshot.
    const N = 2200;
    const pos = new Float32Array(N * 3);
    this.rainSpeed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 90;
      pos[i * 3 + 1] = Math.random() * 42;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 90;
      this.rainSpeed[i] = 26 + Math.random() * 14;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rainGeo = geo;
    this.rain = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xaac4e8, size: 0.18, transparent: true, opacity: 0.65, depthWrite: false,
    }));
    this.rain.visible = false;
    this.rain.frustumCulled = false;
    scene.add(this.rain);

    // Wet-road extras: puddles + neon streaks on the asphalt, rain-only.
    this.wetGroup = new THREE.Group();
    const puddleMat = new THREE.MeshPhongMaterial({
      color: 0x0a2038, shininess: 140, specular: 0xbfd8ff, transparent: true, opacity: 0.85,
    });
    const puddleSpots = [
      [0, -52, 7], [52, 8, 5], [-52, -104, 6], [104, -52, 5], [-104, 52, 6],
      [0, 104, 7], [156, 0, 5], [-156, -52, 6], [52, 156, 5], [-52, 208, 6],
      [208, 52, 5], [0, -156, 6], [104, 104, 5], [-104, -104, 6],
    ];
    for (const [x, z, r] of puddleSpots) {
      const p = new THREE.Mesh(new THREE.CircleGeometry(r, 20), puddleMat);
      p.rotation.x = -Math.PI / 2; p.position.set(x, 0.06, z);
      this.wetGroup.add(p);
    }
    // Neon streak reflections: thin additive strips on the road under the signs.
    const streakCols = [0xff2e88, 0x00e5ff, 0xff9f1c, 0x7dff5a];
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2 + Math.random() * 1.6, 14 + Math.random() * 18),
        new THREE.MeshBasicMaterial({
          color: streakCols[i % streakCols.length], transparent: true, opacity: 0.28,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      s.rotation.x = -Math.PI / 2;
      s.position.set((Math.random() - 0.5) * 320, 0.07, (Math.random() - 0.5) * 320);
      s.rotation.z = Math.random() * Math.PI;
      this.wetGroup.add(s);
    }
    this.wetGroup.visible = false;
    scene.add(this.wetGroup);
  }

  setMode(mode) {
    const m = MODES[mode];
    if (!m) return;
    this.mode = mode;
    const c = this.city;
    c.skyMat.uniforms.top.value.setHex(m.skyTop);
    c.skyMat.uniforms.mid.value.setHex(m.skyMid);
    c.skyMat.uniforms.bot.value.setHex(m.skyBot);
    c.hemi.color.setHex(m.hemiSky);
    c.hemi.groundColor.setHex(m.hemiGround);
    c.hemi.intensity = m.hemiInt;
    c.sunLight.color.setHex(m.sunColor);
    c.sunLight.intensity = m.sunInt;
    c.sunLight.position.set(...m.sunPos);
    this.scene.fog.color.setHex(m.fogColor);
    this.scene.fog.near = m.fogNear;
    this.scene.fog.far = m.fogFar;
    c.sunDisc.material.color.setHex(m.discColor);
    c.sunDisc.position.set(...m.discPos);
    c.sunDisc.visible = m.discVisible;
    // Streetlamps + lit windows burn brighter at night.
    if (c.lampMat) c.lampMat.color.setHex(m.lampGlow > 1 ? 0xfff2c0 : 0xffe9a8);
    if (c.setNightGlow) c.setNightGlow(m.windowGlow, m.lampGlow);
    // Wet roads: swap the asphalt to a glossy phong material.
    if (c.setWet) c.setWet(m.wet);
    this.rain.visible = m.rain;
    this.wetGroup.visible = m.wet;
    this.storm = !!m.storm;
    this.flashTimer = 2 + Math.random() * 3;
  }

  get isNight() { return this.mode === 'night' || this.mode === 'rain' || this.mode === 'storm'; }
  get isWet() { return this.mode === 'rain' || this.mode === 'storm'; }

  update(dt) {
    this.t += dt;
    if (this.rain.visible) {
      const f = this.getFocus ? this.getFocus() : { x: 0, z: 0 };
      const pos = this.rainGeo.attributes.position;
      const arr = pos.array;
      const slant = this.storm ? 6 : 2.5;
      // Drops live in cloud-local coords; the whole cloud sits on the focus.
      this.rain.position.set(f.x, 0, f.z);
      for (let i = 0; i < this.rainSpeed.length; i++) {
        arr[i * 3 + 1] -= this.rainSpeed[i] * dt;
        arr[i * 3] += slant * dt;
        if (arr[i * 3] > 45) arr[i * 3] -= 90;
        if (arr[i * 3 + 1] < 0) {
          arr[i * 3 + 1] = 38 + Math.random() * 4;
          arr[i * 3] = (Math.random() - 0.5) * 90;
          arr[i * 3 + 2] = (Math.random() - 0.5) * 90;
        }
      }
      pos.needsUpdate = true;
    }
    if (this.storm) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) {
        this.flash = 1;
        this.flashTimer = 3 + Math.random() * 6;
      }
      if (this.flash > 0) {
        this.flash = Math.max(0, this.flash - dt * 2.2);
        // A strike should light the whole skyline for a frame.
        this.flashLight.intensity = this.flash * 4.5;
        // Sky flicker on the strike.
        const s = this.flash * 0.35;
        this.city.skyMat.uniforms.bot.value.setRGB(0.08 + s, 0.12 + s, 0.22 + s * 1.4);
      } else {
        this.flashLight.intensity = 0;
        this.city.skyMat.uniforms.bot.value.setHex(MODES.storm.skyBot);
      }
    }
  }
}
