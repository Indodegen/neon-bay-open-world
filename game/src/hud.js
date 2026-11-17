// NEON BAY — hud.js
// Everything drawn in screen space: cash and health, the 0–5 star wanted
// display, the live minimap, the off-screen objective arrow, mission text,
// toasts, speed, and the title / briefing / pause / busted / wasted /
// mission-complete screens. Buttons register into game.buttons so the main
// loop can act on clicks; keyboard shortcuts always work too.

import { clamp, formatCash, formatClock, dist } from './utils.js';
import { WORLD_W, WORLD_H, BAY, BEACH, ISLAND, BRIDGE, ROAD_X, ROAD_Y } from './city.js';
import { stageTarget } from './missions.js';

export function drawButton(game, ctx, x, y, w, h, label, primary) {
  const hov = game.input.mouseX >= x && game.input.mouseX <= x + w &&
    game.input.mouseY >= y && game.input.mouseY <= y + h;
  ctx.fillStyle = hov ? (primary ? '#ff2e88' : '#3a4a6b') : (primary ? '#c9236e' : '#232b3d');
  ctx.strokeStyle = primary ? '#ff7ab8' : '#46587a';
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  game.buttons.push({ x, y, w, h, label });
  return hov;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawHUD(game, ctx, w, h) {
  const p = game.player;
  ctx.textBaseline = 'alphabetic';

  // Top-left: cash, health, time, weather.
  ctx.fillStyle = 'rgba(10,14,24,0.72)';
  roundRect(ctx, 12, 12, 250, 86, 10);
  ctx.fill();
  ctx.fillStyle = '#7cff00';
  ctx.font = 'bold 26px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(formatCash(game.money), 26, 44);
  ctx.fillStyle = '#ffffff';
  ctx.font = '16px Arial, sans-serif';
  ctx.fillText(formatClock(game.timeOfDay) + '  •  ' + game.weatherLabel(), 26, 68);
  ctx.fillStyle = '#222831';
  roundRect(ctx, 26, 76, 150, 10, 5);
  ctx.fill();
  ctx.fillStyle = p.health > 30 ? '#7cff00' : '#ff3860';
  roundRect(ctx, 26, 76, 150 * clamp(p.health / 100, 0, 1), 10, 5);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '12px Arial, sans-serif';
  ctx.fillText('HEALTH ' + Math.round(p.health), 182, 86);

  // Top-right: wanted stars.
  ctx.fillStyle = 'rgba(10,14,24,0.72)';
  roundRect(ctx, w - 212, 12, 200, 52, 10);
  ctx.fill();
  ctx.font = 'bold 15px Arial, sans-serif';
  ctx.fillStyle = '#9aa7bd';
  ctx.textAlign = 'right';
  ctx.fillText('WANTED', w - 26, 32);
  for (let i = 0; i < 5; i++) {
    drawStar(ctx, w - 186 + i * 34, 44, 13, i < game.wantedStars ? '#ffe600' : '#3a4356');
  }

  // Bottom-center: current objective.
  const stage = stageTarget(game);
  if (stage && game.state === 'playing') {
    ctx.fillStyle = 'rgba(10,14,24,0.72)';
    const label = '◆ ' + stage.label;
    ctx.font = 'bold 17px Arial, sans-serif';
    const tw = ctx.measureText(label).width + 30;
    roundRect(ctx, w / 2 - tw / 2, h - 108, tw, 36, 10);
    ctx.fill();
    ctx.fillStyle = '#ffe600';
    ctx.textAlign = 'center';
    ctx.fillText(label, w / 2, h - 84);
  }

  // Bottom-right: speed and car health while driving.
  if (game.playerCar) {
    const car = game.playerCar;
    ctx.fillStyle = 'rgba(10,14,24,0.72)';
    roundRect(ctx, w - 212, h - 96, 200, 84, 10);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(Math.abs(car.speed) * 0.36) + ' km/h', w - 26, h - 58);
    ctx.font = '13px Arial, sans-serif';
    ctx.fillStyle = '#9aa7bd';
    ctx.fillText(car.name, w - 26, h - 36);
    ctx.fillStyle = '#222831';
    roundRect(ctx, w - 186, h - 30, 160, 8, 4);
    ctx.fill();
    ctx.fillStyle = car.health > 30 ? '#00e5ff' : '#ff3860';
    roundRect(ctx, w - 186, h - 30, 160 * clamp(car.health / 100, 0, 1), 8, 4);
    ctx.fill();
  }

  // Toast message.
  if (game.toast && game.toastT > 0) {
    ctx.font = 'bold 22px Arial, sans-serif';
    const tw = ctx.measureText(game.toast).width + 36;
    ctx.fillStyle = 'rgba(10,14,24,0.8)';
    roundRect(ctx, w / 2 - tw / 2, 84, tw, 42, 10);
    ctx.fill();
    ctx.fillStyle = game.toastColor || '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(game.toast, w / 2, 113);
  }

  // Hint line.
  if (game.hintText && game.hintT > 0) {
    ctx.font = '16px Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(game.hintText, w / 2, h - 122);
  }

  drawMinimap(game, ctx, w, h);
  drawObjectiveArrow(game, ctx, w, h);

  // Damage flash.
  if (game.damageFlash > 0) {
    ctx.fillStyle = 'rgba(255,40,60,' + (game.damageFlash * 0.28) + ')';
    ctx.fillRect(0, 0, w, h);
  }
}

function drawStar(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const x = cx + Math.cos(ang) * rad;
    const y = cy + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

export function drawMinimap(game, ctx, w, h) {
  const mw = 230;
  const mh = 162;
  const mx = 14;
  const my = h - mh - 34;
  const sx = mw / WORLD_W;
  const sy = mh / WORLD_H;
  ctx.fillStyle = 'rgba(10,14,24,0.82)';
  roundRect(ctx, mx - 6, my - 6, mw + 12, mh + 12, 10);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.rect(mx, my, mw, mh);
  ctx.clip();
  // Water + beach.
  ctx.fillStyle = '#0e3a5c';
  ctx.fillRect(mx + BAY.x * sx, my, BAY.w * sx, mh);
  ctx.fillStyle = '#c9a06b';
  ctx.fillRect(mx + BEACH.x * sx, my, BEACH.w * sx, mh);
  ctx.fillStyle = '#3f7a4a';
  ctx.fillRect(mx, my, mw, mh);
  // Roads.
  ctx.fillStyle = '#2a2f3a';
  for (const rx of ROAD_X) ctx.fillRect(mx + rx * sx - 2, my, 4, mh);
  for (const ry of ROAD_Y) ctx.fillRect(mx, my + ry * sy - 2, mw, 4);
  // Bridge + island.
  ctx.fillStyle = '#2a2f3a';
  ctx.fillRect(mx + BRIDGE.x * sx, my + BRIDGE.y * sy, BRIDGE.w * sx, 4);
  ctx.fillStyle = '#3f7a4a';
  ctx.fillRect(mx + ISLAND.x * sx, my + ISLAND.y * sy, ISLAND.w * sx, ISLAND.h * sy);
  // Buildings as dots.
  ctx.fillStyle = 'rgba(180,190,210,0.7)';
  for (const b of game.city.buildings) {
    ctx.fillRect(mx + b.x * sx, my + b.y * sy, Math.max(1.5, b.w * sx), Math.max(1.5, b.h * sy));
  }
  // Garage + hospital.
  ctx.fillStyle = '#7cff00';
  ctx.fillRect(mx + game.city.landmarks.garage.x * sx - 3, my + game.city.landmarks.garage.y * sy - 3, 6, 6);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(mx + game.city.landmarks.hospital.x * sx - 3, my + game.city.landmarks.hospital.y * sy - 3, 6, 6);
  // Mission target.
  const stage = stageTarget(game);
  if (stage) {
    ctx.fillStyle = '#ffe600';
    const tx = mx + stage.x * sx;
    const ty = my + stage.y * sy;
    ctx.beginPath();
    ctx.moveTo(tx, ty - 7);
    ctx.lineTo(tx + 6, ty);
    ctx.lineTo(tx, ty + 7);
    ctx.lineTo(tx - 6, ty);
    ctx.closePath();
    ctx.fill();
  }
  // Cops.
  ctx.fillStyle = '#3f8cff';
  for (const c of game.cops) {
    ctx.beginPath();
    ctx.arc(mx + c.x * sx, my + c.y * sy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Player arrow.
  const px = mx + game.player.x * sx;
  const py = my + game.player.y * sy;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(game.playerCar ? game.playerCar.angle : game.player.angle);
  ctx.fillStyle = '#ff2e88';
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(-6, -5);
  ctx.lineTo(-6, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // North + label.
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('NEON BAY', mx + 4, my - 12 + 0);
  ctx.restore();
}

export function drawObjectiveArrow(game, ctx, w, h) {
  const stage = stageTarget(game);
  if (!stage || game.state !== 'playing') return;
  const cam = game.camera;
  const sx = (stage.x - cam.x) * cam.zoom + w / 2;
  const sy = (stage.y - cam.y) * cam.zoom + h / 2;
  if (sx > 40 && sx < w - 40 && sy > 40 && sy < h - 40) {
    // On screen: a floating diamond marker.
    const bob = Math.sin(game.time * 3) * 5;
    ctx.fillStyle = '#ffe600';
    ctx.beginPath();
    ctx.moveTo(sx, sy - 26 + bob);
    ctx.lineTo(sx + 9, sy - 14 + bob);
    ctx.lineTo(sx, sy - 2 + bob);
    ctx.lineTo(sx - 9, sy - 14 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1c2333';
    ctx.font = 'bold 11px Arial, sans-serif';
    ctx.textAlign = 'center';
    const d = Math.round(dist(game.player.x, game.player.y, stage.x, stage.y));
    ctx.fillText(d + 'm', sx, sy - 30 + bob);
    return;
  }
  // Off screen: edge arrow pointing at it (kept clear of the cash panel).
  const cx = clamp(sx, 50, w - 50);
  let cy = clamp(sy, 130, h - 140);
  const ccx = cy < 175 ? clamp(cx, 300, w - 50) : cx;
  const ang = Math.atan2(sy - h / 2, sx - w / 2);
  ctx.save();
  ctx.translate(ccx, cy);
  ctx.rotate(ang);
  ctx.fillStyle = '#ffe600';
  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.lineTo(-8, -13);
  ctx.lineTo(-8, 13);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#ffe600';
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.textAlign = 'center';
  const d = Math.round(dist(game.player.x, game.player.y, stage.x, stage.y));
  ctx.fillText(d + 'm', ccx, cy + 30);
}

// ---- Screens ----

export function drawTitleScreen(game, ctx, w, h) {
  drawBackdrop(game, ctx, w, h);
  ctx.fillStyle = 'rgba(8,10,20,0.55)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff2e88';
  ctx.font = 'bold 92px Arial, sans-serif';
  ctx.shadowColor = '#ff2e88';
  ctx.shadowBlur = 34;
  ctx.fillText('NEON BAY', w / 2, h / 2 - 130);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#00e5ff';
  ctx.font = 'bold 26px Arial, sans-serif';
  ctx.fillText('AN OPEN-WORLD CRIME STORY  •  SUN • SAND • SIRENS', w / 2, h / 2 - 92);
  ctx.fillStyle = '#ffffff';
  ctx.font = '17px Arial, sans-serif';
  ctx.fillText('Vera Solano runs this city. You run her errands — steal cars, outrun the NBPD,', w / 2, h / 2 - 48);
  ctx.fillText('and take Neon Bay for yourself, one mission at a time.', w / 2, h / 2 - 24);
  ctx.font = '15px Arial, sans-serif';
  ctx.fillStyle = '#c9d2e0';
  ctx.fillText('WASD move / drive   •   E steal & exit car   •   Mouse aim, Click shoot   •   Space punch / handbrake', w / 2, h / 2 + 8);
  ctx.fillText('P pause   •   M mute   •   8 story missions   •   0–5 star wanted   •   Progress saves automatically', w / 2, h / 2 + 32);
  const bw = 280;
  const bx = w / 2 - bw / 2;
  if (game.hasSaveData) {
    drawButton(game, ctx, bx, h / 2 + 58, bw, 52, 'CONTINUE  (saved game)', true);
    drawButton(game, ctx, bx, h / 2 + 122, bw, 52, 'NEW GAME', false);
  } else {
    drawButton(game, ctx, bx, h / 2 + 58, bw, 52, 'START ENGINE', true);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '13px Arial, sans-serif';
  ctx.fillText('Original game — Neon Bay, Vera Solano and every character are invented for this game.', w / 2, h - 24);
}

export function drawBackdrop(game, ctx, w, h) {
  // A live slice of the city behind menus, so the title never looks empty.
  game.renderWorld(ctx, w, h, true);
}

export function drawPauseScreen(game, ctx, w, h) {
  ctx.fillStyle = 'rgba(8,10,20,0.72)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 54px Arial, sans-serif';
  ctx.fillText('PAUSED', w / 2, h / 2 - 130);
  ctx.font = '17px Arial, sans-serif';
  ctx.fillStyle = '#c9d2e0';
  const m = game.mission;
  ctx.fillText(m ? 'Mission ' + m.id + ' of 8 — ' + m.title + '  •  ' + formatCash(game.money) : 'Free roam  •  ' + formatCash(game.money), w / 2, h / 2 - 92);
  ctx.fillText('Missions completed: ' + game.completedMissions.length + ' / 8', w / 2, h / 2 - 66);
  const bw = 300;
  const bx = w / 2 - bw / 2;
  drawButton(game, ctx, bx, h / 2 - 30, bw, 50, 'RESUME  (P)', true);
  drawButton(game, ctx, bx, h / 2 + 30, bw, 50, 'SAVE GAME', false);
  drawButton(game, ctx, bx, h / 2 + 90, bw, 50, game.missionActive ? 'RESTART MISSION' : 'START MISSION ' + (game.missionIndex + 1), false);
  drawButton(game, ctx, bx, h / 2 + 150, bw, 50, 'QUIT TO TITLE', false);
  if (game.saveNotice) {
    ctx.fillStyle = '#7cff00';
    ctx.font = 'bold 16px Arial, sans-serif';
    ctx.fillText(game.saveNotice, w / 2, h / 2 + 220);
  }
}

export function drawBustedScreen(game, ctx, w, h) {
  ctx.fillStyle = 'rgba(20,8,16,0.78)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff3860';
  ctx.font = 'bold 72px Arial, sans-serif';
  ctx.fillText('BUSTED', w / 2, h / 2 - 80);
  ctx.fillStyle = '#ffffff';
  ctx.font = '19px Arial, sans-serif';
  ctx.fillText(game.endReason || 'The NBPD caught up with you.', w / 2, h / 2 - 36);
  ctx.font = '17px Arial, sans-serif';
  ctx.fillStyle = '#ffe600';
  ctx.fillText('Fine paid: ' + formatCash(game.lastFine) + '   •   Wanted level cleared', w / 2, h / 2 - 4);
  drawButton(game, ctx, w / 2 - 140, h / 2 + 40, 280, 52, 'BACK ON THE STREETS', true);
  ctx.fillStyle = '#c9d2e0';
  ctx.font = '14px Arial, sans-serif';
  ctx.fillText('Press Enter to respawn at NBPD HQ.', w / 2, h / 2 + 130);
}

export function drawWastedScreen(game, ctx, w, h) {
  ctx.fillStyle = 'rgba(16,8,8,0.8)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff3860';
  ctx.font = 'bold 72px Arial, sans-serif';
  ctx.fillText('WASTED', w / 2, h / 2 - 80);
  ctx.fillStyle = '#ffffff';
  ctx.font = '19px Arial, sans-serif';
  ctx.fillText(game.endReason || 'You did not make it.', w / 2, h / 2 - 36);
  ctx.font = '17px Arial, sans-serif';
  ctx.fillStyle = '#ffe600';
  ctx.fillText('Hospital bill: ' + formatCash(game.lastFine) + '   •   You wake up at Coral General', w / 2, h / 2 - 4);
  drawButton(game, ctx, w / 2 - 140, h / 2 + 40, 280, 52, 'WAKE UP', true);
  ctx.fillStyle = '#c9d2e0';
  ctx.font = '14px Arial, sans-serif';
  ctx.fillText('Press Enter to respawn at the hospital.', w / 2, h / 2 + 130);
}

export function drawBriefingScreen(game, ctx, w, h) {
  ctx.fillStyle = 'rgba(8,10,20,0.78)';
  ctx.fillRect(0, 0, w, h);
  const m = game.mission;
  if (!m) return;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe600';
  ctx.font = 'bold 20px Arial, sans-serif';
  ctx.fillText('MISSION ' + m.id + ' OF 8', w / 2, h / 2 - 150);
  ctx.fillStyle = '#ff2e88';
  ctx.font = 'bold 56px Arial, sans-serif';
  ctx.fillText(m.title.toUpperCase(), w / 2, h / 2 - 96);
  ctx.fillStyle = '#ffffff';
  ctx.font = '18px Arial, sans-serif';
  wrapText(ctx, m.briefing, w / 2, h / 2 - 52, 760, 26);
  ctx.fillStyle = '#7cff00';
  ctx.font = 'bold 22px Arial, sans-serif';
  ctx.fillText('PAYOUT: ' + formatCash(m.payout), w / 2, h / 2 + 66);
  drawButton(game, ctx, w / 2 - 140, h / 2 + 96, 280, 52, 'ACCEPT THE JOB', true);
  ctx.fillStyle = '#c9d2e0';
  ctx.font = '14px Arial, sans-serif';
  ctx.fillText('Press Enter to accept. The yellow marker on your minimap is the objective.', w / 2, h / 2 + 178);
}

export function drawMissionCompleteScreen(game, ctx, w, h) {
  ctx.fillStyle = 'rgba(8,20,12,0.66)';
  ctx.fillRect(0, 0, w, h);
  const m = game.lastCompleted;
  if (!m) return;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#7cff00';
  ctx.font = 'bold 58px Arial, sans-serif';
  ctx.fillText('MISSION COMPLETE', w / 2, h / 2 - 90);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px Arial, sans-serif';
  ctx.fillText(m.title + '  —  +' + formatCash(m.payout), w / 2, h / 2 - 38);
  ctx.font = '18px Arial, sans-serif';
  ctx.fillStyle = '#c9d2e0';
  const next = game.missionIndex < 8
    ? 'Next: Mission ' + (game.missionIndex + 1) + ' — ' + (game.nextMissionTitle || '')
    : 'All 8 missions done — Neon Bay is yours, boss.';
  ctx.fillText(next, w / 2, h / 2 + 2);
  ctx.fillText('Total earned: ' + formatCash(game.totalEarned) + '   •   Cash: ' + formatCash(game.money), w / 2, h / 2 + 32);
  drawButton(game, ctx, w / 2 - 140, h / 2 + 62, 280, 52, 'KEEP PLAYING', true);
  ctx.fillStyle = '#c9d2e0';
  ctx.font = '14px Arial, sans-serif';
  ctx.fillText('Progress saved. Press Enter to continue.', w / 2, h / 2 + 142);
}

export function wrapText(ctx, text, cx, y, maxW, lineH) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  lines.forEach((ln, i) => ctx.fillText(ln, cx, y + i * lineH));
}
