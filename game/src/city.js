// Coral Bay: the sun-soaked coastal city — REAL and complete, not empty boxes.
// Districts read differently: tall glass downtown, midtown shops + balconies,
// harbor warehouses, beach boardwalk. Layout math (roads, tower, crane, harbor
// quarter, mission targets) is IDENTICAL to round 6 — only the look changes,
// so missions, traffic and staging all still work.
import * as THREE from 'three';
import { makeRng, pick, range, randInt } from './random.js';

export const CITY = { half: 260, roadGap: 52, block: 40, beachX: 300 };

// ---------- canvas textures ----------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function glowTexture() {
  return canvasTex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  });
}
// Facade: floors of windows, some lit, some with a window AC box, ground floor
// a darker shop band. One texture is reused by many buildings.
function facadeTexture(rng, base, lit, litRatio) {
  return canvasTex(128, 256, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 128, 256);
    // subtle vertical grime / panel seams
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let x = 0; x < 128; x += 32) g.fillRect(x, 0, 1, 256);
    for (let y = 8; y < 248; y += 18) {
      for (let x = 8; x < 120; x += 18) {
        const litWin = rng() < litRatio;
        g.fillStyle = litWin ? lit : 'rgba(16,20,38,0.92)';
        g.fillRect(x, y, 12, 12);
        if (litWin) { // lit window frame glow
          g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x, y, 12, 2);
        } else if (rng() < 0.22) { // window AC unit
          g.fillStyle = '#9aa0aa'; g.fillRect(x + 1, y + 10, 10, 5);
        }
      }
    }
    // ground-floor band: shopfronts, darker with a lit strip
    g.fillStyle = 'rgba(10,10,18,0.85)'; g.fillRect(0, 232, 128, 24);
    g.fillStyle = lit; g.globalAlpha = 0.85;
    for (let x = 6; x < 122; x += 16) g.fillRect(x, 238, 10, 12);
    g.globalAlpha = 1;
  });
}
function glassTexture(rng, base) {
  return canvasTex(128, 256, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 128, 256);
    for (let y = 0; y < 256; y += 16) { // floor bands
      g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(0, y, 128, 2);
      for (let x = 6; x < 122; x += 14) {
        g.fillStyle = rng() < 0.5 ? 'rgba(255,230,160,0.95)' : 'rgba(20,32,54,0.9)';
        g.fillRect(x, y + 4, 9, 9);
      }
    }
    g.fillStyle = 'rgba(255,255,255,0.18)'; // sun streak on the glass
    g.fillRect(20, 0, 14, 256); g.fillRect(52, 0, 6, 256);
  });
}
function brickTexture(rng, base) {
  return canvasTex(128, 256, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 128, 256);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < 256; y += 10) { g.fillRect(0, y, 128, 1); for (let x = (y / 10) % 2 ? 8 : 0; x < 128; x += 16) g.fillRect(x, y, 1, 10); }
    for (let y = 10; y < 248; y += 22) for (let x = 10; x < 118; x += 22) {
      g.fillStyle = rng() < 0.4 ? '#ffd97d' : 'rgba(18,22,40,0.92)';
      g.fillRect(x, y, 13, 14);
      g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(x, y, 13, 2);
    }
  });
}
function corrugatedTexture(base) {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 128, 128);
    for (let x = 0; x < 128; x += 8) {
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x, 0, 2, 128);
      g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x + 4, 0, 1, 128);
    }
  });
}
function awningTexture(c1, c2) {
  return canvasTex(128, 32, (g) => {
    for (let x = 0; x < 128; x += 16) { g.fillStyle = (x / 16) % 2 ? c1 : c2; g.fillRect(x, 0, 16, 32); }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 28, 128, 4);
  });
}
function neonSignTexture(text, color, sub) {
  return canvasTex(512, 128, (g) => {
    g.fillStyle = '#0a0616'; g.fillRect(0, 0, 512, 128);
    g.strokeStyle = color; g.lineWidth = 4; g.strokeRect(6, 6, 500, 116);
    g.fillStyle = color; g.font = 'bold 56px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 22;
    g.fillText(text, 256, sub ? 50 : 64);
    if (sub) { g.font = 'bold 30px Arial'; g.shadowBlur = 12; g.fillText(sub, 256, 98); }
  });
}
function billboardTexture(lines, bg, fg) {
  return canvasTex(512, 256, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'italic bold 64px Arial'; g.fillText(lines[0], 256, 78);
    g.font = 'bold 40px Arial'; g.fillText(lines[1], 256, 150);
    g.font = '28px Arial'; g.fillStyle = '#ffffff'; g.fillText(lines[2], 256, 208);
  });
}

function makePalm(rng) {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b46 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 5.2, 6), trunkMat);
  trunk.position.y = 2.6; trunk.rotation.z = range(rng, -0.12, 0.12);
  trunk.castShadow = true; g.add(trunk);
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

const SHOPS = [
  ['TACOS', 'EL REY', 0xff2e88], ['BAR NEON', 'COCKTAILS', 0x00e5ff],
  ['BAY AUTO', 'GARAGE', 0xff9f1c], ['PIZZA NOVA', 'SLICES 24H', 0x7dff5a],
  ['HOTEL CORAL', 'ROOMS · POOL', 0xff5e78], ['24H MARKET', 'OPEN ALL NIGHT', 0x9be7ff],
  ['CASINO SOL', 'SLOTS · POKER', 0xffd23f], ['SURF SHOP', 'BOARDS · WAX', 0x2ed573],
  ['DONUTS', 'COFFEE', 0xff8ac2], ['LAUNDRY', 'WASH · DRY', 0x70a1ff],
];

export function buildCity(scene, rng) {
  const group = new THREE.Group();
  scene.add(group);

  // ---------- texture pool (shared, not one per building) ----------
  const facades = [
    facadeTexture(rng, '#5a4a7a', '#ffd97d', 0.45), facadeTexture(rng, '#7a4a5a', '#9be7ff', 0.4),
    facadeTexture(rng, '#4a6a7a', '#ffe08a', 0.5), facadeTexture(rng, '#8a6a4a', '#c9ff9b', 0.38),
  ];
  const glasses = [glassTexture(rng, '#2c3e5e'), glassTexture(rng, '#3a2c50')];
  const bricks = [brickTexture(rng, '#7a4a3a'), brickTexture(rng, '#5a4a52')];
  const corrugated = [corrugatedTexture('#2a7a9e'), corrugatedTexture('#c23b2a'), corrugatedTexture('#3a9e5a')];
  const awnings = [awningTexture('#ff2e88', '#ffffff'), awningTexture('#00a8cc', '#ffffff'), awningTexture('#ff9f1c', '#1a1a22')];
  const glowTex = glowTexture();

  // ---------- sky, sun, lights (same round-6 sunset values) ----------
  const skyGeo = new THREE.SphereGeometry(900, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x2b1055) }, mid: { value: new THREE.Color(0xff7e5f) }, bot: { value: new THREE.Color(0xfeb47b) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot; void main(){ float h = normalize(vP).y; vec3 c = h > 0.25 ? mix(mid, top, smoothstep(0.25, 0.8, h)) : mix(bot, mid, smoothstep(-0.05, 0.25, h)); gl_FragColor = vec4(c, 1.0); }',
  });
  group.add(new THREE.Mesh(skyGeo, skyMat));
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(46, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd27d, fog: false }));
  sunDisc.position.set(-620, 150, -420); sunDisc.lookAt(0, 60, 0); group.add(sunDisc);

  const hemi = new THREE.HemisphereLight(0xffb27d, 0x2a1a3a, 0.85); scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(0xff9a5c, 1.6);
  sunLight.position.set(-180, 120, -120);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -300; sunLight.shadow.camera.right = 300;
  sunLight.shadow.camera.top = 300; sunLight.shadow.camera.bottom = -300;
  sunLight.shadow.camera.far = 900; sunLight.shadow.bias = -0.0006;
  scene.add(sunLight);
  scene.add(sunLight.target);
  scene.fog = new THREE.Fog(0xe88a5f, 180, 720);

  // ---------- ground ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200),
    new THREE.MeshLambertMaterial({ color: 0x3a3f4a }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; ground.receiveShadow = true; group.add(ground);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(90, 1200),
    new THREE.MeshLambertMaterial({ color: 0xe8cf9a }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(345, 0, 0); sand.receiveShadow = true; group.add(sand);
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(320, 1200),
    new THREE.MeshPhongMaterial({ color: 0x1e6f9e, shininess: 120, specular: 0x99ccff }));
  ocean.rotation.x = -Math.PI / 2; ocean.position.set(540, -0.4, 0); group.add(ocean);
  const boardwalk = new THREE.Mesh(new THREE.BoxGeometry(8, 0.3, 560),
    new THREE.MeshLambertMaterial({ color: 0x9a7b52 }));
  boardwalk.position.set(298, 0.15, 0); boardwalk.receiveShadow = true; group.add(boardwalk);

  // ---------- roads, sidewalks, dashes, crosswalks ----------
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x3a3d46 });
  // Wet asphalt: lighter base + stronger specular so headlights and neon
  // actually reflect off it at night. (Was 0x14161c — the road read as a
  // black void in the storm shot even under the headlights.)
  const roadMatWet = new THREE.MeshPhongMaterial({ color: 0x272d3a, shininess: 130, specular: 0x8fb0d8 });
  const roadMeshes = [];
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf5d76e });
  const sideMat = new THREE.MeshLambertMaterial({ color: 0x87878f });
  const crossMat = new THREE.MeshBasicMaterial({ color: 0xe8e8e8 });
  const H = CITY.half, G = CITY.roadGap;
  for (let i = -5; i <= 5; i++) {
    const p = i * G;
    for (const [w, d, x, z] of [[12, 2 * H, p, 0], [2 * H, 12, 0, p]]) {
      const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat);
      r.rotation.x = -Math.PI / 2; r.position.set(x, 0, z); r.receiveShadow = true;
      group.add(r); roadMeshes.push(r);
    }
    // sidewalks: pale strips hugging both sides of each road
    for (const [w, d, x, z] of [[3.5, 2 * H, p + 7.8, 0], [3.5, 2 * H, p - 7.8, 0], [2 * H, 3.5, 0, p + 7.8], [2 * H, 3.5, 0, p - 7.8]]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(w, d), sideMat);
      s.rotation.x = -Math.PI / 2; s.position.set(x, 0.02, z); group.add(s);
    }
    for (let s = -H + 6; s < H; s += 12) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 5), lineMat);
      dash.rotation.x = -Math.PI / 2; dash.position.set(p, 0.03, s); group.add(dash);
      const dash2 = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.5), lineMat);
      dash2.rotation.x = -Math.PI / 2; dash2.position.set(s, 0.03, p); group.add(dash2);
    }
  }
  // crosswalks at the four central intersections
  for (const [cx, cz] of [[0, 52], [0, -52], [52, 0], [-52, 0]]) {
    for (let k = -2; k <= 2; k++) {
      const a = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 5), crossMat);
      a.rotation.x = -Math.PI / 2; a.position.set(cx + k * 2.4, 0.04, cz - 8); group.add(a);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.1), crossMat);
      b.rotation.x = -Math.PI / 2; b.position.set(cx - 8, 0.04, cz + k * 2.4); group.add(b);
    }
  }
  function setWet(wet) { for (const r of roadMeshes) r.material = wet ? roadMatWet : roadMat; }

  // ---------- helpers: roof details, balconies, shops ----------
  const neonColors = [0xff2e88, 0x00e5ff, 0xff9f1c, 0x7dff5a];
  const lampGlowSprites = [];
  function glowSprite(x, y, z, color, scale, opacity) {
    const m = new THREE.SpriteMaterial({
      map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const s = new THREE.Sprite(m);
    s.position.set(x, y, z); s.scale.set(scale, scale, 1);
    group.add(s); lampGlowSprites.push({ mat: m, base: opacity });
    return s;
  }
  function addRoofDetails(cx, h, cz, w, d, tall) {
    // parapet rim
    const par = new THREE.MeshLambertMaterial({ color: 0x2a2a33 });
    const rim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.7, d + 0.6), par);
    rim.position.set(cx, h + 0.35, cz); group.add(rim);
    // AC units
    const acMat = new THREE.MeshLambertMaterial({ color: 0x8a8f96 });
    const nAc = randInt(rng, 1, 3);
    for (let i = 0; i < nAc; i++) {
      const ac = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 1.2), acMat);
      ac.position.set(cx + range(rng, -w / 3, w / 3), h + 0.9, cz + range(rng, -d / 3, d / 3));
      group.add(ac);
    }
    // water tank (residential / midtown)
    if (rng() < 0.55) {
      const tankMat = new THREE.MeshLambertMaterial({ color: 0x6a7a8a });
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.6, 10), tankMat);
      tank.position.set(cx + w / 4, h + 2.2, cz - d / 4); group.add(tank);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.1, 10), tankMat);
      cone.position.set(cx + w / 4, h + 4, cz - d / 4); group.add(cone);
      for (const [lx, lz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.2, 0.18), par);
        leg.position.set(cx + w / 4 + lx, h + 0.6, cz - d / 4 + lz); group.add(leg);
      }
    }
    // antenna + blinking beacon (tall buildings)
    if (tall || rng() < 0.35) {
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 6, 6),
        new THREE.MeshLambertMaterial({ color: 0x555a66 }));
      ant.position.set(cx - w / 4, h + 3.4, cz + d / 4); group.add(ant);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      beacon.position.set(cx - w / 4, h + 6.6, cz + d / 4); group.add(beacon);
      glowSprite(cx - w / 4, h + 6.6, cz + d / 4, 0xff3344, 3.5, 0.35);
    }
  }
  function addBalconies(cx, cz, w, h, facing) {
    // facing: +x/-x/+z/-z — slabs + railings on the street side
    const slabMat = new THREE.MeshLambertMaterial({ color: 0x6a6a72 });
    const railMat = new THREE.MeshLambertMaterial({ color: 0x2a2a33 });
    const floors = Math.min(3, Math.floor(h / 9));
    const xFace = facing === '+x' || facing === '-x';
    for (let f = 0; f < floors; f++) {
      const y = 7 + f * 8;
      if (y > h - 4) break;
      const slab = new THREE.Mesh(
        xFace ? new THREE.BoxGeometry(1.4, 0.3, w * 0.55) : new THREE.BoxGeometry(w * 0.55, 0.3, 1.4), slabMat);
      const rail = new THREE.Mesh(
        xFace ? new THREE.BoxGeometry(0.12, 0.9, w * 0.55) : new THREE.BoxGeometry(w * 0.55, 0.9, 0.12), railMat);
      if (xFace) {
        const sx = facing === '+x' ? cx + w / 2 + 0.6 : cx - w / 2 - 0.6;
        slab.position.set(sx, y, cz);
        rail.position.set(sx + (facing === '+x' ? 0.65 : -0.65), y + 0.6, cz);
      } else {
        const sz = facing === '+z' ? cz + w / 2 + 0.6 : cz - w / 2 - 0.6;
        slab.position.set(cx, y, sz);
        rail.position.set(cx, y + 0.6, sz + (facing === '+z' ? 0.65 : -0.65));
      }
      group.add(slab); group.add(rail);
    }
  }
  function addShop(cx, cz, w, facing) {
    const [name, sub, col] = pick(rng, SHOPS);
    // glass storefront, slightly proud of the facade
    const glass = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 3.4, 0.5),
      new THREE.MeshPhongMaterial({ color: 0x9fd8ff, shininess: 80, specular: 0x88bbff, transparent: true, opacity: 0.85 }));
    const awn = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.75, 1.6),
      new THREE.MeshLambertMaterial({ map: pick(rng, awnings), side: THREE.DoubleSide }));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25),
      new THREE.MeshBasicMaterial({ map: neonSignTexture(name, '#' + col.toString(16).padStart(6, '0'), sub) }));
    const signGlow = glowSprite(0, 0, 0, col, 7, 0.3);
    let px = cx, pz = cz, ry = 0;
    if (facing === '+x') { px = cx + w / 2 + 0.3; ry = Math.PI / 2; }
    else if (facing === '-x') { px = cx - w / 2 - 0.3; ry = -Math.PI / 2; }
    else if (facing === '+z') { pz = cz + w / 2 + 0.3; ry = 0; }
    else { pz = cz - w / 2 - 0.3; ry = Math.PI; }
    glass.position.set(px, 1.7, pz); glass.rotation.y = ry; group.add(glass);
    awn.position.set(px, 3.9, pz); awn.rotation.y = ry; awn.rotation.x = -0.5; group.add(awn);
    const off = 0.9;
    const sx = px + (facing === '+x' ? off : facing === '-x' ? -off : 0);
    const sz = pz + (facing === '+z' ? off : facing === '-z' ? -off : 0);
    sign.position.set(sx, 5.6, sz); sign.rotation.y = ry; group.add(sign);
    signGlow.position.set(sx, 5.6, sz);
  }
  function facingOf(cx, cz) {
    // face the nearest road line
    const dx = Math.abs(cx - Math.round(cx / G) * G);
    const dz = Math.abs(cz - Math.round(cz / G) * G);
    if (dx <= dz) return cx > Math.round(cx / G) * G ? '-x' : '+x';
    return cz > Math.round(cz / G) * G ? '-z' : '+z';
  }

  // ---------- buildings, by district ----------
  const buildings = [];
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (let ix = -4; ix <= 4; ix++) for (let iz = -4; iz <= 4; iz++) {
    if (ix === 0 || iz === 0) continue; // keep road corridors clear
    if (ix === -3 && iz === -3) continue; // BAY AUTO garage block
    const cx = ix * G + range(rng, -6, 6), cz = iz * G + range(rng, -6, 6);
    if (Math.abs(cx) > 250 || Math.abs(cz) > 250) continue;
    if (cx < -180 && cz > 140) continue; // keep the harbor quarter open
    const downtown = Math.abs(cx) < 130 && Math.abs(cz) < 130;
    const midtown = !downtown && Math.abs(cx) < 210 && Math.abs(cz) < 210;
    const w = range(rng, 15, 24), d = range(rng, 15, 24);
    let h, mat;
    if (downtown) {
      h = range(rng, 34, 96);
      mat = rng() < 0.55
        ? new THREE.MeshPhongMaterial({ map: pick(rng, glasses), shininess: 70, specular: 0x445577 })
        : new THREE.MeshLambertMaterial({ map: pick(rng, facades) });
    } else if (midtown) {
      h = range(rng, 14, 40);
      mat = new THREE.MeshLambertMaterial({ map: pick(rng, rng() < 0.5 ? facades : bricks) });
    } else {
      h = range(rng, 10, 22);
      mat = new THREE.MeshLambertMaterial({ map: pick(rng, bricks) });
    }
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(cx, h / 2, cz); b.castShadow = true;
    group.add(b); buildings.push(b);
    const facing = facingOf(cx, cz);
    if (downtown || midtown) addRoofDetails(cx, h, cz, w, d, h > 70);
    else if (rng() < 0.7) addRoofDetails(cx, h, cz, w, d, false);
    if (midtown && rng() < 0.6) addBalconies(cx, cz, w, h, facing);
    if ((downtown || midtown) && rng() < 0.55) addShop(cx, cz, w, facing);
    if (downtown && rng() < 0.5) {
      const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4),
        new THREE.MeshBasicMaterial({ color: pick(rng, neonColors) }));
      trim.position.set(cx, h + 0.3, cz); group.add(trim);
      glowSprite(cx, h + 0.3, cz, trim.material.color.getHex(), 8, 0.25);
    }
    // occasional annex: a smaller wing on the same block
    if (rng() < 0.3) {
      const aw = w * 0.55, ah = h * range(rng, 0.35, 0.6);
      const annex = new THREE.Mesh(new THREE.BoxGeometry(aw, ah, d * 0.6),
        new THREE.MeshLambertMaterial({ map: pick(rng, bricks) }));
      annex.position.set(cx + (w / 2 + aw / 2 + 1) * (rng() < 0.5 ? 1 : -1), ah / 2, cz);
      annex.castShadow = true; group.add(annex); buildings.push(annex);
    }
  }

  // ---------- landmarks: Coral Tower, harbor, boardwalk ----------
  const tower = new THREE.Mesh(new THREE.BoxGeometry(30, 110, 30),
    new THREE.MeshLambertMaterial({ map: glassTexture(rng, '#3a2a5a') }));
  tower.position.set(-104, 55, -104); tower.castShadow = true; group.add(tower);
  const towerSign = new THREE.Mesh(new THREE.PlaneGeometry(26, 6.5),
    new THREE.MeshBasicMaterial({ map: neonSignTexture('NEON BAY', '#ff2e88', 'CORAL BAY') }));
  towerSign.position.set(-104, 96, -88.8); group.add(towerSign);
  glowSprite(-104, 96, -88, 0xff2e88, 16, 0.35);
  addRoofDetails(-104, 110, -104, 30, 30, true);
  // helipad on the tower roof
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 0.4, 24),
    new THREE.MeshLambertMaterial({ color: 0x222226 }));
  pad.position.set(-104, 110.6, -104); group.add(pad);
  const padRing = new THREE.Mesh(new THREE.RingGeometry(6.5, 7.5, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, side: THREE.DoubleSide }));
  padRing.rotation.x = -Math.PI / 2; padRing.position.set(-104, 110.85, -104); group.add(padRing);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(2, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff2e88 }));
  beacon.position.set(-104, 112, -104); group.add(beacon);

  // Harbor: warehouses with big doors, silos, second crane, containers, boats.
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xd86a2a });
  function makeCrane(x, z, ry) {
    const crane = new THREE.Group();
    const leg = new THREE.Mesh(new THREE.BoxGeometry(3, 34, 3), craneMat);
    leg.position.y = 17; crane.add(leg);
    const leg2 = leg.clone(); leg2.position.set(8, 17, 0); crane.add(leg2);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 44), craneMat);
    arm.position.set(4, 33, 12); crane.add(arm);
    const hook = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshLambertMaterial({ color: 0x222226 }));
    hook.position.set(4, 26, 26); crane.add(hook);
    crane.position.set(x, 0, z); crane.rotation.y = ry; group.add(crane);
  }
  makeCrane(-230, 180, 0);
  makeCrane(-200, 230, Math.PI / 2);
  const contColors = [0x2a7a9e, 0xc23b2a, 0x3a9e5a, 0xd8a02a];
  for (let i = 0; i < 14; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(12, 3, 3),
      new THREE.MeshLambertMaterial({ map: corrugated[i % 3], color: pick(rng, contColors) }));
    c.position.set(-240 + (i % 5) * 14, 1.6 + Math.floor(i / 5) * 3.2, 200 + (i % 3) * 6);
    c.rotation.y = range(rng, -0.1, 0.1); c.castShadow = true; group.add(c);
  }
  // warehouses: long corrugated boxes with a big dark door + skylight strip
  for (const [wx, wz, wr] of [[-225, 150, 0], [-190, 155, Math.PI / 2], [-235, 220, 0]]) {
    const wh = new THREE.Mesh(new THREE.BoxGeometry(30, 10, 16),
      new THREE.MeshLambertMaterial({ map: corrugated[0] }));
    wh.position.set(wx, 5, wz); wh.rotation.y = wr; wh.castShadow = true; group.add(wh);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(10, 7),
      new THREE.MeshLambertMaterial({ color: 0x1a1a22 }));
    door.position.set(wx, 3.5, wz + 8.1); door.rotation.y = wr; group.add(door);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(30.4, 0.8, 16.4),
      new THREE.MeshBasicMaterial({ color: 0xff9f1c }));
    strip.position.set(wx, 9.6, wz); strip.rotation.y = wr; group.add(strip);
  }
  // silos
  for (const [sx, sz] of [[-185, 215], [-175, 215]]) {
    const silo = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 16, 12),
      new THREE.MeshLambertMaterial({ color: 0x9aa0aa }));
    silo.position.set(sx, 8, sz); silo.castShadow = true; group.add(silo);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(4.2, 3, 12),
      new THREE.MeshLambertMaterial({ color: 0x7a808a }));
    cap.position.set(sx, 17.5, sz); group.add(cap);
  }

  // ---------- beach: ferris wheel, pier, umbrellas, lifeguard tower ----------
  const ferris = new THREE.Group();
  ferris.position.set(312, 0, -80);
  const fLegMat = new THREE.MeshLambertMaterial({ color: 0xd8d8e0 });
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1, 34, 6), fLegMat);
    leg.position.set(0, 17, s * 6); leg.rotation.x = s * 0.35; ferris.add(leg);
  }
  const wheel = new THREE.Group(); wheel.position.set(0, 30, 0); ferris.add(wheel);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(15, 0.5, 8, 32),
    new THREE.MeshLambertMaterial({ color: 0xff2e88 }));
  rim.rotation.y = Math.PI / 2; wheel.add(rim);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.35, 30, 0.35), fLegMat);
    spoke.rotation.x = a; wheel.add(spoke);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6),
      new THREE.MeshBasicMaterial({ color: neonColors[i % 4] }));
    bulb.position.set(0, Math.cos(a) * 15, Math.sin(a) * 15); wheel.add(bulb);
    const gondola = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2, 2),
      new THREE.MeshLambertMaterial({ color: pick(rng, neonColors) }));
    gondola.position.set(0, Math.cos(a) * 15, Math.sin(a) * 15); ferris.add(gondola);
  }
  group.add(ferris);
  // pier into the ocean
  const pier = new THREE.Mesh(new THREE.BoxGeometry(70, 0.5, 6),
    new THREE.MeshLambertMaterial({ color: 0x8a6b46 }));
  pier.position.set(340, 0.4, 120); group.add(pier);
  for (let x = 310; x <= 370; x += 12) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 3, 6),
      new THREE.MeshLambertMaterial({ color: 0x5a4632 }));
    post.position.set(x, -0.6, 117); group.add(post);
    const post2 = post.clone(); post2.position.z = 123; group.add(post2);
  }
  // beach umbrellas + lifeguard tower
  const umbCols = [0xff2e88, 0x00e5ff, 0xff9f1c, 0x7dff5a];
  for (let i = 0; i < 8; i++) {
    const ux = 315 + rng() * 40, uz = -200 + i * 52;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 6),
      new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }));
    pole.position.set(ux, 1.3, uz); group.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.1, 8),
      new THREE.MeshLambertMaterial({ color: umbCols[i % 4] }));
    top.position.set(ux, 3, uz); group.add(top);
  }
  const lg = new THREE.Group();
  const lgLegs = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 3), new THREE.MeshLambertMaterial({ color: 0xffffff }));
  lgLegs.position.y = 2; lg.add(lgLegs);
  const lgTop = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2, 3.6), new THREE.MeshLambertMaterial({ color: 0xff4757 }));
  lgTop.position.y = 5; lg.add(lgTop);
  const lgRoof = new THREE.Mesh(new THREE.ConeGeometry(2.8, 1.2, 4), new THREE.MeshLambertMaterial({ color: 0xffd23f }));
  lgRoof.position.y = 6.6; lgRoof.rotation.y = Math.PI / 4; lg.add(lgRoof);
  lg.position.set(330, 0, -20); group.add(lg);

  // boats on the ocean + one moored by the harbor
  function makeBoat(x, z, ry, sailCol) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 9),
      new THREE.MeshLambertMaterial({ color: 0xffffff }));
    hull.position.y = 0.4; boat.add(hull);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2, 1.4, 3),
      new THREE.MeshLambertMaterial({ color: 0x2a3a55 }));
    cabin.position.set(0, 1.6, -1); boat.add(cabin);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0x8a6b46 }));
    mast.position.set(0, 5, 0.5); boat.add(mast);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 6),
      new THREE.MeshLambertMaterial({ color: sailCol, side: THREE.DoubleSide }));
    sail.position.set(0, 5.5, 1.5); boat.add(sail);
    boat.position.set(x, 0, z); boat.rotation.y = ry; group.add(boat);
  }
  makeBoat(430, -100, 0.4, 0xffffff);
  makeBoat(470, 80, -0.6, 0xff9f1c);
  makeBoat(410, 210, 1.2, 0x00e5ff);
  makeBoat(360, 240, 2.2, 0xffffff);

  // ---------- palms, streetlights, market stalls, props ----------
  for (let z = -240; z <= 240; z += 26) {
    const p1 = makePalm(rng); p1.position.set(292, 0, z); group.add(p1);
    if (rng() < 0.7) { const p2 = makePalm(rng); p2.position.set(range(rng, -240, 240), 0, range(rng, -240, 240)); group.add(p2); }
  }
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x555a66 });
  for (let ix = -4; ix <= 4; ix++) for (let iz = -4; iz <= 4; iz++) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 6), poleMat);
    pole.position.set(ix * G + 7, 3, iz * G + 7); group.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), lampMat);
    lamp.position.set(ix * G + 7, 6.2, iz * G + 7); group.add(lamp);
    // Streetlamp halos read as the city's night grid — bigger at night.
    glowSprite(ix * G + 7, 6.2, iz * G + 7, 0xffe9a8, 5.5, 0.42);
  }
  // traffic lights at the central intersections
  for (const [tx, tz] of [[52, 52], [-52, 52], [52, -52], [-52, -52], [0, 104], [0, -104], [104, 0], [-104, 0]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 6.5, 6), poleMat);
    pole.position.set(tx + 7, 3.25, tz + 7); group.add(pole);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2, 0.7),
      new THREE.MeshLambertMaterial({ color: 0x1a1a22 }));
    box.position.set(tx + 7, 6.4, tz + 7); group.add(box);
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.set(tx + 7, 7, tz + 7.35); group.add(red);
    const grn = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0x224422 }));
    grn.position.set(tx + 7, 5.9, tz + 7.35); group.add(grn);
  }
  // market stalls near the boardwalk
  for (let i = 0; i < 4; i++) {
    const sx = 288, sz = -40 + i * 28;
    const canopy = new THREE.Mesh(new THREE.PlaneGeometry(5, 4),
      new THREE.MeshLambertMaterial({ map: awnings[i % 3], side: THREE.DoubleSide }));
    canopy.position.set(sx, 2.6, sz); canopy.rotation.x = -0.15; group.add(canopy);
    for (const [ox, oz] of [[-2, -1.6], [2, -1.6], [-2, 1.6], [2, 1.6]]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6), poleMat);
      p.position.set(sx + ox, 1.3, sz + oz); group.add(p);
    }
    for (let k = 0; k < 3; k++) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshLambertMaterial({ color: pick(rng, [0xff9f1c, 0x2ed573, 0xff4757]) }));
      crate.position.set(sx - 1 + k * 1.1, 0.5, sz); group.add(crate);
    }
  }
  // gas station on the beach road (refuel pad) + ATMs on the sidewalks
  const gas = new THREE.Group();
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(16, 0.6, 12),
    new THREE.MeshLambertMaterial({ color: 0x2a7a9e }));
  canopy.position.y = 6; gas.add(canopy);
  for (const [ox, oz] of [[-7, -5], [7, -5], [-7, 5], [7, 5]]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 6, 6), poleMat);
    p.position.set(ox, 3, oz); gas.add(p);
  }
  for (const px of [-3, 3]) {
    const pump = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, 0.8),
      new THREE.MeshLambertMaterial({ color: 0xcc2222 }));
    pump.position.set(px, 1, 0); gas.add(pump);
  }
  const gasSign = new THREE.Mesh(new THREE.PlaneGeometry(12, 3),
    new THREE.MeshBasicMaterial({ map: neonSignTexture('GAS', '#ff9f1c', '$3.49 / GAL') }));
  gasSign.position.set(0, 7, 6.1); gas.add(gasSign);
  gas.position.set(285, 0, -150);
  group.add(gas);
  for (const [ax, az, ar] of [[8, 52, 0], [-52, 8, Math.PI / 2]]) {
    const atm = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 0.8),
      new THREE.MeshLambertMaterial({ color: 0x2a3a55 }));
    box.position.y = 1.1; atm.add(box);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7),
      new THREE.MeshBasicMaterial({ color: 0x9fd8ff }));
    screen.position.set(0, 1.5, 0.42); atm.add(screen);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.4),
      new THREE.MeshBasicMaterial({ map: neonSignTexture('ATM', '#7dff9b', '') }));
    label.position.set(0, 2.4, 0.42); atm.add(label);
    atm.position.set(ax, 0, az); atm.rotation.y = ar;
    group.add(atm);
  }
  // benches, hydrants, bus stops along the avenues
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
  for (const [bx, bz] of [[8, -52], [-8, 104], [60, 8], [-60, -8], [8, 156], [156, 8]]) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.8), benchMat);
    bench.position.set(bx, 0.55, bz); group.add(bench);
    const hyd = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.9, 8),
      new THREE.MeshLambertMaterial({ color: 0xcc2222 }));
    hyd.position.set(bx + 3, 0.45, bz + 2); group.add(hyd);
  }

  // ---------- neon sign arches over the main avenues ----------
  const sign = new THREE.Mesh(new THREE.BoxGeometry(24, 4, 1),
    new THREE.MeshBasicMaterial({ color: 0xff2e88 }));
  sign.position.set(0, 9, 52); group.add(sign);
  const signPost1 = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 9, 6), poleMat);
  signPost1.position.set(-11, 4.5, 52); group.add(signPost1);
  const signPost2 = signPost1.clone(); signPost2.position.x = 11; group.add(signPost2);
  glowSprite(0, 9, 52, 0xff2e88, 18, 0.3);
  const signTex = new THREE.Mesh(new THREE.PlaneGeometry(22, 3.2),
    new THREE.MeshBasicMaterial({ map: neonSignTexture('NEON BAY', '#00e5ff', '') }));
  signTex.position.set(0, 9, 52.6); group.add(signTex);
  // billboards
  const bb1 = new THREE.Mesh(new THREE.PlaneGeometry(18, 9),
    new THREE.MeshBasicMaterial({ map: billboardTexture(['VISIT CORAL BAY', 'SUN · SAND · SIN', 'NEON BAY TOURISM BOARD']) }));
  bb1.position.set(52, 26, 46); bb1.rotation.y = Math.PI; group.add(bb1);
  const bb2 = new THREE.Mesh(new THREE.PlaneGeometry(18, 9),
    new THREE.MeshBasicMaterial({ map: billboardTexture(['SUNSET GT', '0–60 IN 3.1 SECONDS', 'BAY AUTO — FINANCING AVAILABLE'], '#1a0a2e', '#ff9f1c') }));
  bb2.position.set(-52, 24, -46); group.add(bb2);

  // ---------- BAY AUTO garage (block -156,-156): cinematic interior ----------
  const garage = new THREE.Group();
  const gFloor = new THREE.Mesh(new THREE.BoxGeometry(34, 0.4, 26),
    new THREE.MeshLambertMaterial({ color: 0x4a4a52 }));
  gFloor.position.y = 0.2; gFloor.receiveShadow = true; garage.add(gFloor);
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x4a4f5c });
  const wallB = new THREE.Mesh(new THREE.BoxGeometry(34, 8, 0.6), wallMat);
  wallB.position.set(0, 4, -13); garage.add(wallB);
  const wallL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 8, 26), wallMat);
  wallL.position.set(-17, 4, 0); garage.add(wallL);
  const wallR = wallL.clone(); wallR.position.x = 17; garage.add(wallR);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(34, 0.5, 26),
    new THREE.MeshLambertMaterial({ color: 0x33333c }));
  roof.position.y = 8.2; garage.add(roof);
  // Interior work lights: the roof blocks the sun, so the garage needs its
  // own warm lights or the hero car reads as a black silhouette.
  for (const lx of [-6, 6]) {
    const pl = new THREE.PointLight(0xffe9a8, 60, 30, 1.6);
    pl.position.set(lx, 7, 0);
    garage.add(pl);
  }
  // skylight strips glow from above
  for (const sx of [-8, 0, 8]) {
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(3, 20),
      new THREE.MeshBasicMaterial({ color: 0x9fd8ff }));
    sky.rotation.x = Math.PI / 2; sky.position.set(sx, 7.9, 0); garage.add(sky);
  }
  // car lift: platform + posts, hero car sits on it
  const liftMat = new THREE.MeshLambertMaterial({ color: 0xd8a02a });
  const lift = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.5, 6), liftMat);
  lift.position.set(0, 1.1, 0); garage.add(lift);
  for (const [lx, lz] of [[-1.5, -2.6], [1.5, -2.6], [-1.5, 2.6], [1.5, 2.6]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.2, 0.4), liftMat);
    post.position.set(lx, 1.1, lz); garage.add(post);
  }
  // tool benches, tire stacks, oil stains, posters
  const benchTop = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 1.6),
    new THREE.MeshLambertMaterial({ color: 0x6a4a2a }));
  benchTop.position.set(-13, 1.4, -10); garage.add(benchTop);
  for (let i = 0; i < 4; i++) {
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.25, 8, 14),
      new THREE.MeshLambertMaterial({ color: 0x111111 }));
    tire.position.set(13, 0.35 + i * 0.55, -10); tire.rotation.x = Math.PI / 2; garage.add(tire);
  }
  const stain = new THREE.Mesh(new THREE.CircleGeometry(2.2, 16),
    new THREE.MeshBasicMaterial({ color: 0x0a0a0c, transparent: true, opacity: 0.6 }));
  stain.rotation.x = -Math.PI / 2; stain.position.set(2, 0.42, 6); garage.add(stain);
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(4, 6),
    new THREE.MeshBasicMaterial({ map: billboardTexture(['SUNSET GT', 'BAY AUTO', 'TUNED BY DEX']) }));
  poster.position.set(-16.6, 4, 4); poster.rotation.y = Math.PI / 2; garage.add(poster);
  const gSign = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5),
    new THREE.MeshBasicMaterial({ map: neonSignTexture('BAY AUTO', '#ff9f1c', 'GARAGE · TUNING · RESPRAY') }));
  gSign.position.set(0, 6.4, 13.4); garage.add(gSign);
  glowSprite(0, 6.4, 13.4, 0xff9f1c, 12, 0.4);
  // hanging work lamps
  for (const lx of [-6, 6]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
    lamp.position.set(lx, 7, 0); garage.add(lamp);
    glowSprite(lx, 7, 0, 0xffe9a8, 6, 0.4);
  }
  garage.position.set(-156, 0, -156);
  group.add(garage);

  function setNightGlow(windowGlow, lampGlow) {
    for (const s of lampGlowSprites) s.mat.opacity = s.base * lampGlow;
    lampMat.color.setHex(lampGlow > 1 ? 0xfff2c0 : 0xffe9a8);
  }

  let ferrisAngle = 0;
  function update(dt) {
    ferrisAngle += dt * 0.12;
    wheel.rotation.x = ferrisAngle;
    // beacon blink
    const b = Math.floor(performance.now() / 600) % 2 === 0;
    beacon.material.color.setHex(b ? 0xff2e88 : 0x551122);
  }

  return {
    group, buildings, tower, skyMat, sunDisc, hemi, sunLight, roadMat, lampMat,
    ferris, garage: { group: garage, x: -156, z: -156, liftY: 1.35 },
    setWet, setNightGlow, update,
  };
}
