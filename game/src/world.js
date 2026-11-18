// Coral Bay: the city itself. A seeded grid of avenues and streets, towers with
// lit windows, a beach and an animated bay, a bridge to the Coral Cay island,
// neon signs, palms, streetlights, clouds, sun, fog, day/night and rain.
import { makeRng, clamp, lerp } from './utils.js';

export const AVENUES = [-240, -180, -120, -60, 0, 60, 120, 180, 240];
export const STREETS = [-240, -180, -120, -60, 0, 60, 120, 180];
export const ROAD_HALF = 5.5;
export const CITY_MIN_X = -275;
export const CITY_MAX_X = 275;
export const CITY_MIN_Z = -275;
export const CITY_MAX_Z = 215;
export const SAND_X = 285;
export const WATER_X = 312;
export const ISLAND = { x: 415, z: -60, r: 62 };

export const PLACES = {
  club: { x: 30, z: 30, label: "Club Lumen" },
  garage: { x: -90, z: 30, label: 'Mako Garage' },
  bank: { x: 90, z: -30, label: 'Coral Bay Bank' },
  hospital: { x: -30, z: 150, label: 'St. Marina Hospital' },
  policeHQ: { x: 150, z: 90, label: 'CBPD HQ' },
  docks: { x: -185, z: 228, label: 'Pier 9 Docks' },
  pier: { x: 292, z: -60, label: 'Sunset Pier' },
  island: { x: 415, z: -60, label: 'Coral Cay Resort' },
  park: { x: -150, z: -90, label: 'Palmetto Park' },
  casino: { x: 150, z: -150, label: 'Casino Del Mar' },
};

const NEON_TEXTS = [
  ['CLUB LUMEN', '#ff2e88'], ['CASINO', '#ffd23e'], ['HOTEL CORAL', '#37e0ff'],
  ['TACOS', '#ff7a1a'], ['24 HOUR', '#7CFC00'], ['SUNSET BAR', '#ff5e5e'],
  ['PIER 9', '#37e0ff'], ['NEON BAY', '#c86bff'], ['RAMEN', '#ffb347'],
  ['GYM', '#7CFC00'], ['LIQUOR', '#ff2e88'], ['ARCADE', '#37e0ff'],
];

function makeCanvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Facade texture: dark wall, a grid of windows, some lit warm, some dark. */
function makeFacadeTexture(rng, base, litRatio) {
  return makeCanvasTexture(128, 256, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < h; y += 16) ctx.fillRect(0, y, w, 2);
    const cols = 6;
    const rows = 12;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const lit = rng.next() < litRatio;
        ctx.fillStyle = lit
          ? rng.pick(['#ffd27a', '#ffe9b0', '#ffb45e', '#cfe8ff'])
          : '#10151f';
        ctx.fillRect(8 + c * 19, 10 + r * 20, 13, 12);
      }
    }
  });
}

/** Emissive map twin: only the lit windows glow, the wall stays black. */
function makeFacadeEmissive(rng, litRatio) {
  return makeCanvasTexture(128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);
    for (let r = 0; r < 12; r += 1) {
      for (let c = 0; c < 6; c += 1) {
        if (rng.next() < litRatio) {
          ctx.fillStyle = rng.pick(['#ffca66', '#ffe9b0', '#ff9d4d', '#bcd9ff']);
          ctx.fillRect(8 + c * 19, 10 + r * 20, 13, 12);
        }
      }
    }
  });
}

function makeRoadTexture() {
  return makeCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#26292f';
    ctx.fillRect(0, 0, w, h);
    // Subtle asphalt grain.
    for (let i = 0; i < 420; i += 1) {
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    // Dashed yellow centre line (runs along the texture's V axis).
    ctx.fillStyle = '#d8b13c';
    for (let y = 0; y < h; y += 64) ctx.fillRect(w / 2 - 3, y + 6, 6, 34);
    // Solid white edge lines.
    ctx.fillStyle = 'rgba(235,235,235,0.85)';
    ctx.fillRect(5, 0, 4, h);
    ctx.fillRect(w - 9, 0, 4, h);
    // Faint lane dashes.
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    for (let y = 0; y < h; y += 64) {
      ctx.fillRect(w / 2 - 52, y + 10, 4, 26);
      ctx.fillRect(w / 2 + 48, y + 10, 4, 26);
    }
  });
}

function makeNeonTexture(text, color) {
  return makeCanvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(8,8,16,0.92)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.font = 'bold 64px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = color;
    ctx.shadowBlur = 26;
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, h / 2 + 2);
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, w / 2, h / 2 + 2);
  });
}

function makeGlowTexture(color) {
  return makeCanvasTexture(64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

export function buildWorld(scene, seed) {
  const rng = makeRng(seed);
  const world = {
    colliders: [],
    buildings: [],
    neonSigns: [],
    streetlightHeads: [],
    waterMesh: null,
    waterBase: null,
    sunLight: null,
    hemiLight: null,
    moonLight: null,
    rain: null,
    clouds: [],
    beacons: [],
    neonMats: [],
    neonGlows: [],
    wetGlows: [],
    facadeMats: [],
    roadMat: null,
    sunSprite: null,
    carSpawns: [],
    pedSpawns: [],
    palms: [],
    boats: [],
    birds: [],
    ferris: null,
    flashLight: null,
  };

  // ---------- renderer / sky basics ----------
  scene.fog = new THREE.Fog(0x2a1a3a, 120, 900);
  scene.background = new THREE.Color(0x2a1a3a);

  const hemi = new THREE.HemisphereLight(0xffd9a0, 0x2a3550, 0.9);
  scene.add(hemi);
  world.hemiLight = hemi;

  // A flat lift so the shadow sides of buildings never read pure black.
  const ambient = new THREE.AmbientLight(0x3a3f52, 0.55);
  scene.add(ambient);
  world.ambientLight = ambient;

  const sun = new THREE.DirectionalLight(0xffb066, 2.4);
  sun.position.set(-180, 140, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -320;
  sun.shadow.camera.right = 320;
  sun.shadow.camera.top = 320;
  sun.shadow.camera.bottom = -320;
  sun.shadow.camera.far = 900;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);
  world.sunLight = sun;

  const moon = new THREE.DirectionalLight(0x8fb4ff, 0.0);
  moon.position.set(200, 220, -140);
  scene.add(moon);
  world.moonLight = moon;

  // Lightning flash light for storms: idle at 0, spiked by the weather loop.
  const flash = new THREE.DirectionalLight(0xdfe8ff, 0);
  flash.position.set(120, 300, 80);
  scene.add(flash);
  world.flashLight = flash;

  // ---------- ground, beach, water ----------
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(620, 560), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -30);
  ground.receiveShadow = true;
  scene.add(ground);

  const sandMat = new THREE.MeshLambertMaterial({ color: 0xd9b380 });
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(90, 560), sandMat);
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(SAND_X + 18, 0.06, -30);
  sand.receiveShadow = true;
  scene.add(sand);

  const waterGeo = new THREE.PlaneGeometry(420, 620, 42, 56);
  const waterMat = new THREE.MeshPhongMaterial({
    color: 0x0e6f8e, transparent: true, opacity: 0.88,
    shininess: 140, specular: 0x99ddff,
  });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(WATER_X + 200, 0.25, -30);
  scene.add(water);
  world.waterMesh = water;
  world.waterBase = waterGeo.attributes.position.array.slice();

  // Island (low, flat-topped so cars can drive onto it from the bridge)
  const islandSand = new THREE.Mesh(
    new THREE.CylinderGeometry(ISLAND.r, ISLAND.r * 1.08, 1.4, 28),
    new THREE.MeshLambertMaterial({ color: 0xd9b380 }),
  );
  islandSand.position.set(ISLAND.x, 0.5, ISLAND.z);
  islandSand.receiveShadow = true;
  scene.add(islandSand);
  const islandGrass = new THREE.Mesh(
    new THREE.CylinderGeometry(ISLAND.r * 0.86, ISLAND.r * 0.9, 1.2, 28),
    new THREE.MeshLambertMaterial({ color: 0x3f7a44 }),
  );
  islandGrass.position.set(ISLAND.x, 0.6, ISLAND.z);
  islandGrass.receiveShadow = true;
  scene.add(islandGrass);
  world.colliders.push({ x: ISLAND.x, z: ISLAND.z, hw: ISLAND.r * 0.5, hd: ISLAND.r * 0.5, island: true });

  // Bridge from the beach to the island: a low causeway that rises in a gentle
  // arch, built from segments that follow groundHeight() so cars and the hero
  // can actually drive and walk across it.
  const bridgeMat = new THREE.MeshLambertMaterial({ color: 0x8a7f72 });
  const bridgeTopMat = new THREE.MeshPhongMaterial({ color: 0x2c2f36, shininess: 30 });
  const BRIDGE_Z = -60;
  const SEG_N = 14;
  const SEG_LEN = 96 / SEG_N;
  for (let i = 0; i < SEG_N; i += 1) {
    const x0 = 284 + i * SEG_LEN;
    const x1 = x0 + SEG_LEN;
    const h0 = groundHeightAt(x0 + 0.01, BRIDGE_Z);
    const h1 = groundHeightAt(x1 - 0.01, BRIDGE_Z);
    const cx = (x0 + x1) / 2;
    const cy = (h0 + h1) / 2;
    const slope = Math.atan2(h1 - h0, SEG_LEN);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(SEG_LEN + 0.6, 1.0, 13), bridgeMat);
    seg.position.set(cx, cy - 0.5, BRIDGE_Z);
    seg.rotation.z = slope;
    seg.castShadow = true;
    seg.receiveShadow = true;
    scene.add(seg);
    const top = new THREE.Mesh(new THREE.BoxGeometry(SEG_LEN + 0.6, 0.12, 12.4), bridgeTopMat);
    top.position.set(cx, cy + 0.02, BRIDGE_Z);
    top.rotation.z = slope;
    top.receiveShadow = true;
    scene.add(top);
  }
  for (let i = 0; i < 4; i += 1) {
    const px = 300 + i * 26;
    const ph = groundHeightAt(px, BRIDGE_Z);
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(3, ph + 6, 12), bridgeMat);
    pylon.position.set(px, (ph - 6) / 2 - 1, BRIDGE_Z);
    scene.add(pylon);
  }
  // Warm lamps along the bridge so it glows at night.
  const bridgeLampMat = new THREE.MeshBasicMaterial({ color: 0xffc46b });
  for (let i = 0; i < 5; i += 1) {
    const lx = 292 + i * 20;
    const lh = groundHeightAt(lx, BRIDGE_Z);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), bridgeLampMat);
    lamp.position.set(lx, lh + 4.4, BRIDGE_Z + 5.6);
    scene.add(lamp);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 4.4, 6), bridgeMat);
    pole.position.set(lx, lh + 2.2, BRIDGE_Z + 5.6);
    scene.add(pole);
  }

  // Docks pier (south) + Sunset Pier (east, for the boat)
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const dockPier = new THREE.Mesh(new THREE.BoxGeometry(90, 1.4, 12), pierMat);
  dockPier.position.set(-185, 1, 238);
  scene.add(dockPier);
  const sunsetPier = new THREE.Mesh(new THREE.BoxGeometry(26, 1.4, 10), pierMat);
  sunsetPier.position.set(300, 1, -60);
  scene.add(sunsetPier);
  world.colliders.push({ x: -185, z: 238, hw: 45, hd: 6 });
  world.colliders.push({ x: 300, z: -60, hw: 13, hd: 5 });

  // ---------- roads ----------
  const roadTex = makeRoadTexture();
  roadTex.wrapS = THREE.RepeatWrapping;
  roadTex.wrapT = THREE.RepeatWrapping;
  world.roadMats = [];
  function roadMaterial(repeatU, repeatV) {
    const tex = roadTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(repeatU, repeatV);
    const mat = new THREE.MeshPhongMaterial({ map: tex, shininess: 26, specular: 0x334455 });
    world.roadMats.push(mat);
    return mat;
  }
  const roadGroup = new THREE.Group();
  for (const x of AVENUES) {
    // PlaneGeometry(11, 520): U across the road, V along it.
    const seg = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_HALF * 2, 520),
      roadMaterial(1, 9),
    );
    seg.rotation.x = -Math.PI / 2;
    seg.position.set(x, 0.12, -30);
    seg.receiveShadow = true;
    roadGroup.add(seg);
  }
  for (const z of STREETS) {
    // PlaneGeometry(560, 11): U along the road, V across it.
    const seg = new THREE.Mesh(
      new THREE.PlaneGeometry(560, ROAD_HALF * 2),
      roadMaterial(9, 1),
    );
    seg.rotation.x = -Math.PI / 2;
    seg.position.set(0, 0.12, z);
    seg.receiveShadow = true;
    roadGroup.add(seg);
  }
  scene.add(roadGroup);

  // Sidewalk slabs around each block
  const walkMat = new THREE.MeshLambertMaterial({ color: 0x8f8a80 });
  for (let ai = 0; ai < AVENUES.length - 1; ai += 1) {
    for (let si = 0; si < STREETS.length - 1; si += 1) {
      const cx = (AVENUES[ai] + AVENUES[ai + 1]) / 2;
      const cz = (STREETS[si] + STREETS[si + 1]) / 2;
      const slab = new THREE.Mesh(new THREE.PlaneGeometry(49, 49), walkMat);
      slab.rotation.x = -Math.PI / 2;
      slab.position.set(cx, 0.08, cz);
      slab.receiveShadow = true;
      scene.add(slab);
    }
  }

  // ---------- buildings ----------
  const palette = ['#7a6a8a', '#66809e', '#96706a', '#6a8a76', '#97826a', '#5f6f8f', '#8a6a84'];
  const facadeSets = [];
  for (let v = 0; v < 3; v += 1) {
    const map = makeFacadeTexture(rng, palette[v % palette.length], 0.42);
    const em = makeFacadeEmissive(rng, 0.42);
    facadeSets.push({ map, em });
  }
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x2c2f36 });
  const neonGlowTex = makeGlowTexture('rgba(255,120,200,0.9)');

  function addBuilding(x, z, w, d, h, opts = {}) {
    const set = facadeSets[Math.floor(rng.next() * facadeSets.length)];
    const mat = new THREE.MeshLambertMaterial({
      map: set.map, emissiveMap: set.em, emissive: 0xffffff, emissiveIntensity: 0.0,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.94, 0.8, d * 0.94), roofMat);
    roof.position.set(x, h + 0.4, z);
    scene.add(roof);
    // Rooftop box / antenna on tall towers
    if (h > 30 && rng.chance(0.6)) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 4), roofMat);
      box.position.set(x + w * 0.2, h + 2.2, z);
      scene.add(box);
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 9, 6),
        new THREE.MeshLambertMaterial({ color: 0x888888 }));
      ant.position.set(x - w * 0.25, h + 5, z);
      scene.add(ant);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      tip.position.set(x - w * 0.25, h + 9.6, z);
      scene.add(tip);
      world.neonSigns.push(tip);
    }
    world.buildings.push({ x, z, w, d, h, mesh, mat });
    world.facadeMats.push(mat);
    world.colliders.push({ x, z, hw: w / 2, hd: d / 2 });
    if (opts.neon) {
      const [text, color] = opts.neon;
      const ntex = makeNeonTexture(text, color);
      const nmat = new THREE.MeshBasicMaterial({ map: ntex, transparent: true });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(26, w * 0.9), 6.5), nmat);
      // Face the nearest road so the sign reads from the street.
      let nearestAv = AVENUES[0];
      let bestD = Infinity;
      for (const ax of AVENUES) { const d = Math.abs(ax - x); if (d < bestD) { bestD = d; nearestAv = ax; } }
      let nearestSt = STREETS[0];
      bestD = Infinity;
      for (const sz of STREETS) { const d = Math.abs(sz - z); if (d < bestD) { bestD = d; nearestSt = sz; } }
      if (Math.abs(nearestAv - x) <= Math.abs(nearestSt - z)) {
        const side = nearestAv > x ? 1 : -1;
        sign.position.set(x + side * (w / 2 + 0.25), Math.min(h * 0.72, h - 4), z);
        sign.rotation.y = side * Math.PI / 2;
      } else {
        const side = nearestSt > z ? 1 : -1;
        sign.position.set(x, Math.min(h * 0.72, h - 4), z + side * (d / 2 + 0.25));
        sign.rotation.y = side > 0 ? 0 : Math.PI;
      }
      scene.add(sign);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: neonGlowTex, color, transparent: true, opacity: 0.5, depthWrite: false,
      }));
      glow.scale.set(20, 8, 1);
      glow.position.copy(sign.position);
      scene.add(glow);
      world.neonSigns.push(sign, glow);
      world.neonMats.push(nmat);
      // Wet-road reflection: a coloured glow pool on the ground in front of
      // the sign, strongest when it rains.
      const wet = new THREE.Mesh(new THREE.PlaneGeometry(12, 7),
        new THREE.MeshBasicMaterial({
          map: neonGlowTex, color, transparent: true, opacity: 0, depthWrite: false,
        }));
      wet.rotation.x = -Math.PI / 2;
      const nx = Math.sin(sign.rotation.y);
      const nz = Math.cos(sign.rotation.y);
      wet.position.set(sign.position.x + nx * 5, 0.16, sign.position.z + nz * 5);
      scene.add(wet);
      world.wetGlows.push(wet);
    }
    return mesh;
  }

  const specialBlocks = new Set([
    '30,30', // club block
    '-150,-90', // park
    '150,-150', // casino
    '90,-30', // bank
    '-90,30', // garage
    '-30,150', // hospital
    '150,90', // police HQ
    '415,-60', // island (not a grid block)
  ]);
  for (let ai = 0; ai < AVENUES.length - 1; ai += 1) {
    for (let si = 0; si < STREETS.length - 1; si += 1) {
      const cx = (AVENUES[ai] + AVENUES[ai + 1]) / 2;
      const cz = (STREETS[si] + STREETS[si + 1]) / 2;
      if (specialBlocks.has(`${cx},${cz}`)) continue;
      const distCentre = Math.hypot(cx, cz);
      const tall = distCentre < 130;
      const count = rng.int(1, 2);
      for (let b = 0; b < count; b += 1) {
        const w = rng.range(16, 30);
        const d = rng.range(16, 30);
        const h = tall ? rng.range(18, 58) : rng.range(9, 26);
        const ox = count === 1 ? 0 : (b === 0 ? -11 : 11);
        const oz = count === 1 ? 0 : (b === 0 ? -9 : 10);
        const neon = rng.chance(0.35) ? rng.pick(NEON_TEXTS) : null;
        addBuilding(cx + ox, cz + oz, w, d, h, neon ? { neon } : {});
      }
    }
  }

  // Landmark buildings (taller, named, neon)
  addBuilding(PLACES.club.x, PLACES.club.z, 30, 22, 16, { neon: ['CLUB LUMEN', '#ff2e88'] });
  addBuilding(PLACES.casino.x, PLACES.casino.z, 34, 26, 30, { neon: ['CASINO DEL MAR', '#ffd23e'] });
  addBuilding(PLACES.bank.x, PLACES.bank.z, 26, 20, 24, { neon: ['CORAL BAY BANK', '#37e0ff'] });
  addBuilding(PLACES.garage.x, PLACES.garage.z, 24, 18, 9, { neon: ['MAKO GARAGE', '#7CFC00'] });
  addBuilding(PLACES.hospital.x, PLACES.hospital.z, 28, 20, 20, { neon: ['ST. MARINA', '#ffffff'] });
  addBuilding(PLACES.policeHQ.x, PLACES.policeHQ.z, 26, 22, 18, { neon: ['CBPD', '#4d9fff'] });
  // Island resort towers
  addBuilding(ISLAND.x - 18, ISLAND.z - 12, 20, 16, 26, { neon: ['HOTEL CORAL', '#37e0ff'] });
  addBuilding(ISLAND.x + 16, ISLAND.z + 14, 16, 14, 18, { neon: ['CORAL CAY', '#c86bff'] });

  // Park: trees + pond instead of buildings
  const treeTrunk = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const treeTop = new THREE.MeshLambertMaterial({ color: 0x2f6b34 });
  function addPalm(x, z, scale = 1) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * scale, 0.55 * scale, 7 * scale, 7), treeTrunk);
    trunk.position.y = 3.5 * scale;
    trunk.rotation.z = 0.08;
    g.add(trunk);
    for (let i = 0; i < 6; i += 1) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1 * scale, 4.4 * scale, 5), treeTop);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.6 * scale, 7 * scale, Math.sin(a) * 1.6 * scale);
      leaf.rotation.z = Math.cos(a) * 1.1;
      leaf.rotation.x = -Math.sin(a) * 1.1;
      g.add(leaf);
    }
    g.position.set(x, 0, z);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(g);
    world.palms.push({ group: g, phase: rng.range(0, Math.PI * 2) });
    return g;
  }
  for (let i = 0; i < 14; i += 1) {
    addPalm(PLACES.park.x + rng.range(-20, 20), PLACES.park.z + rng.range(-18, 18), rng.range(0.8, 1.3));
  }
  const pond = new THREE.Mesh(new THREE.CircleGeometry(9, 24),
    new THREE.MeshPhongMaterial({ color: 0x1a7f9e, shininess: 120 }));
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(PLACES.park.x + 8, 0.15, PLACES.park.z - 6);
  scene.add(pond);

  // Palms along the beach and the avenues
  for (let z = -260; z <= 200; z += 34) {
    addPalm(278 + rng.range(-3, 3), z + rng.range(-6, 6), rng.range(0.9, 1.4));
  }
  for (let i = 0; i < 26; i += 1) {
    const ax = rng.pick(AVENUES);
    const z = rng.range(-240, 180);
    addPalm(ax + 8.5, z, rng.range(0.7, 1.1));
  }
  for (let i = 0; i < 8; i += 1) {
    addPalm(ISLAND.x + rng.range(-45, 45), ISLAND.z + rng.range(-40, 40), rng.range(0.9, 1.4));
  }

  // ---------- streetlights ----------
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c2f36 });
  const lampGlow = makeGlowTexture('rgba(255,214,140,0.95)');
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe6a0 });
  for (const x of AVENUES) {
    for (let z = -240; z <= 180; z += 60) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 7.5, 6), poleMat);
      pole.position.set(x + 7.2, 3.75, z);
      scene.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.16, 0.16), poleMat);
      arm.position.set(x + 6.2, 7.4, z);
      scene.add(arm);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 8), lampHeadMat.clone());
      head.position.set(x + 5.2, 7.3, z);
      scene.add(head);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: lampGlow, transparent: true, opacity: 0.0, depthWrite: false,
      }));
      glow.scale.set(7, 7, 1);
      glow.position.copy(head.position);
      scene.add(glow);
      world.streetlightHeads.push({ head, glow });
    }
  }
  // A few real point lights on the main drag (cheap count, big night payoff)
  world.nightLights = [];
  const lampLightSpots = [
    [0, -60], [0, 60], [60, 0], [-60, 0], [30, 30], [150, -150],
  ];
  for (const [lx, lz] of lampLightSpots) {
    const pl = new THREE.PointLight(0xffc46b, 0, 55, 1.6);
    pl.position.set(lx + 5, 7, lz);
    scene.add(pl);
    world.nightLights.push(pl);
  }
  const clubLight = new THREE.PointLight(0xff2e88, 0, 60, 1.5);
  clubLight.position.set(PLACES.club.x, 9, PLACES.club.z + 14);
  scene.add(clubLight);
  world.nightLights.push(clubLight);

  // ---------- street props: traffic lights, hydrants, benches, billboards ----------
  const propDark = new THREE.MeshLambertMaterial({ color: 0x2c2f36 });
  const propRed = new THREE.MeshLambertMaterial({ color: 0xc22a2a });
  const benchWood = new THREE.MeshLambertMaterial({ color: 0x7a5a34 });
  // Traffic lights at the main intersections.
  for (const ix of [0, 120]) {
    for (const iz of [-60, 60]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 6.5, 6), propDark);
      pole.position.set(ix + 7, 3.25, iz + 7);
      scene.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.0, 0.7), propDark);
      head.position.set(ix + 7, 6.6, iz + 7);
      scene.add(head);
      for (let li = 0; li < 3; li += 1) {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8),
          new THREE.MeshBasicMaterial({ color: li === 1 ? 0x37d67a : 0x333333 }));
        lamp.position.set(ix + 7, 7.3 - li * 0.65, iz + 7.4);
        scene.add(lamp);
      }
    }
  }
  // Hydrants and benches along the sidewalks.
  for (let i = 0; i < 22; i += 1) {
    const hx = rng.pick(AVENUES) + rng.pick([-8.6, 8.6]);
    const hz = rng.range(-230, 180);
    const hyd = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.9, 8), propRed);
    hyd.position.set(hx, 0.45, hz);
    hyd.castShadow = true;
    scene.add(hyd);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), propRed);
    cap.position.set(hx, 0.95, hz);
    scene.add(cap);
  }
  for (let i = 0; i < 14; i += 1) {
    const bx = rng.pick(AVENUES) + rng.pick([-8.6, 8.6]);
    const bz = rng.range(-230, 180);
    const bench = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.16, 0.7), benchWood);
    seat.position.y = 0.55;
    seat.castShadow = true;
    bench.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 0.14), benchWood);
    back.position.set(0, 0.95, -0.3);
    bench.add(back);
    for (const lx of [-0.9, 0.9]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.6), propDark);
      leg.position.set(lx, 0.28, 0);
      bench.add(leg);
    }
    bench.position.set(bx, 0, bz);
    bench.rotation.y = rng.chance(0.5) ? 0 : Math.PI / 2;
    scene.add(bench);
  }
  // Billboards with painted ads on a few towers.
  const billboardAds = [
    ['CORAL BAY', 'VISIT THE CAY', '#37e0ff'],
    ['NEON COLA', 'TASTE THE NIGHT', '#ff2e88'],
    ['SUNSET AIR', 'FLY CHEAP', '#ffd23e'],
  ];
  for (let i = 0; i < 6; i += 1) {
    const b = world.buildings[Math.floor(rng.next() * world.buildings.length)];
    if (!b || b.h < 20) continue;
    const [line1, line2, color] = billboardAds[i % billboardAds.length];
    const btex = makeCanvasTexture(512, 256, (ctx, w, h) => {
      ctx.fillStyle = '#101018';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = color;
      ctx.lineWidth = 6;
      ctx.strokeRect(8, 8, w - 16, h - 16);
      ctx.textAlign = 'center';
      ctx.fillStyle = color;
      ctx.font = 'bold 64px Arial';
      ctx.fillText(line1, w / 2, h / 2 - 8);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 40px Arial';
      ctx.fillText(line2, w / 2, h / 2 + 52);
    });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(18, 9),
      new THREE.MeshBasicMaterial({ map: btex }));
    board.position.set(b.x, b.h - 6, b.z + b.d / 2 + 0.3);
    scene.add(board);
    world.neonSigns.push(board);
  }
  // Awnings over the sidewalks in front of a few shops.
  const awningColors = [0xff2e88, 0x37e0ff, 0x7CFC00, 0xff7a1a];
  for (let i = 0; i < 12; i += 1) {
    const b = world.buildings[Math.floor(rng.next() * world.buildings.length)];
    if (!b) continue;
    const awn = new THREE.Mesh(new THREE.BoxGeometry(Math.min(14, b.w * 0.7), 0.25, 3.2),
      new THREE.MeshLambertMaterial({ color: awningColors[i % awningColors.length] }));
    awn.position.set(b.x, 4.2, b.z + b.d / 2 + 1.6);
    awn.rotation.x = 0.18;
    scene.add(awn);
  }

  // ---------- ferris wheel on the beach (rotates, lit at night) ----------
  const ferris = new THREE.Group();
  const wheelR = 20;
  const legMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.0, 26, 8), legMat);
    leg.position.set(0, 13, s * 7);
    leg.rotation.x = s * 0.28;
    ferris.add(leg);
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 16, 10), legMat);
  axle.rotation.x = Math.PI / 2;
  axle.position.set(0, 26, 0);
  ferris.add(axle);
  const wheel = new THREE.Group();
  wheel.position.set(0, 26, 0);
  const ferrisCabins = [];
  const rim = new THREE.Mesh(new THREE.TorusGeometry(wheelR, 0.5, 8, 40),
    new THREE.MeshLambertMaterial({ color: 0xd8d3c8 }));
  wheel.add(rim);
  const rim2 = new THREE.Mesh(new THREE.TorusGeometry(wheelR * 0.62, 0.4, 8, 32),
    new THREE.MeshLambertMaterial({ color: 0xd8d3c8 }));
  wheel.add(rim2);
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.4, wheelR * 2, 0.4), legMat);
    spoke.position.set(Math.cos(a) * wheelR / 2, Math.sin(a) * wheelR / 2, 0);
    spoke.rotation.z = a - Math.PI / 2;
    wheel.add(spoke);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 2.2),
      new THREE.MeshLambertMaterial({ color: [0xff2e88, 0x37e0ff, 0xffd23e, 0x7CFC00][i % 4] }));
    cabin.position.set(Math.cos(a) * wheelR, Math.sin(a) * wheelR, 0);
    wheel.add(cabin);
    ferrisCabins.push(cabin);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8),
      new THREE.MeshBasicMaterial({ color: [0xff2e88, 0x37e0ff, 0xffd23e, 0x7CFC00][i % 4] }));
    bulb.position.set(Math.cos(a) * wheelR, Math.sin(a) * wheelR, 1.4);
    wheel.add(bulb);
    world.neonGlows.push(bulb);
  }
  ferris.add(wheel);
  ferris.position.set(298, 0, 120);
  ferris.rotation.y = Math.PI / 2;
  scene.add(ferris);
  world.ferris = { group: ferris, wheel, cabins: ferrisCabins };

  // ---------- market stalls near the docks ----------
  const stallColors = [0xc22a2a, 0x2f9e44, 0xe8a33d, 0x37e0ff];
  for (let i = 0; i < 6; i += 1) {
    const stall = new THREE.Group();
    const counter = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.1, 2.0),
      new THREE.MeshLambertMaterial({ color: 0x6b4a2f }));
    counter.position.y = 0.55;
    counter.castShadow = true;
    stall.add(counter);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.18, 2.6),
      new THREE.MeshLambertMaterial({ color: stallColors[i % stallColors.length] }));
    roof.position.y = 2.4;
    roof.rotation.x = 0.12;
    stall.add(roof);
    for (const [px, pz] of [[-1.6, -1.0], [1.6, -1.0], [-1.6, 1.0], [1.6, 1.0]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.4, 6), legMat);
      post.position.set(px, 1.2, pz);
      stall.add(post);
    }
    // Fruit crates on the counter.
    for (let c = 0; c < 3; c += 1) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.7),
        new THREE.MeshLambertMaterial({ color: [0xe8a33d, 0x2f9e44, 0xd21f3c][c % 3] }));
      crate.position.set(-1 + c * 1.0, 1.35, 0);
      stall.add(crate);
    }
    stall.position.set(-210 + i * 9, 0, 214);
    stall.rotation.y = rng.range(-0.2, 0.2);
    scene.add(stall);
  }

  // ---------- traffic signs: stop signs + street names ----------
  const signPoleMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
  function addStopSign(x, z) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 6), signPoleMat);
    pole.position.set(x, 1.3, z);
    scene.add(pole);
    const oct = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 8),
      new THREE.MeshLambertMaterial({ color: 0xc22a2a }));
    oct.rotation.x = Math.PI / 2;
    oct.position.set(x, 2.7, z);
    scene.add(oct);
  }
  for (const [sx, sz] of [[-53, -53], [67, -53], [-53, 67], [127, 67], [187, -113]]) {
    addStopSign(sx, sz);
  }
  // Street-name blades on the main drag.
  for (const [sx, sz, name] of [[0, -60, 'OCEAN DR'], [0, 60, 'PALM AVE'], [60, 0, 'SUNSET BLVD'], [-120, 0, 'HARBOUR RD']]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.6, 0.1),
      new THREE.MeshLambertMaterial({ color: 0x1f6fb2 }));
    blade.position.set(sx + 7, 5.6, sz);
    scene.add(blade);
  }

  // ---------- boats cruising the bay ----------
  const boatHullMat = new THREE.MeshLambertMaterial({ color: 0xe8e2d4 });
  const boatTrimMat = new THREE.MeshLambertMaterial({ color: 0x1f6fb2 });
  for (let i = 0; i < 3; i += 1) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 6.5), boatHullMat);
    hull.position.y = 0.5;
    boat.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.0, 4), boatHullMat);
    bow.rotation.x = -Math.PI / 2;
    bow.rotation.y = Math.PI / 4;
    bow.position.set(0, 0.5, 4.1);
    boat.add(bow);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 2.4), boatTrimMat);
    cabin.position.set(0, 1.4, -0.8);
    boat.add(cabin);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.2, 6), legMat);
    mast.position.set(0, 3.0, -0.8);
    boat.add(mast);
    scene.add(boat);
    world.boats.push({
      mesh: boat, cx: 400 + i * 22, cz: -20 + i * 45,
      rx: 55 + i * 14, rz: 42 + i * 10, angle: rng.range(0, Math.PI * 2),
      speed: 0.05 + i * 0.012,
    });
  }

  // ---------- birds circling the beach and the park ----------
  const birdMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, side: THREE.DoubleSide });
  for (let f = 0; f < 3; f += 1) {
    const flock = new THREE.Group();
    const birds = [];
    for (let b = 0; b < 4; b += 1) {
      const bird = new THREE.Group();
      const wingGeo = new THREE.PlaneGeometry(1.6, 0.5);
      const wingL = new THREE.Mesh(wingGeo, birdMat);
      wingL.position.x = -0.8;
      const wingR = new THREE.Mesh(wingGeo, birdMat);
      wingR.position.x = 0.8;
      bird.add(wingL, wingR);
      bird.userData.wingL = wingL;
      bird.userData.wingR = wingR;
      bird.position.set(b * 3 - 4, b * 1.2, (b % 2) * 3 - 1);
      flock.add(bird);
      birds.push(bird);
    }
    scene.add(flock);
    world.birds.push({
      flock, birds,
      cx: f === 0 ? 330 : f === 1 ? -150 : 415,
      cz: f === 0 ? 60 : f === 1 ? -90 : -120,
      y: 55 + f * 12, r: 40 + f * 14,
      angle: rng.range(0, Math.PI * 2), speed: 0.12 + f * 0.03,
    });
  }

  // ---------- clouds ----------
  const cloudMat = new THREE.MeshLambertMaterial({
    color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false,
  });
  for (let i = 0; i < 10; i += 1) {
    const cloud = new THREE.Group();
    const puffs = rng.int(3, 5);
    for (let p = 0; p < puffs; p += 1) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(rng.range(8, 18), 10, 8), cloudMat);
      s.position.set(p * 12 - puffs * 6, rng.range(-2, 3), rng.range(-6, 6));
      s.scale.y = 0.45;
      cloud.add(s);
    }
    cloud.position.set(rng.range(-320, 420), rng.range(90, 150), rng.range(-300, 240));
    scene.add(cloud);
    world.clouds.push(cloud);
  }

  // ---------- sun / moon sprites ----------
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture('rgba(255,190,90,1)'), transparent: true, depthWrite: false,
  }));
  sunSprite.scale.set(120, 120, 1);
  scene.add(sunSprite);
  world.sunSprite = sunSprite;

  // ---------- rain ----------
  const rainCount = 1600;
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(rainCount * 3);
  for (let i = 0; i < rainCount; i += 1) {
    rainPos[i * 3] = rng.range(-260, 260);
    rainPos[i * 3 + 1] = rng.range(0, 60);
    rainPos[i * 3 + 2] = rng.range(-260, 220);
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainMat = new THREE.PointsMaterial({
    color: 0xaaccee, size: 0.55, transparent: true, opacity: 0.0, sizeAttenuation: true,
  });
  const rain = new THREE.Points(rainGeo, rainMat);
  rain.visible = false;
  scene.add(rain);
  world.rain = { points: rain, mat: rainMat, count: rainCount };

  // ---------- spawn points ----------
  for (const x of AVENUES) {
    for (const z of STREETS) {
      if (Math.abs(x) < 250 && Math.abs(z) < 200) {
        world.carSpawns.push({ x: x + (rng.chance(0.5) ? 2.6 : -2.6), z: z + rng.range(-40, 40) });
      }
    }
  }
  for (let i = 0; i < 40; i += 1) {
    world.pedSpawns.push({
      x: rng.pick(AVENUES) + rng.range(7, 9),
      z: rng.range(-240, 180),
    });
  }
  return world;
}

/** Sky, sun, windows and streetlights for a time of day (hours 0..24) and weather. */
export function applyTimeOfDay(world, scene, hours, weather) {
  const t = ((hours % 24) + 24) % 24;
  // Sun elevation: peaks at noon, below horizon 18:30..06:30.
  const sunAngle = ((t - 6) / 12) * Math.PI;
  const elev = Math.sin(sunAngle);
  const isDay = elev > 0.02;
  const golden = elev > 0 && elev < 0.42;
  const night = elev <= 0.02;

  let sky;
  let fogColor;
  const storm = weather === 'storm';
  if (storm) {
    sky = night ? 0x141824 : 0x2a2f3a;
    fogColor = 0x232833;
  } else if (night) {
    const dusk = elev > -0.18;
    sky = dusk ? 0x2c1e44 : 0x0b1026;
    fogColor = dusk ? 0x241a38 : 0x0b1026;
  } else if (golden) {
    sky = 0xff9a52;
    fogColor = 0xe08a5a;
  } else {
    sky = weather === 'rain' ? 0x5a6b7d : 0x7fb4dd;
    fogColor = weather === 'rain' ? 0x55636f : 0x9cc4e0;
  }
  scene.background.setHex(sky);
  scene.fog.color.setHex(fogColor);
  scene.fog.near = storm ? 50 : night ? 60 : 140;
  scene.fog.far = storm ? 380 : night ? 520 : 900;

  const sun = world.sunLight;
  sun.position.set(Math.cos(sunAngle) * -260, Math.max(18, elev * 320), 160);
  if (storm) {
    sun.intensity = 0.35;
    sun.color.setHex(0x9aa2b0);
  } else if (night) {
    sun.intensity = 0.12;
    sun.color.setHex(0x8fa8d8);
  } else if (golden) {
    sun.intensity = 2.6;
    sun.color.setHex(0xff9a4d);
  } else {
    sun.intensity = weather === 'rain' ? 1.1 : 2.1;
    sun.color.setHex(weather === 'rain' ? 0xd8dce2 : 0xfff2d8);
  }
  world.moonLight.intensity = night ? 0.55 : 0;
  world.hemiLight.intensity = storm ? 0.5 : night ? 0.45 : golden ? 0.85 : weather === 'rain' ? 0.7 : 1.05;
  world.ambientLight.intensity = storm ? 0.5 : night ? 0.5 : golden ? 0.55 : 0.65;
  world.hemiLight.color.setHex(night ? 0x4a5a8a : golden ? 0xffc27a : 0xbfd8ff);
  world.hemiLight.groundColor.setHex(night ? 0x0c1220 : 0x3a4a3a);

  // Windows glow after dusk; streetlights too.
  const nightFactor = night ? 1 : golden ? 0.35 : 0;
  for (const mat of world.facadeMats) mat.emissiveIntensity = nightFactor * 1.15;
  for (const { head, glow } of world.streetlightHeads) {
    head.material.color.setHex(night ? 0xffe6a0 : 0x8a8a7a);
    glow.material.opacity = night ? 0.55 : 0;
  }
  for (const pl of world.nightLights) pl.intensity = night ? 90 : 0;

  // Sun sprite tracks the sun when it is up (same azimuth as the light).
  const sp = world.sunSprite;
  sp.position.set(Math.cos(sunAngle) * -620, Math.max(40, elev * 560), 100);
  sp.scale.set(240, 240, 1);
  sp.material.opacity = isDay ? (golden ? 0.95 : 0.55) : 0;

  // Rain visuals (rain and storm both fall)
  const raining = weather === 'rain' || weather === 'storm';
  world.rain.points.visible = raining;
  world.rain.mat.opacity = raining ? (weather === 'storm' ? 0.9 : 0.75) : 0;
  if (world.roadMats) {
    for (const m of world.roadMats) {
      m.shininess = raining ? 120 : 26;
      m.specular.setHex(raining ? 0x99aabb : 0x334455);
    }
  }
  // Wet-road neon reflections: strong in the rain, faint at night, gone by day.
  for (const wet of world.wetGlows) {
    wet.material.opacity = raining ? 0.34 : night ? 0.10 : 0;
  }
  return { isDay, golden, night, storm };
  return { isDay, golden, night };
}

/** Animate water waves, clouds, rain, ferris wheel, boats, birds, palms and neon. */
export function animateWorld(world, dt, elapsed, weather) {
  const pos = world.waterMesh.geometry.attributes.position;
  const base = world.waterBase;
  for (let i = 0; i < pos.count; i += 1) {
    const bx = base[i * 3];
    const by = base[i * 3 + 1];
    pos.array[i * 3 + 2] = Math.sin(bx * 0.05 + elapsed * 1.1) * 0.7
      + Math.cos(by * 0.04 + elapsed * 0.8) * 0.7;
  }
  pos.needsUpdate = true;
  world.waterMesh.geometry.computeVertexNormals();

  for (let i = 0; i < world.clouds.length; i += 1) {
    const c = world.clouds[i];
    c.position.x += dt * (2 + i * 0.3);
    if (c.position.x > 460) c.position.x = -360;
  }

  // Ferris wheel turns slowly; its cabins stay level.
  if (world.ferris) {
    world.ferris.wheel.rotation.z += dt * 0.14;
    for (const cabin of world.ferris.cabins) cabin.rotation.z = -world.ferris.wheel.rotation.z;
  }

  // Boats cruise the bay on slow ellipses, bobbing on the swell.
  for (let i = 0; i < world.boats.length; i += 1) {
    const b = world.boats[i];
    b.angle += dt * b.speed;
    const x = b.cx + Math.cos(b.angle) * b.rx;
    const z = b.cz + Math.sin(b.angle) * b.rz;
    b.mesh.position.set(x, 0.3 + Math.sin(elapsed * 1.3 + i * 2) * 0.15, z);
    b.mesh.rotation.y = Math.atan2(-Math.sin(b.angle) * b.rx, Math.cos(b.angle) * b.rz);
    b.mesh.rotation.z = Math.sin(elapsed * 0.9 + i) * 0.03;
  }

  // Birds circle the beach and the park, wings flapping.
  for (const flock of world.birds) {
    flock.angle += dt * flock.speed;
    flock.flock.position.set(
      flock.cx + Math.cos(flock.angle) * flock.r,
      flock.y + Math.sin(elapsed * 0.7 + flock.cx) * 2,
      flock.cz + Math.sin(flock.angle) * flock.r,
    );
    flock.flock.rotation.y = -flock.angle;
    for (let i = 0; i < flock.birds.length; i += 1) {
      const bird = flock.birds[i];
      const flap = Math.sin(elapsed * 6 + i * 1.3) * 0.55;
      bird.userData.wingL.rotation.z = flap;
      bird.userData.wingR.rotation.z = -flap;
    }
  }

  // Palms sway in the sea breeze.
  for (const palm of world.palms) {
    palm.group.rotation.z = Math.sin(elapsed * 0.8 + palm.phase) * 0.035;
    palm.group.rotation.x = Math.cos(elapsed * 0.6 + palm.phase) * 0.02;
  }

  // Neon signs hum and flicker; one in a while a tube buzzes out for a blink.
  for (let i = 0; i < world.neonMats.length; i += 1) {
    const mat = world.neonMats[i];
    let op = 0.86 + 0.14 * Math.sin(elapsed * 2.2 + i * 1.7);
    if (Math.sin(elapsed * 9 + i * 3.1) > 0.985) op = 0.35;
    mat.opacity = op;
  }
  for (let i = 0; i < world.neonGlows.length; i += 1) {
    const glow = world.neonGlows[i];
    if (glow.isSprite) {
      glow.material.opacity = 0.4 + 0.14 * Math.sin(elapsed * 2.2 + i * 1.7);
    }
  }

  const raining = weather === 'rain' || weather === 'storm';
  if (raining) {
    const arr = world.rain.points.geometry.attributes.position.array;
    for (let i = 0; i < world.rain.count; i += 1) {
      arr[i * 3 + 1] -= dt * (weather === 'storm' ? 55 : 42);
      if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 55;
    }
    world.rain.points.geometry.attributes.position.needsUpdate = true;
  }
}

/** Create a tall glowing waypoint beacon at (x, z); returns the group. */
export function makeBeacon(scene, color = 0xffd23e) {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 2.2, 90, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  beam.position.y = 45;
  group.add(beam);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3.2, 0.35, 10, 32),
    new THREE.MeshBasicMaterial({ color }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.4;
  group.add(ring);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.5),
    new THREE.MeshBasicMaterial({ color }),
  );
  diamond.position.y = 9;
  group.add(diamond);
  group.userData.diamond = diamond;
  group.userData.beam = beam;
  scene.add(group);
  return group;
}

export function pulseBeacon(beacon, elapsed) {
  const d = beacon.userData.diamond;
  d.position.y = 9 + Math.sin(elapsed * 2.4) * 1.2;
  d.rotation.y = elapsed * 1.6;
  beacon.userData.beam.material.opacity = 0.22 + Math.sin(elapsed * 2.4) * 0.08;
}

/** Ground height at (x, z): 0 in the city, the bridge arch, 1.0 on the island. */
export function groundHeightAt(x, z) {
  const dx = x - ISLAND.x;
  const dz = z - ISLAND.z;
  if (dx * dx + dz * dz < 58 * 58) return 1.0;
  if (Math.abs(z - (-60)) <= 7 && x >= 280 && x <= 380) {
    if (x < 288) return (x - 280) / 8;
    if (x <= 372) return 1 + 5 * Math.sin(Math.PI * (x - 288) / 84);
    return 1.0;
  }
  return 0;
}

/** Nearest road point (snapped onto the avenue/street grid) to (x, z). */
export function nearestRoadPoint(x, z) {
  let bestX = AVENUES[0];
  let bestD = Infinity;
  for (const ax of AVENUES) {
    const d = Math.abs(ax - x);
    if (d < bestD) { bestD = d; bestX = ax; }
  }
  let bestZ = STREETS[0];
  bestD = Infinity;
  for (const sz of STREETS) {
    const d = Math.abs(sz - z);
    if (d < bestD) { bestD = d; bestZ = sz; }
  }
  // If closer to an avenue line than a street line, snap x; else snap z.
  if (Math.abs(bestX - x) <= Math.abs(bestZ - z)) return { x: bestX, z: clamp(z, -250, 190) };
  return { x: clamp(x, -250, 250), z: bestZ };
}

export function isOnRoad(x, z) {
  for (const ax of AVENUES) if (Math.abs(ax - x) < ROAD_HALF + 1) return true;
  for (const sz of STREETS) if (Math.abs(sz - z) < ROAD_HALF + 1) return true;
  return false;
}

export function clampToCity(x, z) {
  return {
    x: clamp(x, CITY_MIN_X, 520),
    z: clamp(z, CITY_MIN_Z, CITY_MAX_Z),
  };
}
