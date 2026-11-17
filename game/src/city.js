// city.js — Neon Bay itself: the map, its districts, and every query the
// game needs about it (roads, water, buildings, collisions) plus its drawing.
// The city is built once from a fixed seed, so it never changes between loads.
import { Rng } from './random.js';
import { WORLD, PALETTE } from './config.js';

export const CITY_SEED = 20261124;

const ROADS_V = [400, 800, 1200, 1600, 2000, 2400, 2800, 3200];
const ROADS_H = [300, 700, 1100, 1500, 1900, 2300];

const DISTRICTS = {
  downtown: { x0: 1100, y0: 600, x1: 2500, y1: 2000 },
  beachfront: { x0: 300, y0: 0, x1: 900, y1: 2600 },
  market: { x0: 900, y0: 1900, x1: 2800, y1: 2380 },
  industrial: { x0: 2800, y0: 0, x1: 3600, y1: 1900 },
};

function districtAt(x, y) {
  if (x >= DISTRICTS.downtown.x0 && x <= DISTRICTS.downtown.x1 && y >= DISTRICTS.downtown.y0 && y <= DISTRICTS.downtown.y1) return 'downtown';
  if (x <= 900) return 'beachfront';
  if (y >= 1900 && y <= 2380) return 'market';
  if (x >= 2800) return 'industrial';
  return 'residential';
}

function makeBuilding(rng, x, y, w, h, district) {
  const tall = district === 'downtown';
  const floors = tall ? rng.int(9, 18) : district === 'beachfront' ? rng.int(2, 5) : rng.int(2, 6);
  const baseColors = {
    downtown: ['#2c2440', '#332a4d', '#241f38', '#3a2f58'],
    beachfront: ['#4a3a5e', '#5e4632', '#3d4a6b'],
    market: ['#5e2f4a', '#4a3a2e', '#2f4a3a', '#51384f'],
    industrial: ['#33302e', '#3a3630', '#2e2a33'],
    residential: ['#3a3049', '#44354a', '#2f3a4a'],
  };
  const neonPool = [PALETTE.neonPink, PALETTE.neonCyan, PALETTE.neonYellow, PALETTE.neonPurple, PALETTE.neonGreen];
  const building = {
    x, y, w, h, floors, district,
    color: rng.pick(baseColors[district] || baseColors.residential),
    neon: rng.chance(tall ? 0.55 : 0.3) ? rng.pick(neonPool) : null,
    sign: null,
    windows: [],
  };
  if (rng.chance(0.16)) {
    building.sign = rng.pick(['HOTEL', 'BAR', '24H', 'NEON', 'TACOS', 'PIER', 'CLUB', 'MOTEL', 'RAMEN', 'DISCO']);
  }
  // Precompute the lit-window grid so drawing is cheap and stable.
  const cols = Math.max(2, Math.floor(w / 26));
  const rows = Math.max(2, Math.floor(h / 26));
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (rng.chance(0.62)) {
        building.windows.push({
          dx: 8 + c * ((w - 16) / cols),
          dy: 8 + r * ((h - 16) / rows),
          color: rng.pick(['#ffd319', '#ff9e5f', '#22e6ff', '#ff2e88', '#fff6ec']),
          warm: rng.chance(0.7),
        });
      }
    }
  }
  return building;
}

export function buildCity() {
  const rng = new Rng(CITY_SEED);
  const city = {
    width: WORLD.width,
    height: WORLD.height,
    roadsV: ROADS_V.slice(),
    roadsH: ROADS_H.slice(),
    buildings: [],
    palms: [],
    lamps: [],
    containers: [],
    landmarks: {},
  };

  // Buildings fill every block between roads, leaving a sidewalk margin.
  const xs = [WORLD.beachEdge, ...ROADS_V, WORLD.width];
  const ys = [0, ...ROADS_H, WORLD.bayTop];
  for (let bi = 0; bi < xs.length - 1; bi++) {
    for (let bj = 0; bj < ys.length - 1; bj++) {
      const x0 = xs[bi] + WORLD.roadWidth / 2 + WORLD.sidewalk + 8;
      const x1 = xs[bi + 1] - WORLD.roadWidth / 2 - WORLD.sidewalk - 8;
      const y0 = ys[bj] + WORLD.roadWidth / 2 + WORLD.sidewalk + 8;
      const y1 = ys[bj + 1] - WORLD.roadWidth / 2 - WORLD.sidewalk - 8;
      if (x1 - x0 < 90 || y1 - y0 < 90) continue;
      // Skip the island and the bridge corridor.
      if (y0 >= WORLD.bayTop) continue;
      const district = districtAt((x0 + x1) / 2, (y0 + y1) / 2);
      const count = district === 'downtown' ? rng.int(2, 4) : rng.int(3, 5);
      for (let n = 0; n < count; n++) {
        const w = rng.range(70, Math.min(150, (x1 - x0) / 2));
        const h = rng.range(70, Math.min(150, (y1 - y0) / 2));
        const x = rng.range(x0, Math.max(x0 + 1, x1 - w));
        const y = rng.range(y0, Math.max(y0 + 1, y1 - h));
        const candidate = makeBuilding(rng, x, y, w, h, district);
        let overlaps = false;
        for (const other of city.buildings) {
          if (x < other.x + other.w + 14 && x + w + 14 > other.x && y < other.y + other.h + 14 && y + h + 14 > other.y) {
            overlaps = true;
            break;
          }
        }
        if (!overlaps) city.buildings.push(candidate);
      }
    }
  }

  // Industrial containers, east side.
  for (let i = 0; i < 26; i++) {
    city.containers.push({
      x: rng.range(2900, 3450),
      y: rng.range(120, 1750),
      w: 58,
      h: 26,
      color: rng.pick(['#ff4757', '#2ed573', '#ffa502', '#70a1ff', '#eccc68']),
      angle: rng.chance(0.5) ? 0 : Math.PI / 2,
    });
  }

  // Palms along the beach.
  for (let y = 60; y < WORLD.height; y += 130) {
    city.palms.push({ x: 215 + rng.range(-14, 14), y: y + rng.range(-20, 20), lean: rng.range(-0.3, 0.3) });
  }
  // Palms on the island.
  for (let i = 0; i < 6; i++) {
    city.palms.push({ x: 1360 + i * 90 + rng.range(-20, 20), y: 2470 + rng.range(-30, 30), lean: rng.range(-0.3, 0.3) });
  }

  // Street lamps along every road, both sides.
  for (const rx of ROADS_V) {
    for (let y = 120; y < WORLD.bayTop; y += 260) {
      city.lamps.push({ x: rx - WORLD.roadWidth / 2 - 8, y });
      city.lamps.push({ x: rx + WORLD.roadWidth / 2 + 8, y: y + 130 });
    }
  }
  for (const ry of ROADS_H) {
    for (let x = 380; x < WORLD.width; x += 260) {
      city.lamps.push({ x, y: ry - WORLD.roadWidth / 2 - 8 });
    }
  }

  // Named landmarks the missions use.
  city.landmarks = {
    garage: { x: 1440, y: 2130, label: 'SUNSET GARAGE' },
    bank: { x: 2080, y: 960, label: 'CORAL BANK' },
    safehouse: { x: 1600, y: 2500, label: 'SAFEHOUSE' },
    hospital: { x: 880, y: 1150, label: 'GENERAL HOSPITAL' },
    policeStation: { x: 2520, y: 1560, label: 'NBPD HQ' },
    pier: { x: 190, y: 700, label: 'MARLIN PIER' },
    club: { x: 2280, y: 1350, label: 'CLUB NEON' },
    market: { x: 1800, y: 2100, label: 'NIGHT MARKET' },
  };
  return city;
}

// --- spatial queries ------------------------------------------------------

export function isWater(city, x, y) {
  if (x < WORLD.seaEdge) return true;
  if (y > WORLD.bayTop) {
    const onBridge = Math.abs(x - WORLD.bridgeX) < WORLD.bridgeHalfWidth && y < WORLD.height;
    const onIsland = x > 1300 && x < 1900 && y > 2420 && y < 2580;
    return !onBridge && !onIsland;
  }
  return false;
}

export function isOnBridge(city, x, y) {
  return Math.abs(x - WORLD.bridgeX) < WORLD.bridgeHalfWidth && y > WORLD.bayTop - 60 && y < WORLD.height;
}

export function isRoad(city, x, y) {
  const half = WORLD.roadWidth / 2;
  for (const rx of city.roadsV) {
    if (Math.abs(x - rx) < half && y < WORLD.bayTop + 40) return true;
    if (Math.abs(x - rx) < half && Math.abs(x - WORLD.bridgeX) < half && y >= WORLD.bayTop) return true;
  }
  for (const ry of city.roadsH) {
    if (Math.abs(y - ry) < half && x > WORLD.beachEdge - 20) return true;
  }
  return false;
}

export function buildingAt(city, x, y, radius) {
  for (const b of city.buildings) {
    if (x + radius > b.x && x - radius < b.x + b.w && y + radius > b.y && y - radius < b.y + b.h) return b;
  }
  return null;
}

// Push a circle out of buildings and water; returns true when it had to move.
export function resolveCollision(city, pos, radius) {
  let moved = false;
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(pos.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(pos.y, b.y + b.h));
    const dx = pos.x - cx;
    const dy = pos.y - cy;
    const distSq = dx * dx + dy * dy;
    if (distSq < radius * radius) {
      if (distSq > 0.01) {
        const dist = Math.sqrt(distSq);
        pos.x = cx + (dx / dist) * radius;
        pos.y = cy + (dy / dist) * radius;
      } else {
        // Dead centre: push out along the smallest penetration axis.
        const left = pos.x - b.x + radius;
        const right = b.x + b.w - pos.x + radius;
        const top = pos.y - b.y + radius;
        const bottom = b.y + b.h - pos.y + radius;
        const min = Math.min(left, right, top, bottom);
        if (min === left) pos.x = b.x - radius;
        else if (min === right) pos.x = b.x + b.w + radius;
        else if (min === top) pos.y = b.y - radius;
        else pos.y = b.y + b.h + radius;
      }
      moved = true;
    }
  }
  if (isWater(city, pos.x, pos.y)) {
    if (pos.x < WORLD.seaEdge) {
      pos.x = WORLD.seaEdge + radius;
    } else if (pos.y > WORLD.bayTop) {
      // South of the island is open water: push back to the island's edge
      // when above it, otherwise back to the bay's north shore.
      if (pos.x > 1300 && pos.x < 1900 && pos.y > 2500) pos.y = WORLD.height - 22 - radius;
      else pos.y = WORLD.bayTop - radius;
    }
    moved = true;
  }
  pos.x = Math.max(20, Math.min(WORLD.width - 20, pos.x));
  pos.y = Math.max(20, Math.min(WORLD.height - 20, pos.y));
  return moved;
}

export function randomRoadPoint(city, rng) {
  if (rng.chance(0.5)) {
    const rx = rng.pick(city.roadsV);
    return { x: rx + rng.range(-28, 28), y: rng.range(80, WORLD.bayTop - 80), angle: rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2 };
  }
  const ry = rng.pick(city.roadsH);
  return { x: rng.range(380, WORLD.width - 80), y: ry + rng.range(-28, 28), angle: rng.chance(0.5) ? 0 : Math.PI };
}

export function randomSidewalkPoint(city, rng) {
  const spot = randomRoadPoint(city, rng);
  spot.x += rng.sign() * (WORLD.roadWidth / 2 + 12);
  return spot;
}

// --- drawing ---------------------------------------------------------------

function drawWater(ctx, city, view, time) {
  // West sea.
  const seaGrad = ctx.createLinearGradient(0, 0, WORLD.seaEdge, 0);
  seaGrad.addColorStop(0, PALETTE.seaDeep);
  seaGrad.addColorStop(1, PALETTE.seaShallow);
  ctx.fillStyle = seaGrad;
  ctx.fillRect(0, 0, WORLD.seaEdge, WORLD.height);
  // South bay.
  const bayGrad = ctx.createLinearGradient(0, WORLD.bayTop, 0, WORLD.height);
  bayGrad.addColorStop(0, PALETTE.seaShallow);
  bayGrad.addColorStop(1, PALETTE.seaDeep);
  ctx.fillStyle = bayGrad;
  ctx.fillRect(0, WORLD.bayTop, WORLD.width, WORLD.height - WORLD.bayTop);
  // Animated wave lines, cheap and pretty.
  ctx.strokeStyle = 'rgba(180, 230, 255, 0.28)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const y = 120 + i * 180 + Math.sin(time * 0.7 + i) * 8;
    ctx.beginPath();
    for (let x = 8; x < WORLD.seaEdge - 8; x += 22) {
      const yy = y + Math.sin(x * 0.05 + time * 1.4 + i) * 4;
      if (x === 8) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 10; i++) {
    const x = 300 + i * 330 + Math.sin(time * 0.5 + i * 2) * 10;
    ctx.beginPath();
    for (let y = WORLD.bayTop + 14; y < WORLD.height - 10; y += 22) {
      const xx = x + Math.sin(y * 0.05 + time * 1.2 + i) * 4;
      if (y === WORLD.bayTop + 14) ctx.moveTo(xx, y); else ctx.lineTo(xx, y);
    }
    ctx.stroke();
  }
}

function drawBeach(ctx, city, time) {
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(WORLD.seaEdge, 0, WORLD.beachEdge - WORLD.seaEdge, WORLD.height);
  void time;
}

// The island is drawn after the roads and the bridge, so the avenue and the
// bridge deck never pave over the safehouse and the lighthouse.
function drawIsland(ctx, city, time) {
  ctx.fillStyle = '#d9b878';
  ctx.beginPath();
  ctx.ellipse(1600, 2500, 300, 80, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a5a34';
  ctx.beginPath();
  ctx.ellipse(1600, 2500, 250, 55, 0, 0, Math.PI * 2);
  ctx.fill();
  // Lighthouse.
  ctx.fillStyle = '#f2ede4';
  ctx.fillRect(1470, 2440, 26, 60);
  ctx.fillStyle = '#ff2e88';
  ctx.fillRect(1470, 2452, 26, 10);
  ctx.fillRect(1470, 2472, 26, 10);
  ctx.fillStyle = PALETTE.neonYellow;
  ctx.beginPath();
  ctx.arc(1483, 2436, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.globalAlpha = 0.18 + 0.08 * Math.sin(time * 2);
  ctx.fillStyle = PALETTE.neonYellow;
  ctx.beginPath();
  ctx.moveTo(1483, 2436);
  ctx.arc(1483, 2436, 260, -0.5 + Math.sin(time * 0.4) * 0.6, 0.5 + Math.sin(time * 0.4) * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // Safehouse cottage.
  ctx.fillStyle = '#7a4a3a';
  ctx.fillRect(1560, 2480, 70, 46);
  ctx.fillStyle = '#c94f4f';
  ctx.beginPath();
  ctx.moveTo(1552, 2482);
  ctx.lineTo(1595, 2452);
  ctx.lineTo(1638, 2482);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PALETTE.neonYellow;
  ctx.fillRect(1588, 2498, 14, 16);
}

function drawRoads(ctx, city) {
  ctx.fillStyle = PALETTE.asphalt;
  for (const rx of city.roadsV) {
    const len = rx === WORLD.bridgeX ? WORLD.height : WORLD.bayTop;
    ctx.fillRect(rx - WORLD.roadWidth / 2, 0, WORLD.roadWidth, len);
  }
  for (const ry of city.roadsH) {
    ctx.fillRect(WORLD.beachEdge, ry - WORLD.roadWidth / 2, WORLD.width - WORLD.beachEdge, WORLD.roadWidth);
  }
  // Sidewalk borders.
  ctx.fillStyle = PALETTE.sidewalk;
  for (const rx of city.roadsV) {
    const len = rx === WORLD.bridgeX ? WORLD.height : WORLD.bayTop;
    ctx.fillRect(rx - WORLD.roadWidth / 2 - WORLD.sidewalk, 0, WORLD.sidewalk, len);
    ctx.fillRect(rx + WORLD.roadWidth / 2, 0, WORLD.sidewalk, len);
  }
  for (const ry of city.roadsH) {
    ctx.fillRect(WORLD.beachEdge, ry - WORLD.roadWidth / 2 - WORLD.sidewalk, WORLD.width - WORLD.beachEdge, WORLD.sidewalk);
    ctx.fillRect(WORLD.beachEdge, ry + WORLD.roadWidth / 2, WORLD.width - WORLD.beachEdge, WORLD.sidewalk);
  }
  // Centre dashes.
  ctx.fillStyle = PALETTE.roadLine;
  for (const rx of city.roadsV) {
    const len = rx === WORLD.bridgeX ? WORLD.height : WORLD.bayTop;
    for (let y = 24; y < len; y += 56) ctx.fillRect(rx - 2, y, 4, 28);
  }
  for (const ry of city.roadsH) {
    for (let x = WORLD.beachEdge + 24; x < WORLD.width; x += 56) ctx.fillRect(x, ry - 2, 28, 4);
  }
  // Crosswalks at every intersection.
  ctx.fillStyle = 'rgba(255, 246, 236, 0.75)';
  for (const rx of city.roadsV) {
    for (const ry of city.roadsH) {
      for (let i = -3; i <= 3; i++) {
        ctx.fillRect(rx + i * 12 - 4, ry - WORLD.roadWidth / 2 + 6, 8, 16);
        ctx.fillRect(rx + i * 12 - 4, ry + WORLD.roadWidth / 2 - 22, 8, 16);
      }
    }
  }
}

function drawBridge(ctx, city, time) {
  const x0 = WORLD.bridgeX - WORLD.bridgeHalfWidth;
  const y0 = WORLD.bayTop - 44;
  ctx.fillStyle = '#3d3448';
  ctx.fillRect(x0, y0, WORLD.bridgeHalfWidth * 2, WORLD.height - y0);
  ctx.fillStyle = '#574a68';
  for (let y = y0 + 10; y < WORLD.height; y += 26) ctx.fillRect(x0 + 4, y, WORLD.bridgeHalfWidth * 2 - 8, 3);
  // Neon edge lights, pulsing.
  const pulse = 0.55 + 0.35 * Math.sin(time * 3);
  ctx.fillStyle = `rgba(255, 46, 136, ${pulse})`;
  ctx.fillRect(x0 - 3, y0, 5, WORLD.height - y0);
  ctx.fillRect(x0 + WORLD.bridgeHalfWidth * 2 - 2, y0, 5, WORLD.height - y0);
  ctx.fillStyle = `rgba(34, 230, 255, ${pulse})`;
  ctx.fillRect(x0 + 2, y0, 3, WORLD.height - y0);
  ctx.fillRect(x0 + WORLD.bridgeHalfWidth * 2 - 5, y0, 3, WORLD.height - y0);
}

function drawBuilding(ctx, b, time) {
  // Long sunset shadow.
  ctx.fillStyle = 'rgba(10, 6, 20, 0.35)';
  ctx.fillRect(b.x + 10 + b.floors * 1.2, b.y + 12 + b.floors * 1.2, b.w, b.h);
  ctx.fillStyle = b.color;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.fillRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
  // Neon roofline.
  if (b.neon) {
    ctx.fillStyle = b.neon;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(b.x, b.y, b.w, 3);
    ctx.fillRect(b.x, b.y, 3, b.h);
    ctx.globalAlpha = 1;
  }
  // Lit windows.
  for (const w of b.windows) {
    ctx.globalAlpha = w.warm ? 0.85 : 0.6;
    ctx.fillStyle = w.color;
    ctx.fillRect(b.x + w.dx, b.y + w.dy, 12, 14);
  }
  ctx.globalAlpha = 1;
  // Neon sign.
  if (b.sign) {
    const signColor = b.neon || PALETTE.neonPink;
    ctx.save();
    ctx.font = 'bold 13px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = signColor;
    ctx.shadowBlur = 12;
    ctx.fillStyle = signColor;
    ctx.fillText(b.sign, b.x + b.w / 2, b.y + b.h / 2 + 4);
    ctx.restore();
  }
}

function drawPalm(ctx, palm, time) {
  const sway = Math.sin(time * 0.9 + palm.y * 0.01) * 3 + palm.lean * 10;
  ctx.strokeStyle = '#6b4a2f';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(palm.x, palm.y);
  ctx.quadraticCurveTo(palm.x + sway * 0.4, palm.y - 18, palm.x + sway, palm.y - 34);
  ctx.stroke();
  ctx.strokeStyle = '#2fae5f';
  ctx.lineWidth = 3;
  for (let i = 0; i < 5; i++) {
    const a = -0.4 - i * 0.45;
    ctx.beginPath();
    ctx.moveTo(palm.x + sway, palm.y - 34);
    ctx.quadraticCurveTo(
      palm.x + sway + Math.cos(a) * 16, palm.y - 34 + Math.sin(a) * 10,
      palm.x + sway + Math.cos(a) * 26, palm.y - 34 + Math.sin(a) * 18,
    );
    ctx.stroke();
  }
}

function drawDistrictLabels(ctx) {
  ctx.save();
  ctx.font = 'bold 44px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255, 246, 236, 0.10)';
  ctx.fillText('D O W N T O W N', 1800, 1050);
  ctx.font = 'bold 34px Arial, sans-serif';
  ctx.fillText('M A R L I N   B E A C H', 620, 1350);
  ctx.fillText('N I G H T   M A R K E T', 1800, 2120);
  ctx.fillText('C O R A L   B A Y', 2600, 2520);
  ctx.restore();
}

export function drawCity(ctx, city, view, time) {
  // Ground.
  ctx.fillStyle = '#1c1a26';
  ctx.fillRect(view.x, view.y, view.w, view.h);
  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  drawWater(ctx, city, view, time);
  drawBeach(ctx, city, time);
  drawRoads(ctx, city);
  drawBridge(ctx, city, time);
  drawIsland(ctx, city, time);
  // Containers.
  for (const c of city.containers) {
    if (c.x < view.x - 80 || c.x > view.x + view.w + 80 || c.y < view.y - 80 || c.y > view.y + view.h + 80) continue;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    ctx.fillStyle = c.color;
    ctx.fillRect(-29, -13, 58, 26);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = -20; i < 30; i += 10) ctx.fillRect(i, -13, 3, 26);
    ctx.restore();
  }
  // Buildings, culled to the view.
  for (const b of city.buildings) {
    if (b.x + b.w < view.x - 60 || b.x > view.x + view.w + 60 || b.y + b.h < view.y - 60 || b.y > view.y + view.h + 60) continue;
    drawBuilding(ctx, b, time);
  }
  drawDistrictLabels(ctx);
  // Palms and lamps, culled.
  for (const palm of city.palms) {
    if (palm.x < view.x - 60 || palm.x > view.x + view.w + 60 || palm.y < view.y - 60 || palm.y > view.y + view.h + 60) continue;
    drawPalm(ctx, palm, time);
  }
  for (const lamp of city.lamps) {
    if (lamp.x < view.x - 40 || lamp.x > view.x + view.w + 40 || lamp.y < view.y - 40 || lamp.y > view.y + view.h + 40) continue;
    ctx.fillStyle = '#2c2838';
    ctx.fillRect(lamp.x - 2, lamp.y - 2, 4, 4);
    ctx.fillStyle = 'rgba(255, 211, 25, 0.9)';
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 211, 25, 0.10)';
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, 22, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Warm sunset wash + vignette, drawn in screen space over the whole frame.
export function drawSunsetLight(ctx, screenW, screenH, time) {
  const grad = ctx.createLinearGradient(0, 0, screenW, screenH);
  grad.addColorStop(0, 'rgba(255, 126, 95, 0.17)');
  grad.addColorStop(0.45, 'rgba(255, 110, 80, 0.08)');
  grad.addColorStop(0.6, 'rgba(255, 46, 136, 0.05)');
  grad.addColorStop(1, 'rgba(43, 16, 85, 0.18)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, screenW, screenH);
  const vig = ctx.createRadialGradient(
    screenW / 2, screenH / 2, Math.min(screenW, screenH) * 0.42,
    screenW / 2, screenH / 2, Math.max(screenW, screenH) * 0.75,
  );
  vig.addColorStop(0, 'rgba(8, 4, 18, 0)');
  vig.addColorStop(1, 'rgba(8, 4, 18, 0.42)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, screenW, screenH);
}
