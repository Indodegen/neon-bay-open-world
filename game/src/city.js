// NEON BAY — city.js
// Procedural Neon Bay: six districts, a road grid, extruded buildings with lit
// windows and neon signs, a beachfront, a bay with an island reached by bridge,
// parks, palms, street lamps and the landmarks missions use. Everything is
// generated from one seed so every run (and every screenshot preset) shares
// the same city. Collision data lives here too.

import { clamp, mulberry32, pickRandom, randomInt, randomRange, rectsOverlap } from './utils.js';

export const WORLD_W = 4600;
export const WORLD_H = 3200;

export const DISTRICTS = [
  { id: 'downtown', name: 'Downtown', x: 300, y: 300, w: 1500, h: 1200, palette: ['#2e3d5c', '#3a4a6b', '#27324e', '#46587a'], neon: 0.55, tall: true },
  { id: 'strip', name: 'Neon Strip', x: 300, y: 1500, w: 1500, h: 900, palette: ['#5c2e4d', '#6b3a5c', '#4e2742', '#7a4658'], neon: 0.9, tall: false },
  { id: 'port', name: 'Old Port', x: 300, y: 2400, w: 1500, h: 600, palette: ['#3d4a3a', '#4a5540', '#333d31', '#55604a'], neon: 0.25, tall: false },
  { id: 'hills', name: 'Coral Hills', x: 2100, y: 300, w: 1500, h: 900, palette: ['#6b5a3a', '#7a6a4a', '#5c4e31', '#8a7a55'], neon: 0.2, tall: false },
  { id: 'marina', name: 'Marina', x: 2100, y: 1200, w: 1500, h: 1100, palette: ['#2e5c5c', '#3a6b6b', '#274e4e', '#467a7a'], neon: 0.45, tall: false },
  { id: 'beach', name: 'Beachfront', x: 3600, y: 300, w: 400, h: 2600, palette: ['#c9a06b', '#d4af7a', '#b8935c', '#e0c08a'], neon: 0.35, tall: false },
];

export const ROAD_X = [300, 900, 1500, 2100, 2700, 3300, 3900];
export const ROAD_Y = [300, 800, 1300, 1800, 2300, 2800];
export const ROAD_W = 86;

export const BAY = { x: 4020, y: 0, w: 580, h: 3200 };
export const BEACH = { x: 3860, y: 0, w: 160, h: 3200 };
export const ISLAND = { x: 4180, y: 560, w: 320, h: 420 };
export const BRIDGE = { x: 3860, y: 730, w: 740, h: 60 };

export const NEON_WORDS = ['NEON', 'BAY', 'HOTEL', 'CASINO', 'TACOS', 'PIER', 'CLUB', 'BAR', '24H', 'DANCE', 'SUSHI', 'MOTEL', 'ARCADE', 'PALMS', 'LUNA', 'VICE', 'SOL', 'RIO'];
export const NEON_COLORS = ['#ff2e88', '#00e5ff', '#ffe600', '#7cff00', '#ff6a00', '#b967ff', '#ff3860'];

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x && x <= d.x + d.w && y >= d.y && y <= d.y + d.h) return d;
  }
  if (x >= BAY.x) return { id: 'bay', name: 'Neon Bay', palette: ['#1d4a6b'], neon: 0, tall: false };
  return DISTRICTS[0];
}

export function generateCity(seed) {
  const rng = mulberry32(seed);
  const buildings = [];
  const lamps = [];
  const palms = [];
  const parks = [];
  const signs = [];

  // Blocks between roads get buildings; keep a margin so sidewalks stay clear.
  for (let gx = 0; gx < ROAD_X.length - 1; gx++) {
    for (let gy = 0; gy < ROAD_Y.length - 1; gy++) {
      const bx0 = ROAD_X[gx] + ROAD_W / 2 + 26;
      const by0 = ROAD_Y[gy] + ROAD_W / 2 + 26;
      const bx1 = ROAD_X[gx + 1] - ROAD_W / 2 - 26;
      const by1 = ROAD_Y[gy + 1] - ROAD_W / 2 - 26;
      const bw = bx1 - bx0;
      const bh = by1 - by0;
      if (bw < 120 || bh < 120) continue;
      const cx = (bx0 + bx1) / 2;
      const cy = (by0 + by1) / 2;
      const d = districtAt(cx, cy);
      if (d.id === 'beach') continue;
      // One park per few blocks, more in Marina and Hills.
      if (rng() < (d.id === 'marina' || d.id === 'hills' ? 0.22 : 0.1)) {
        parks.push({ x: bx0 + 10, y: by0 + 10, w: bw - 20, h: bh - 20, trees: randomInt(rng, 5, 12) });
        continue;
      }
      const cols = bw > 340 ? 2 : 1;
      const rows = bh > 300 ? 2 : 1;
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const w = bw / cols - 24;
          const h = bh / rows - 24;
          const x = bx0 + c * (bw / cols) + 12;
          const y = by0 + r * (bh / rows) + 12;
          const height = d.tall
            ? randomInt(rng, 26, 78)
            : d.id === 'strip' ? randomInt(rng, 14, 34) : randomInt(rng, 10, 26);
          const color = pickRandom(rng, d.palette);
          const winCols = Math.max(2, Math.floor(w / 34));
          const winRows = Math.max(2, Math.floor(h / 30));
          const lit = [];
          for (let i = 0; i < winCols * winRows; i++) lit.push(rng() < 0.55);
          const b = { x, y, w, h, height, color, winCols, winRows, lit, district: d.id, roof: pickRandom(rng, ['#3a4356', '#46536b', '#525d73', '#39424f']), pool: (d.id === 'marina' || d.id === 'strip') && rng() < 0.16 };
          buildings.push(b);
          if (rng() < d.neon) {
            signs.push({
              x: x + w / 2, y: y + h + 4, text: pickRandom(rng, NEON_WORDS),
              color: pickRandom(rng, NEON_COLORS), w: Math.min(w * 0.8, 120),
            });
          }
        }
      }
    }
  }

  // Island buildings: the Bay Island resort.
  for (let i = 0; i < 4; i++) {
    const x = ISLAND.x + 24 + (i % 2) * 150;
    const y = ISLAND.y + 30 + Math.floor(i / 2) * 170;
    buildings.push({
      x, y, w: 120, h: 130, height: 30 + i * 8, color: pickRandom(rng, ['#3a6b6b', '#2e5c5c', '#46587a']),
      winCols: 3, winRows: 4, lit: [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1].map((v) => !!v),
      district: 'island', roof: '#1c2333',
    });
  }

  // Street lamps along every road, palms along the beach and marina.
  for (const rx of ROAD_X) {
    for (let y = 200; y < WORLD_H; y += 260) {
      lamps.push({ x: rx - ROAD_W / 2 - 8, y });
      lamps.push({ x: rx + ROAD_W / 2 + 8, y: y + 130 });
    }
  }
  for (const ry of ROAD_Y) {
    for (let x = 200; x < 3900; x += 260) {
      lamps.push({ x, y: ry - ROAD_W / 2 - 8 });
    }
  }
  for (let y = 120; y < WORLD_H; y += 150) {
    palms.push({ x: randomRange(rng, 3880, 3960), y });
    palms.push({ x: randomRange(rng, 3560, 3620), y: y + 70 });
  }
  for (let i = 0; i < 26; i++) {
    palms.push({ x: randomRange(rng, 2150, 3550), y: randomRange(rng, 1250, 2250) });
  }

  return {
    seed, buildings, lamps, palms, parks, signs,
    landmarks: {
      pier: { x: 3930, y: 2050, name: 'Sunset Pier' },
      hospital: { x: 1560, y: 860, name: 'Coral General' },
      policeHQ: { x: 960, y: 1360, name: 'NBPD HQ' },
      garage: { x: 2760, y: 1860, name: "Rico's Garage" },
      veraOffice: { x: 960, y: 1860, name: "Vera's Office" },
      casino: { x: 960, y: 2360, name: 'Luna Casino' },
      marinaDock: { x: 3360, y: 1560, name: 'Marina Dock' },
      islandResort: { x: 4340, y: 770, name: 'Isla Verde Resort' },
      airport: { x: 960, y: 2860, name: 'Bay Airfield' },
    },
  };
}

export function isWater(city, x, y) {
  if (x >= BAY.x && !(y >= BRIDGE.y && y <= BRIDGE.y + BRIDGE.h && x <= BAY.x + BAY.w)) return true;
  if (x >= ISLAND.x && x <= ISLAND.x + ISLAND.w && y >= ISLAND.y && y <= ISLAND.y + ISLAND.h) return false;
  return false;
}

export function onBridge(x, y) {
  return x >= BRIDGE.x && x <= BRIDGE.x + BRIDGE.w && y >= BRIDGE.y && y <= BRIDGE.y + BRIDGE.h;
}

export function isOnRoad(x, y) {
  for (const rx of ROAD_X) if (Math.abs(x - rx) <= ROAD_W / 2) return true;
  for (const ry of ROAD_Y) if (Math.abs(y - ry) <= ROAD_W / 2) return true;
  return onBridge(x, y);
}

export function nearestRoadPoint(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const rx of ROAD_X) {
    for (const ry of ROAD_Y) {
      const d = (x - rx) * (x - rx) + (y - ry) * (y - ry);
      if (d < bestD) { bestD = d; best = { x: rx, y: ry }; }
    }
  }
  return best;
}

export function collideCircleWithCity(city, x, y, r) {
  // Returns a corrected {x, y} pushed out of buildings, water and world bounds.
  let nx = clamp(x, 30, WORLD_W - 30);
  let ny = clamp(y, 30, WORLD_H - 30);
  for (const b of city.buildings) {
    if (rectsOverlap(nx - r, ny - r, r * 2, r * 2, b.x, b.y, b.w, b.h)) {
      const dxl = nx + r - b.x;
      const dxr = b.x + b.w - (nx - r);
      const dyt = ny + r - b.y;
      const dyb = b.y + b.h - (ny - r);
      const m = Math.min(dxl, dxr, dyt, dyb);
      if (m === dxl) nx = b.x - r;
      else if (m === dxr) nx = b.x + b.w + r;
      else if (m === dyt) ny = b.y - r;
      else ny = b.y + b.h + r;
    }
  }
  if (isWater(city, nx, ny) && !onBridge(nx, ny)) {
    // Push back toward the beach: water is only on the east edge.
    nx = Math.min(nx, BAY.x - r - 2);
  }
  return { x: nx, y: ny };
}

export function circleHitsBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    if (rectsOverlap(x - r, y - r, r * 2, r * 2, b.x, b.y, b.w, b.h)) return b;
  }
  return null;
}
