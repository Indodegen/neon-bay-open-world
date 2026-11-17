// Coral Bay: the sun-soaked coastal city. Roads grid, buildings, beach, ocean, palms, sunset sky.
import * as THREE from 'three';
import { makeRng, pick, range } from './random.js';

export const CITY = { half: 260, roadGap: 52, block: 40, beachX: 300 };

function windowTexture(rng, base, lit) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 248; y += 18) for (let x = 8; x < 120; x += 18) {
    g.fillStyle = rng() < 0.45 ? lit : 'rgba(20,24,44,0.9)';
    g.fillRect(x, y, 12, 12);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makePalm(rng) {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b46 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 5.2, 6), trunkMat);
  trunk.position.y = 2.6; trunk.rotation.z = range(rng, -0.12, 0.12);
  g.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2fae5f, side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.4, 4), leafMat);
    const a = (i / 7) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.2, 5.4, Math.sin(a) * 1.2);
    leaf.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
    g.add(leaf);
  }
  return g;
}

export function buildCity(scene, rng) {
  const group = new THREE.Group();
  scene.add(group);

  // Sunset sky: big gradient dome + low sun disc.
  const skyGeo = new THREE.SphereGeometry(900, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x2b1055) }, mid: { value: new THREE.Color(0xff7e5f) }, bot: { value: new THREE.Color(0xfeb47b) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot; void main(){ float h = normalize(vP).y; vec3 c = h > 0.25 ? mix(mid, top, smoothstep(0.25, 0.8, h)) : mix(bot, mid, smoothstep(-0.05, 0.25, h)); gl_FragColor = vec4(c, 1.0); }',
  });
  group.add(new THREE.Mesh(skyGeo, skyMat));
  const sun = new THREE.Mesh(new THREE.CircleGeometry(46, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd27d, fog: false }));
  sun.position.set(-620, 150, -420); sun.lookAt(0, 60, 0); group.add(sun);

  // Warm sunset lighting.
  const hemi = new THREE.HemisphereLight(0xffb27d, 0x2a1a3a, 0.85); scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(0xff9a5c, 1.6);
  sunLight.position.set(-180, 120, -120); scene.add(sunLight);
  scene.fog = new THREE.Fog(0xe88a5f, 180, 720);

  // Ground: city asphalt slab, sand beach, ocean.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200),
    new THREE.MeshLambertMaterial({ color: 0x3a3f4a }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; group.add(ground);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(90, 1200),
    new THREE.MeshLambertMaterial({ color: 0xe8cf9a }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(345, 0, 0); group.add(sand);
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(320, 1200),
    new THREE.MeshLambertMaterial({ color: 0x1e6f9e }));
  ocean.rotation.x = -Math.PI / 2; ocean.position.set(540, -0.4, 0); group.add(ocean);
  const boardwalk = new THREE.Mesh(new THREE.BoxGeometry(8, 0.3, 560),
    new THREE.MeshLambertMaterial({ color: 0x9a7b52 }));
  boardwalk.position.set(298, 0.15, 0); group.add(boardwalk);

  // Roads: dark strips + dashed centre lines on a grid.
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x23262e });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf5d76e });
  const H = CITY.half, G = CITY.roadGap;
  for (let i = -5; i <= 5; i++) {
    const p = i * G;
    for (const [w, d, x, z] of [[12, 2 * H, p, 0], [2 * H, 12, 0, p]]) {
      const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat);
      r.rotation.x = -Math.PI / 2; r.position.set(x, 0, z); group.add(r);
    }
    for (let s = -H + 6; s < H; s += 12) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 5), lineMat);
      dash.rotation.x = -Math.PI / 2; dash.position.set(p, 0.02, s); group.add(dash);
      const dash2 = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.5), lineMat);
      dash2.rotation.x = -Math.PI / 2; dash2.position.set(s, 0.02, p); group.add(dash2);
    }
  }

  // Buildings: boxes with lit-window textures, neon roof trim on some.
  const palettes = [['#5a4a7a', '#ffd97d'], ['#7a4a5a', '#9be7ff'], ['#4a6a7a', '#ffe08a'], ['#8a6a4a', '#c9ff9b']];
  const neonColors = [0xff2e88, 0x00e5ff, 0xff9f1c, 0x7dff5a];
  const buildings = [];
  for (let ix = -4; ix <= 4; ix++) for (let iz = -4; iz <= 4; iz++) {
    if (ix === 0 || iz === 0) continue; // keep road corridors clear
    const cx = ix * G + range(rng, -8, 8), cz = iz * G + range(rng, -8, 8);
    if (Math.abs(cx) > 250 || Math.abs(cz) > 250) continue;
    if (cx < -180 && cz > 140) continue; // keep the harbor quarter open (crane + containers + heist ground)
    const w = range(rng, 16, 26), d = range(rng, 16, 26), h = range(rng, 14, 64);
    const [base, lit] = pick(rng, palettes);
    const tex = windowTexture(rng, base, lit);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ map: tex }));
    b.position.set(cx, h / 2, cz); group.add(b); buildings.push(b);
    if (rng() < 0.4) {
      const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4),
        new THREE.MeshBasicMaterial({ color: pick(rng, neonColors) }));
      trim.position.set(cx, h + 0.3, cz); group.add(trim);
    }
  }

  // Landmarks: Coral Tower (tall, pink neon) and the Harbor crane + containers.
  const tower = new THREE.Mesh(new THREE.BoxGeometry(30, 110, 30),
    new THREE.MeshLambertMaterial({ map: windowTexture(rng, '#3a2a5a', '#ff9fe0') }));
  tower.position.set(-104, 55, -104); group.add(tower);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(2, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff2e88 }));
  beacon.position.set(-104, 112, -104); group.add(beacon);
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xd86a2a });
  const crane = new THREE.Group();
  const leg = new THREE.Mesh(new THREE.BoxGeometry(3, 34, 3), craneMat);
  leg.position.y = 17; crane.add(leg);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 44), craneMat);
  arm.position.set(0, 33, 12); crane.add(arm);
  crane.position.set(-230, 0, 180); group.add(crane);
  const contColors = [0x2a7a9e, 0xc23b2a, 0x3a9e5a, 0xd8a02a];
  for (let i = 0; i < 10; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(12, 3, 3),
      new THREE.MeshLambertMaterial({ color: pick(rng, contColors) }));
    c.position.set(-240 + (i % 5) * 14, 1.6 + Math.floor(i / 5) * 3.2, 200 + (i % 3) * 6);
    c.rotation.y = range(rng, -0.1, 0.1); group.add(c);
  }

  // Palms along the beach and avenues, streetlights at intersections.
  for (let z = -240; z <= 240; z += 26) {
    const p1 = makePalm(rng); p1.position.set(292, 0, z); group.add(p1);
    if (rng() < 0.7) { const p2 = makePalm(rng); p2.position.set(range(rng, -240, 240), 0, range(rng, -240, 240)); group.add(p2); }
  }
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x555a66 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (let ix = -4; ix <= 4; ix++) for (let iz = -4; iz <= 4; iz++) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 6), poleMat);
    pole.position.set(ix * G + 7, 3, iz * G + 7); group.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), lampMat);
    lamp.position.set(ix * G + 7, 6.2, iz * G + 7); group.add(lamp);
  }

  // Neon sign arch over the main avenue.
  const sign = new THREE.Mesh(new THREE.BoxGeometry(24, 4, 1),
    new THREE.MeshBasicMaterial({ color: 0xff2e88 }));
  sign.position.set(0, 9, 52); group.add(sign);
  const signPost1 = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 9, 6), poleMat);
  signPost1.position.set(-11, 4.5, 52); group.add(signPost1);
  const signPost2 = signPost1.clone(); signPost2.position.x = 11; group.add(signPost2);

  return { group, buildings, tower };
}
