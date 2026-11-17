// NEON BAY — render.js
// The look of Neon Bay: a sun-soaked coastal city drawn on one canvas —
// extruded buildings with lit windows and glowing neon, a day/night cycle
// with long shadows and lamp pools, rain with wet-road reflections, a bay
// with animated waves, a beach, a bridge to the island, traffic, pedestrians,
// the player, particles and the police helicopter's searchlight.

import { clamp, dist } from './utils.js';
import { WORLD_W, WORLD_H, BAY, BEACH, ISLAND, BRIDGE, ROAD_X, ROAD_Y, ROAD_W, districtAt } from './city.js';

export function daylightFactor(timeOfDay) {
  // 0 = deep night, 1 = full day. Sunrise ~6:30, sunset ~19:00.
  const t = timeOfDay % 24;
  if (t >= 7 && t <= 18) return 1;
  if (t > 18 && t < 20.5) return 1 - (t - 18) / 2.5;
  if (t > 5 && t < 7) return (t - 5) / 2;
  return 0;
}

export function renderWorld(game, ctx, w, h, backdrop) {
  const cam = game.camera;
  const city = game.city;
  const day = daylightFactor(game.timeOfDay);
  const darkness = (1 - day) * 0.66;
  const rain = game.rain;

  ctx.save();
  ctx.clearRect(0, 0, w, h);
  // Warm day tint / cool night tint over the whole scene.
  ctx.fillStyle = day > 0.6 ? '#8fc7e8' : day > 0.25 ? '#e8a06b' : '#0a1226';
  ctx.fillRect(0, 0, w, h);
  ctx.translate(w / 2, h / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  const vx0 = cam.x - w / 2 / cam.zoom - 120;
  const vy0 = cam.y - h / 2 / cam.zoom - 120;
  const vx1 = cam.x + w / 2 / cam.zoom + 120;
  const vy1 = cam.y + h / 2 / cam.zoom + 120;

  drawGround(game, ctx, vx0, vy0, vx1, vy1, day);
  drawRoads(game, ctx, vx0, vy0, vx1, vy1, day, rain);
  drawParks(game, ctx, vx0, vy0, vx1, vy1);
  drawBuildings(game, ctx, vx0, vy0, vx1, vy1, day);
  drawProps(game, ctx, vx0, vy0, vx1, vy1, day);
  drawObjectiveMarker(game, ctx);
  drawPickups(game, ctx);
  drawCars(game, ctx, day);
  drawPeds(game, ctx);
  drawPlayer(game, ctx, day);
  drawBulletsAndFx(game, ctx);
  drawHeli(game, ctx, day);
  drawParticles(game, ctx);
  drawRain(game, ctx, w, h, rain);

  ctx.restore();

  // Lighting: darkness with holes cut for the player, lamps, headlights, neon.
  if (darkness > 0.03) drawNightLighting(game, ctx, w, h, darkness, day);
  // Wet-road sheen over everything when it rains.
  if (rain > 0.25) {
    ctx.fillStyle = 'rgba(120,160,220,' + (rain * 0.06) + ')';
    ctx.fillRect(0, 0, w, h);
  }
  // Vignette for a cinematic frame.
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}

function drawGround(game, ctx, x0, y0, x1, y1, day) {
  // Grass base.
  ctx.fillStyle = day > 0.6 ? '#5d8a4a' : '#3d5c33';
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  // Beach sand.
  ctx.fillStyle = '#d9b77c';
  ctx.fillRect(Math.max(x0, BEACH.x), y0, Math.min(x1, BEACH.x + BEACH.w) - Math.max(x0, BEACH.x), y1 - y0);
  // Bay water with animated wave lines.
  const wave = Math.sin(game.time * 1.4) * 3;
  const wg = ctx.createLinearGradient(BAY.x, 0, BAY.x + BAY.w, 0);
  wg.addColorStop(0, day > 0.6 ? '#2e7fa8' : '#123a5c');
  wg.addColorStop(1, day > 0.6 ? '#1d5c8a' : '#0d2a4a');
  ctx.fillStyle = wg;
  ctx.fillRect(Math.max(x0, BAY.x), y0, Math.min(x1, BAY.x + BAY.w) - Math.max(x0, BAY.x), y1 - y0);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  for (let y = Math.floor(y0 / 90) * 90; y < y1; y += 90) {
    ctx.beginPath();
    ctx.moveTo(BAY.x + 10, y + wave);
    ctx.quadraticCurveTo(BAY.x + 140, y + wave + 8, BAY.x + 300, y + wave);
    ctx.quadraticCurveTo(BAY.x + 440, y + wave - 8, BAY.x + 560, y + wave);
    ctx.stroke();
  }
  // Island sand + grass.
  ctx.fillStyle = '#d9b77c';
  ctx.fillRect(ISLAND.x - 8, ISLAND.y - 8, ISLAND.w + 16, ISLAND.h + 16);
  ctx.fillStyle = day > 0.6 ? '#5d8a4a' : '#3d5c33';
  ctx.fillRect(ISLAND.x, ISLAND.y, ISLAND.w, ISLAND.h);
}

function drawRoads(game, ctx, x0, y0, x1, y1, day, rain) {
  const roadColor = rain > 0.3 ? '#232833' : '#2e333d';
  const lineColor = day > 0.6 ? '#e8d24a' : '#c9b23a';
  ctx.fillStyle = roadColor;
  for (const rx of ROAD_X) {
    if (rx < x0 - 60 || rx > x1 + 60) continue;
    ctx.fillRect(rx - ROAD_W / 2, y0, ROAD_W, y1 - y0);
  }
  for (const ry of ROAD_Y) {
    if (ry < y0 - 60 || ry > y1 + 60) continue;
    ctx.fillRect(x0, ry - ROAD_W / 2, x1 - x0, ROAD_W);
  }
  // Bridge across the bay.
  ctx.fillStyle = '#3a3f4a';
  ctx.fillRect(BRIDGE.x, BRIDGE.y, BRIDGE.w, BRIDGE.h);
  ctx.strokeStyle = '#c9b23a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(BRIDGE.x, BRIDGE.y + BRIDGE.h / 2);
  ctx.lineTo(BRIDGE.x + BRIDGE.w, BRIDGE.y + BRIDGE.h / 2);
  ctx.stroke();
  // Centre dashes.
  ctx.fillStyle = lineColor;
  for (const rx of ROAD_X) {
    if (rx < x0 - 60 || rx > x1 + 60) continue;
    for (let y = Math.floor(y0 / 64) * 64; y < y1; y += 64) {
      ctx.fillRect(rx - 2, y, 4, 30);
    }
  }
  for (const ry of ROAD_Y) {
    if (ry < y0 - 60 || ry > y1 + 60) continue;
    for (let x = Math.floor(x0 / 64) * 64; x < x1; x += 64) {
      ctx.fillRect(x, ry - 2, 30, 4);
    }
  }
  // Crosswalks at intersections.
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (const rx of ROAD_X) {
    for (const ry of ROAD_Y) {
      if (rx < x0 - 80 || rx > x1 + 80 || ry < y0 - 80 || ry > y1 + 80) continue;
      for (let i = -3; i <= 3; i++) {
        ctx.fillRect(rx + i * 11 - 3, ry - ROAD_W / 2 + 8, 6, 12);
        ctx.fillRect(rx + i * 11 - 3, ry + ROAD_W / 2 - 20, 6, 12);
      }
    }
  }
  // Sidewalk edges.
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 2;
  for (const rx of ROAD_X) {
    ctx.beginPath();
    ctx.moveTo(rx - ROAD_W / 2 - 12, y0);
    ctx.lineTo(rx - ROAD_W / 2 - 12, y1);
    ctx.moveTo(rx + ROAD_W / 2 + 12, y0);
    ctx.lineTo(rx + ROAD_W / 2 + 12, y1);
    ctx.stroke();
  }
}

function drawParks(game, ctx, x0, y0, x1, y1) {
  for (const park of game.city.parks) {
    if (park.x > x1 || park.x + park.w < x0 || park.y > y1 || park.y + park.h < y0) continue;
    ctx.fillStyle = '#4a7a3d';
    ctx.fillRect(park.x, park.y, park.w, park.h);
    ctx.fillStyle = '#3a6b31';
    for (let i = 0; i < park.trees; i++) {
      const tx = park.x + 20 + ((i * 67) % Math.max(40, park.w - 40));
      const ty = park.y + 20 + ((i * 43) % Math.max(40, park.h - 40));
      ctx.beginPath();
      ctx.arc(tx, ty, 12, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255);
  const g = clamp(Math.round(((n >> 8) & 255) * f), 0, 255);
  const b = clamp(Math.round((n & 255) * f), 0, 255);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

function drawBuildings(game, ctx, x0, y0, x1, y1, day) {
  const night = 1 - day;
  const list = game.city.buildings.slice().sort((a, b) => (a.y + a.h) - (b.y + b.h));
  for (const b of list) {
    if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
    const lift = b.height * 0.42;
    // Long shadows at dusk.
    if (day > 0.05 && day < 0.95) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.moveTo(b.x + b.w, b.y + b.h);
      ctx.lineTo(b.x + b.w + b.height * 0.9, b.y + b.h + b.height * 0.5);
      ctx.lineTo(b.x + b.w + b.height * 0.9, b.y + lift * 0.4 + b.height * 0.5);
      ctx.lineTo(b.x + b.w, b.y + lift * 0.4);
      ctx.closePath();
      ctx.fill();
    }
    // South face and east face (extrusion).
    ctx.fillStyle = shade(b.color, 0.55);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y + b.h);
    ctx.lineTo(b.x + b.w, b.y + b.h);
    ctx.lineTo(b.x + b.w, b.y + b.h - lift);
    ctx.lineTo(b.x, b.y + b.h - lift);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(b.color, 0.75);
    ctx.beginPath();
    ctx.moveTo(b.x + b.w, b.y);
    ctx.lineTo(b.x + b.w, b.y + b.h);
    ctx.lineTo(b.x + b.w, b.y + b.h - lift);
    ctx.lineTo(b.x + b.w, b.y - lift);
    ctx.closePath();
    ctx.fill();
    // Roof.
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x, b.y - lift, b.w, b.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(b.x, b.y - lift, b.w, b.h);
    // Rooftop pool on resort and strip hotels.
    if (b.pool) {
      ctx.fillStyle = day > 0.6 ? '#4fc3e8' : '#2a7a9e';
      ctx.beginPath();
      ctx.roundRect(b.x + b.w * 0.2, b.y - lift + b.h * 0.25, b.w * 0.6, b.h * 0.4, 10);
      ctx.fill();
      ctx.strokeStyle = '#e8f4ff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // Roof details: AC units and helipad on the tallest towers.
    ctx.fillStyle = '#151a26';
    ctx.fillRect(b.x + 8, b.y - lift + 8, 18, 12);
    ctx.fillRect(b.x + b.w - 26, b.y - lift + b.h - 20, 16, 12);
    if (b.height > 60) {
      ctx.strokeStyle = '#ffe600';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x + b.w / 2, b.y - lift + b.h / 2, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffe600';
      ctx.font = 'bold 13px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('H', b.x + b.w / 2, b.y - lift + b.h / 2 + 5);
    }
    // Windows on the south face, lit at night.
    const cols = b.winCols;
    const rows = b.winRows;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const wx = b.x + 8 + (c * (b.w - 16)) / cols;
        const wy = b.y + b.h - lift + 8 + (r * (lift - 16)) / Math.max(1, rows);
        if (wy < b.y + b.h - lift + 6) continue;
        const lit = b.lit[(r * cols + c) % b.lit.length];
        if (night > 0.4 && lit) {
          ctx.fillStyle = '#ffd76a';
          ctx.shadowColor = '#ffbf40';
          ctx.shadowBlur = 6;
        } else if (night > 0.4) {
          ctx.fillStyle = '#1d2733';
          ctx.shadowBlur = 0;
        } else {
          // Daylight glass: pale blue with a bright frame, readable at noon.
          ctx.fillStyle = '#8fb8d8';
          ctx.shadowBlur = 0;
        }
        ctx.fillRect(wx, wy, 12, 9);
        ctx.shadowBlur = 0;
      }
    }
  }
  // Neon signs glow after dark.
  for (const s of game.city.signs) {
    if (s.x < x0 || s.x > x1 || s.y < y0 || s.y > y1) continue;
    ctx.save();
    ctx.font = 'bold 17px Arial, sans-serif';
    ctx.textAlign = 'center';
    if (night > 0.25) {
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 16;
      ctx.fillStyle = s.color;
      ctx.fillText(s.text, s.x, s.y);
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(s.text, s.x, s.y);
    } else {
      ctx.fillStyle = s.color;
      ctx.globalAlpha = 0.75;
      ctx.fillText(s.text, s.x, s.y);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // Wet-road reflection of the sign.
    if (game.rain > 0.3) {
      const g = ctx.createLinearGradient(s.x, s.y + 6, s.x, s.y + 60);
      g.addColorStop(0, s.color + '');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.25 * game.rain;
      ctx.fillStyle = g;
      ctx.fillRect(s.x - s.w / 2, s.y + 6, s.w, 54);
      ctx.globalAlpha = 1;
    }
  }
}

function drawProps(game, ctx, x0, y0, x1, y1, day) {
  const night = 1 - day;
  // Street lamps with light pools at night.
  for (const lamp of game.city.lamps) {
    if (lamp.x < x0 || lamp.x > x1 || lamp.y < y0 || lamp.y > y1) continue;
    if (night > 0.4) {
      const g = ctx.createRadialGradient(lamp.x, lamp.y, 4, lamp.x, lamp.y, 74);
      g.addColorStop(0, 'rgba(255,214,106,0.5)');
      g.addColorStop(1, 'rgba(255,214,106,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 74, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#1c2333';
    ctx.fillRect(lamp.x - 2, lamp.y - 2, 4, 4);
    ctx.fillStyle = night > 0.4 ? '#ffd76a' : '#c9c9c9';
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Palms along the beach and marina.
  for (const palm of game.city.palms) {
    if (palm.x < x0 || palm.x > x1 || palm.y < y0 || palm.y > y1) continue;
    const sway = Math.sin(game.time * 1.1 + palm.y * 0.05) * 3;
    ctx.strokeStyle = '#6b4a2c';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(palm.x, palm.y);
    ctx.lineTo(palm.x + sway, palm.y - 22);
    ctx.stroke();
    ctx.strokeStyle = '#3f7a3a';
    ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.55;
      ctx.beginPath();
      ctx.moveTo(palm.x + sway, palm.y - 22);
      ctx.quadraticCurveTo(
        palm.x + sway + Math.cos(a) * 12, palm.y - 22 + Math.sin(a) * 12 - 6,
        palm.x + sway + Math.cos(a) * 22, palm.y - 22 + Math.sin(a) * 22 + 4);
      ctx.stroke();
    }
  }
  // Landmark labels.
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const key of Object.keys(game.city.landmarks)) {
    const lm = game.city.landmarks[key];
    if (lm.x < x0 || lm.x > x1 || lm.y < y0 || lm.y > y1) continue;
    ctx.fillStyle = 'rgba(10,14,24,0.55)';
    const tw = ctx.measureText(lm.name).width + 14;
    ctx.fillRect(lm.x - tw / 2, lm.y - 34, tw, 20);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(lm.name, lm.x, lm.y - 20);
  }
}

function drawObjectiveMarker(game, ctx) {
  const stage = game.missionActive && game.mission ? game.mission.stages[game.missionStage] : null;
  if (!stage) return;
  const pulse = 1 + Math.sin(game.time * 4) * 0.12;
  ctx.save();
  ctx.translate(stage.x, stage.y);
  ctx.scale(pulse, pulse);
  ctx.strokeStyle = '#ffe600';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 46, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,230,0,0.18)';
  ctx.beginPath();
  ctx.arc(0, 0, 46, 0, Math.PI * 2);
  ctx.fill();
  // A vertical beam so the marker reads from far away.
  const g = ctx.createLinearGradient(0, -160, 0, 0);
  g.addColorStop(0, 'rgba(255,230,0,0)');
  g.addColorStop(1, 'rgba(255,230,0,0.5)');
  ctx.fillStyle = g;
  ctx.fillRect(-7, -160, 14, 160);
  ctx.restore();
  // Mission target car marker.
  if (game.missionTarget && !game.missionTarget.dead) {
    const t = game.missionTarget;
    ctx.fillStyle = '#ff3860';
    ctx.beginPath();
    ctx.moveTo(t.x, t.y - 44);
    ctx.lineTo(t.x + 10, t.y - 28);
    ctx.lineTo(t.x - 10, t.y - 28);
    ctx.closePath();
    ctx.fill();
  }
}

function drawPickups(game, ctx) {
  for (const pk of game.pickups) {
    const pulse = 1 + Math.sin(game.time * 5 + pk.x) * 0.15;
    ctx.save();
    ctx.translate(pk.x, pk.y);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = 'rgba(255,214,0,0.3)';
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd600';
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#a88400';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#7a5f00';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('$', 0, 4);
    ctx.restore();
  }
}

function drawCarShape(ctx, car, day, game) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const len = car.len;
  const wid = car.wid;
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(3, 4, len / 2, wid / 2 + 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Wet reflection.
  if (game.rain > 0.3) {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.ellipse(0, wid / 2 + 8, len / 2, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Body.
  ctx.fillStyle = car.color;
  ctx.beginPath();
  ctx.roundRect(-len / 2, -wid / 2, len, wid, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Cabin + windows.
  ctx.fillStyle = 'rgba(20,30,45,0.9)';
  ctx.beginPath();
  ctx.roundRect(-len / 6, -wid / 2 + 4, len / 3, wid - 8, 5);
  ctx.fill();
  ctx.fillStyle = 'rgba(180,220,255,0.55)';
  ctx.beginPath();
  ctx.roundRect(-len / 6 + 3, -wid / 2 + 6, len / 3 - 6, wid - 12, 4);
  ctx.fill();
  // Headlights at night + brake lights.
  const night = 1 - day;
  if (night > 0.4) {
    const hg = ctx.createLinearGradient(len / 2, 0, len / 2 + 120, 0);
    hg.addColorStop(0, 'rgba(255,240,180,0.55)');
    hg.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.moveTo(len / 2, -wid / 2 + 4);
    ctx.lineTo(len / 2 + 120, -wid);
    ctx.lineTo(len / 2 + 120, wid);
    ctx.lineTo(len / 2, wid / 2 - 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff2b0';
    ctx.fillRect(len / 2 - 2, -wid / 2 + 3, 4, 5);
    ctx.fillRect(len / 2 - 2, wid / 2 - 8, 4, 5);
  }
  ctx.fillStyle = car.braking ? '#ff2222' : '#a02020';
  ctx.fillRect(-len / 2 - 1, -wid / 2 + 3, 4, 5);
  ctx.fillRect(-len / 2 - 1, wid / 2 - 8, 4, 5);
  // Police livery + light bar.
  if (car.police) {
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(-len / 2 + 6, -wid / 2, len * 0.45, wid);
    ctx.fillStyle = '#1c2f55';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('NBPD', 0, 4);
    const phase = Math.floor(car.sirenPhase || 0) % 2 === 0;
    ctx.fillStyle = phase ? '#ff2222' : '#2266ff';
    ctx.beginPath();
    ctx.arc(-4, -wid / 2 + 2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = phase ? '#2266ff' : '#ff2222';
    ctx.beginPath();
    ctx.arc(6, -wid / 2 + 2, 5, 0, Math.PI * 2);
    ctx.fill();
    if (night > 0.4) {
      const sg = ctx.createRadialGradient(0, -wid / 2, 4, 0, -wid / 2, 90);
      sg.addColorStop(0, phase ? 'rgba(255,40,40,0.5)' : 'rgba(40,90,255,0.5)');
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(0, -wid / 2, 90, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawCars(game, ctx, day) {
  for (const car of game.vehicles) {
    if (car.dead) continue;
    drawCarShape(ctx, car, day, game);
    // Damage smoke.
    if (car.health < 45 && Math.random() < 0.35) {
      game.particles.push({
        x: car.x - Math.cos(car.angle) * car.len / 2, y: car.y - Math.sin(car.angle) * car.len / 2,
        vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 20,
        life: 0.9, maxLife: 0.9, size: 9 + Math.random() * 8,
        color: car.health < 20 ? '#ff7a2a' : '#666666', kind: 'smoke',
      });
    }
  }
}

function drawPed(game, ctx, p, day) {
  ctx.save();
  ctx.translate(p.x, p.y);
  // Ground shadow so pedestrians read against grass and asphalt.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(1, 3, 11, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  if (p.down) {
    ctx.rotate(p.angle + Math.PI / 2);
    ctx.fillStyle = p.shirt;
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.skin;
    ctx.beginPath();
    ctx.arc(15, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const bob = Math.sin(p.bobPhase) * 2;
  ctx.rotate(p.angle);
  // Legs.
  ctx.fillStyle = p.pants;
  ctx.fillRect(-6, -5 + bob * 0.4, 12, 4);
  ctx.fillRect(-6, 1 - bob * 0.4, 12, 4);
  // Body.
  ctx.fillStyle = p.shirt;
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();
  // Head.
  ctx.fillStyle = p.skin;
  ctx.beginPath();
  ctx.arc(4, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  if (p.behavior === 'phone') {
    ctx.fillStyle = '#222831';
    ctx.fillRect(10, -8, 5, 8);
    ctx.fillStyle = '#9adcff';
    ctx.fillRect(11, -7, 3, 6);
  }
  ctx.restore();
  // Panic "!" marker.
  if (p.state === 'panic') {
    ctx.fillStyle = '#ff3860';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('!', p.x, p.y - 20);
  }
}

function drawPeds(game, ctx) {
  for (const p of game.peds) drawPed(game, ctx, p, 1);
  for (const cop of game.cops) {
    if (cop.kind !== 'officer') continue;
    const fake = { x: cop.x, y: cop.y, angle: cop.angle, bobPhase: game.time * 8, down: false, shirt: '#1c2f55', pants: '#1c2f55', skin: cop.skin, behavior: 'stroll', state: 'walk' };
    drawPed(game, ctx, fake, 1);
    // Police cap.
    ctx.fillStyle = '#0e1a33';
    ctx.beginPath();
    ctx.arc(cop.x + Math.cos(cop.angle) * 4, cop.y + Math.sin(cop.angle) * 4, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlayer(game, ctx, day) {
  const p = game.player;
  const car = game.playerCar;
  if (car) return; // the car shape already shows the player driving
  // Pink ring under the player so they never get lost in a crowd.
  ctx.strokeStyle = '#ff2e88';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 17 + Math.sin(game.time * 4) * 1.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,46,136,0.12)';
  ctx.beginPath();
  ctx.arc(p.x, p.y, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(p.x, p.y);
  const bob = p.moving ? Math.sin(p.bobPhase) * 2 : 0;
  ctx.rotate(p.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(2, 3, 13, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  // Legs.
  ctx.fillStyle = p.pants;
  ctx.fillRect(-7, -6 + bob * 0.4, 13, 5);
  ctx.fillRect(-7, 1 - bob * 0.4, 13, 5);
  // Jacket.
  ctx.fillStyle = p.shirt;
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1c2333';
  ctx.beginPath();
  ctx.arc(-2, 0, 11, Math.PI / 2, Math.PI * 1.5);
  ctx.fill();
  // Head.
  ctx.fillStyle = p.skin;
  ctx.beginPath();
  ctx.arc(5, 0, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1c1c22';
  ctx.beginPath();
  ctx.arc(4, 0, 6.5, -Math.PI / 2.4, Math.PI / 2.4);
  ctx.fill();
  // Pistol when aiming.
  if (game.input.mouseDown) {
    ctx.fillStyle = '#222831';
    ctx.fillRect(10, -2, 12, 4);
  }
  ctx.restore();
  // Muzzle flash + punch fx.
  if (game.muzzleFx && game.muzzleFx.t > 0) {
    ctx.fillStyle = '#ffe600';
    ctx.beginPath();
    ctx.arc(game.muzzleFx.x, game.muzzleFx.y, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  if (game.punchFx && game.punchFx.t > 0) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(game.punchFx.x, game.punchFx.y, 12, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawBulletsAndFx(game, ctx) {
  ctx.fillStyle = '#ffe600';
  for (const b of game.bullets) {
    ctx.fillRect(b.x - 3, b.y - 1.5, 6, 3);
  }
  for (const s of game.sparks) {
    ctx.fillStyle = 'rgba(255,200,60,' + (s.t * 3) + ')';
    ctx.beginPath();
    ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHeli(game, ctx, day) {
  const h = game.heli;
  if (!h) return;
  // Searchlight cone onto the player.
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = '#fff2b0';
  ctx.beginPath();
  ctx.moveTo(h.x, h.y);
  ctx.lineTo(h.searchX - 60, h.searchY);
  ctx.lineTo(h.searchX + 60, h.searchY);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
  // Shadow on the ground.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(h.x + 40, h.y + 50, 30, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  // Body.
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(h.angle);
  ctx.fillStyle = '#1c2f55';
  ctx.beginPath();
  ctx.ellipse(0, 0, 34, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#9adcff';
  ctx.beginPath();
  ctx.ellipse(16, 0, 10, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0e1a33';
  ctx.lineWidth = 3;
  const r = Math.sin(h.rotor) * 40;
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(r, 0);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('NBPD AIR 1', h.x, h.y - 26);
}

function drawParticles(game, ctx) {
  for (const pt of game.particles) {
    const a = clamp(pt.life / pt.maxLife, 0, 1);
    if (pt.kind === 'smoke') {
      ctx.fillStyle = pt.color;
      ctx.globalAlpha = a * 0.6;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size * (1.6 - a * 0.6), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (pt.kind === 'fire') {
      ctx.fillStyle = pt.color;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size * a + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (pt.kind === 'debris') {
      ctx.fillStyle = pt.color;
      ctx.globalAlpha = a;
      ctx.fillRect(pt.x - 3, pt.y - 3, 6, 6);
      ctx.globalAlpha = 1;
    }
  }
}

function drawRain(game, ctx, w, h, rain) {
  if (rain <= 0.02) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(180,200,255,' + (0.35 * rain) + ')';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const drops = game.rainDrops;
  for (const d of drops) {
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x - 4, d.y + 16);
  }
  ctx.stroke();
  // Splashes.
  ctx.strokeStyle = 'rgba(200,220,255,' + (0.25 * rain) + ')';
  ctx.beginPath();
  for (const d of drops) {
    if (d.splash > 0) {
      ctx.moveTo(d.x - 5, d.y + 16);
      ctx.lineTo(d.x + 5, d.y + 16);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function drawNightLighting(game, ctx, w, h, darkness, day) {
  if (!game.lightCanvas) {
    game.lightCanvas = document.createElement('canvas');
  }
  const lc = game.lightCanvas;
  if (lc.width !== w || lc.height !== h) {
    lc.width = w;
    lc.height = h;
  }
  const lctx = lc.getContext('2d');
  lctx.clearRect(0, 0, w, h);
  lctx.globalCompositeOperation = 'source-over';
  lctx.fillStyle = 'rgba(6,10,34,' + darkness + ')';
  lctx.fillRect(0, 0, w, h);
  lctx.globalCompositeOperation = 'destination-out';
  const cam = game.camera;
  const toScreen = (x, y) => [(x - cam.x) * cam.zoom + w / 2, (y - cam.y) * cam.zoom + h / 2];
  const hole = (x, y, r, a) => {
    const [sx, sy] = toScreen(x, y);
    const g = lctx.createRadialGradient(sx, sy, 4, sx, sy, r);
    g.addColorStop(0, 'rgba(0,0,0,' + a + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.fillStyle = g;
    lctx.beginPath();
    lctx.arc(sx, sy, r, 0, Math.PI * 2);
    lctx.fill();
  };
  // Player light.
  hole(game.player.x, game.player.y, 260, 0.85);
  // Headlights.
  if (game.playerCar) {
    const c = game.playerCar;
    hole(c.x + Math.cos(c.angle) * 90, c.y + Math.sin(c.angle) * 90, 200, 0.7);
  }
  // Lamps near the camera.
  for (const lamp of game.city.lamps) {
    const [sx, sy] = toScreen(lamp.x, lamp.y);
    if (sx < -80 || sx > w + 80 || sy < -80 || sy > h + 80) continue;
    hole(lamp.x, lamp.y, 110, 0.55);
  }
  // Neon signs near the camera.
  for (const s of game.city.signs) {
    const [sx, sy] = toScreen(s.x, s.y);
    if (sx < -80 || sx > w + 80 || sy < -80 || sy > h + 80) continue;
    hole(s.x, s.y, 90, 0.5);
  }
  // Heli searchlight.
  if (game.heli) hole(game.heli.searchX, game.heli.searchY, 170, 0.75);
  ctx.drawImage(lc, 0, 0);
}
