// hud.js — Everything drawn on top of the world: cash, health, wanted stars,
// the mission objective, the speedometer, the minimap, the message feed,
// and every menu (title, pause, busted, wasted, mission briefings).
import { PALETTE, WORLD } from './config.js';
import { roundRect } from './vehicles.js';

export function pushMessage(game, text, color) {
  game.messages.push({ text, color: color || '#fff6ec', time: game.time });
  if (game.messages.length > 5) game.messages.shift();
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PALETTE.hudBg;
  ctx.strokeStyle = PALETTE.hudBorder;
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();
}

export function drawButton(ctx, buttons, id, x, y, w, h, label, accent) {
  ctx.save();
  ctx.fillStyle = accent ? 'rgba(255, 46, 136, 0.92)' : 'rgba(38, 30, 62, 0.92)';
  ctx.strokeStyle = accent ? '#ffd319' : 'rgba(255, 246, 236, 0.5)';
  ctx.lineWidth = accent ? 2 : 1.5;
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff6ec';
  ctx.font = 'bold 17px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  ctx.restore();
  buttons.push({ id, x, y, w, h });
}

function drawStars(ctx, x, y, stars) {
  ctx.save();
  ctx.font = '26px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 5; i++) {
    const filled = i < stars;
    ctx.fillStyle = filled ? '#ffd319' : 'rgba(255, 246, 236, 0.22)';
    if (filled) {
      ctx.shadowColor = '#ffd319';
      ctx.shadowBlur = 10;
    }
    ctx.fillText('★', x + i * 30, y);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

function drawBar(ctx, x, y, w, h, ratio, fill, label) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  roundRect(ctx, x, y, w, h, 4);
  ctx.fill();
  ctx.fillStyle = fill;
  if (ratio > 0) {
    roundRect(ctx, x, y, Math.max(6, w * ratio), h, 4);
    ctx.fill();
  }
  if (label) {
    ctx.fillStyle = '#fff6ec';
    ctx.font = 'bold 10px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 6, y + h / 2);
  }
}

export function drawMinimap(ctx, game) {
  const mw = 196;
  const mh = 142;
  const mx = 14;
  const my = game.screenH - mh - 14;
  const sx = mw / WORLD.width;
  const sy = mh / WORLD.height;
  ctx.save();
  panel(ctx, mx, my, mw, mh);
  ctx.beginPath();
  roundRect(ctx, mx, my, mw, mh, 10);
  ctx.clip();
  // Sea and bay.
  ctx.fillStyle = '#0b2a4a';
  ctx.fillRect(mx, my, 150 * sx + 4, mh);
  ctx.fillRect(mx, my + 2380 * sy, mw, mh - 2380 * sy);
  // Roads.
  ctx.strokeStyle = 'rgba(255, 246, 236, 0.75)';
  ctx.lineWidth = 2;
  for (const rx of game.city.roadsV) {
    ctx.beginPath();
    ctx.moveTo(mx + rx * sx, my);
    ctx.lineTo(mx + rx * sx, my + 2380 * sy);
    ctx.stroke();
  }
  for (const ry of game.city.roadsH) {
    ctx.beginPath();
    ctx.moveTo(mx + 300 * sx, my + ry * sy);
    ctx.lineTo(mx + mw, my + ry * sy);
    ctx.stroke();
  }
  // Bridge.
  ctx.strokeStyle = '#ff2e88';
  ctx.beginPath();
  ctx.moveTo(mx + 1600 * sx, my + 2380 * sy);
  ctx.lineTo(mx + 1600 * sx, my + mh);
  ctx.stroke();
  // Safehouse.
  const sh = game.city.landmarks.safehouse;
  ctx.fillStyle = '#39ff88';
  ctx.fillRect(mx + sh.x * sx - 3, my + sh.y * sy - 3, 6, 6);
  // Mission target.
  const target = game.missions.target();
  if (target) {
    const pulse = 3 + Math.sin(game.time * 5) * 1.5;
    ctx.fillStyle = '#ffd319';
    ctx.beginPath();
    ctx.arc(mx + target.x * sx, my + target.y * sy, pulse + 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Police blips.
  for (const car of game.police.cars) {
    ctx.fillStyle = Math.floor(game.time * 4) % 2 === 0 ? '#ff2244' : '#2266ff';
    ctx.beginPath();
    ctx.arc(mx + car.x * sx, my + car.y * sy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (game.police.heli) {
    ctx.fillStyle = '#ff2244';
    ctx.beginPath();
    ctx.arc(mx + game.police.heli.x * sx, my + game.police.heli.y * sy, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Player arrow.
  const px = mx + game.player.x * sx;
  const py = my + game.player.y * sy;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(game.player.inCar && game.player.car ? game.player.car.angle : game.player.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -4.5);
  ctx.lineTo(-5, 4.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.fillStyle = 'rgba(255, 246, 236, 0.75)';
  ctx.font = 'bold 10px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('NEON BAY', mx + 6, my + 12);
}

export function drawHUD(ctx, game) {
  const W = game.screenW;
  const H = game.screenH;
  const player = game.player;

  // Top-left: cash, health, armor.
  panel(ctx, 14, 12, 250, 84);
  ctx.fillStyle = '#39ff88';
  ctx.font = 'bold 22px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`$${game.cash.toLocaleString('en-US')}`, 28, 32);
  drawBar(ctx, 28, 52, 150, 12, player.health / 100, player.health > 30 ? '#39ff88' : '#ff4757', 'HP');
  drawBar(ctx, 28, 68, 150, 12, player.armor / 100, '#22e6ff', 'ARMOR');
  ctx.fillStyle = PALETTE.textDim;
  ctx.font = '11px Arial, sans-serif';
  ctx.fillText(`AMMO ${player.ammo}/${player.ammoReserve}`, 186, 58);
  ctx.fillText(player.reloadTimer > 0 ? 'RELOADING…' : '', 186, 74);

  // Top-right: wanted stars + clock.
  panel(ctx, W - 214, 12, 200, 56);
  drawStars(ctx, W - 200, 34, game.police.wanted);
  ctx.fillStyle = PALETTE.textDim;
  ctx.font = 'bold 11px Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(game.police.wanted === 0 ? 'CLEAN' : `WANTED · ${game.police.wanted}★`, W - 28, 54);

  // Top-centre: mission objective.
  const objective = game.missions.objectiveText();
  ctx.font = 'bold 15px Arial, sans-serif';
  const ow = Math.min(640, ctx.measureText(objective).width + 36);
  panel(ctx, W / 2 - ow / 2, 12, ow, 38);
  ctx.fillStyle = '#ffd319';
  ctx.textAlign = 'center';
  ctx.fillText(objective, W / 2, 32);

  // Message feed under the cash panel.
  ctx.textAlign = 'left';
  ctx.font = '13px Arial, sans-serif';
  let msgY = 112;
  for (const msg of game.messages) {
    const age = game.time - msg.time;
    if (age > 7) continue;
    ctx.globalAlpha = age > 5 ? Math.max(0, 1 - (age - 5) / 2) : 1;
    ctx.fillStyle = msg.color;
    ctx.fillText(msg.text, 18, msgY);
    msgY += 20;
  }
  ctx.globalAlpha = 1;

  // Speedometer, only while driving.
  if (player.inCar && player.car) {
    const kmh = Math.round(Math.abs(player.car.speed) * 0.42);
    panel(ctx, W - 214, H - 96, 200, 82);
    ctx.fillStyle = '#fff6ec';
    ctx.font = 'bold 34px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${kmh}`, W - 58, H - 58);
    ctx.font = 'bold 12px Arial, sans-serif';
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText('km/h', W - 26, H - 58);
    ctx.textAlign = 'left';
    ctx.fillText(player.car.name.toUpperCase(), W - 200, H - 34);
    drawBar(ctx, W - 200, H - 28, 172, 8, player.car.hp / player.car.maxHp, player.car.hp > 40 ? '#22e6ff' : '#ff4757', '');
  }

  // Low-health heartbeat vignette.
  if (player.health < 35 && !player.dead) {
    const pulse = 0.22 + 0.12 * Math.sin(game.time * 6);
    const grad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
    grad.addColorStop(0, 'rgba(255, 0, 40, 0)');
    grad.addColorStop(1, `rgba(255, 0, 40, ${pulse})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // Busted progress ring when an officer is holding the player.
  if (game.police.bustTimer > 0.15) {
    ctx.save();
    ctx.translate(game.screenW / 2, game.screenH - 150);
    ctx.fillStyle = 'rgba(255, 34, 68, 0.9)';
    ctx.font = 'bold 18px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('THE COPS HAVE YOU…', 0, 0);
    drawBar(ctx, -110, 12, 220, 10, game.police.bustTimer / 1.1, '#ff2244', '');
    ctx.restore();
  }

  drawMinimap(ctx, game);
  drawObjectiveArrow(ctx, game);

  // Controls hint for the first seconds of play.
  if (game.time - game.playStartedAt < 9 && game.state === 'playing') {
    ctx.fillStyle = 'rgba(255, 246, 236, 0.85)';
    ctx.font = '13px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('WASD move / drive · E enter car · F punch · Click shoot · R reload / repair · Shift sprint · Space handbrake · P pause', W / 2, H - 18);
  }
}

// Arrow at the screen edge pointing at an off-screen objective.
export function drawObjectiveArrow(ctx, game) {
  const target = game.missions.target();
  if (!target) return;
  const cam = game.camera;
  const view = cam.viewRect();
  const margin = 60;
  if (target.x > view.x + margin && target.x < view.x + view.w - margin && target.y > view.y + margin && target.y < view.y + view.h - margin) return;
  // Walk a ray from the screen centre toward the target and stop at the
  // screen border, so the arrow never sits on top of the player.
  const cx = game.screenW / 2;
  const cy = game.screenH / 2;
  const dx = target.x - game.player.x;
  const dy = target.y - game.player.y;
  const dist = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const edgeX = (cx - 46) / Math.max(0.001, Math.abs(Math.cos(angle)));
  const edgeY = (cy - 46) / Math.max(0.001, Math.abs(Math.sin(angle)));
  const radius = Math.min(edgeX, edgeY);
  const ax = cx + Math.cos(angle) * radius;
  const ay = cy + Math.sin(angle) * radius;
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(angle);
  ctx.fillStyle = '#ffd319';
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(-10, -11);
  ctx.lineTo(-10, 11);
  ctx.closePath();
  ctx.fill();
  ctx.rotate(-angle);
  ctx.font = 'bold 12px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(dist)}m`, 0, 30);
  ctx.restore();
}

// --- menus -----------------------------------------------------------------

function menuBackdrop(ctx, game) {
  const grad = ctx.createLinearGradient(0, 0, 0, game.screenH);
  grad.addColorStop(0, 'rgba(43, 16, 85, 0.82)');
  grad.addColorStop(0.5, 'rgba(20, 8, 40, 0.78)');
  grad.addColorStop(1, 'rgba(8, 4, 18, 0.88)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, game.screenW, game.screenH);
}

function neonTitle(ctx, game) {
  const cx = game.screenW / 2;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.shadowColor = PALETTE.neonPink;
  ctx.shadowBlur = 34;
  ctx.fillStyle = '#ff2e88';
  ctx.font = 'bold 92px Arial, sans-serif';
  ctx.fillText('NEON BAY', cx, 168);
  ctx.shadowColor = PALETTE.neonCyan;
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#22e6ff';
  ctx.font = 'bold 92px Arial, sans-serif';
  ctx.globalAlpha = 0.35;
  ctx.fillText('NEON BAY', cx + 3, 171);
  ctx.globalAlpha = 1;
  ctx.restore();
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 19px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('AN OPEN-WORLD CRIME STORY · CORAL BAY, 2026', cx, 208);
  ctx.fillStyle = PALETTE.textDim;
  ctx.font = '15px Arial, sans-serif';
  ctx.fillText('Steal cars. Outrun the NBPD. Run five jobs for Vera Solano — and own the city.', cx, 236);
}

export function drawTitleScreen(ctx, game, buttons) {
  menuBackdrop(ctx, game);
  neonTitle(ctx, game);
  const cx = game.screenW / 2;
  let y = 300;
  if (game.saveExists) {
    drawButton(ctx, buttons, 'continue', cx - 150, y, 300, 52, 'CONTINUE', true);
    y += 66;
    drawButton(ctx, buttons, 'newgame', cx - 150, y, 300, 52, 'NEW GAME', false);
    y += 66;
  } else {
    drawButton(ctx, buttons, 'newgame', cx - 150, y, 300, 52, 'START ENGINE', true);
    y += 66;
  }
  drawButton(ctx, buttons, 'howto', cx - 150, y, 300, 52, game.showHowTo ? 'HIDE CONTROLS ▲' : 'HOW TO PLAY ▼', false);
  y += 66;
  if (game.showHowTo) {
    panel(ctx, cx - 260, y, 520, 196);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '14px Arial, sans-serif';
    ctx.textAlign = 'left';
    const lines = [
      'WASD / Arrows — walk, or drive when in a car',
      'E — steal / enter a car, exit a car',
      'Mouse + Click — aim and shoot · F — punch',
      'R — reload pistol · R near Sunset Garage — repair ($150)',
      'Space — handbrake · Shift — sprint · M — mute · P — pause',
      'Stars rise when you steal, shoot or hit cops. Hide to lose them.',
      'Safehouse on Coral Isle heals you and clears your wanted level.',
      'Progress saves automatically after every job.',
    ];
    lines.forEach((line, i) => ctx.fillText(line, cx - 240, y + 28 + i * 22));
    y += 210;
  }
  ctx.fillStyle = PALETTE.textDim;
  ctx.font = '12px Arial, sans-serif';
  ctx.textAlign = 'center';
  if (game.saveExists) {
    ctx.fillText(`Saved progress: $${game.save.cash.toLocaleString('en-US')} · ${game.save.completed} job${game.save.completed === 1 ? '' : 's'} done`, cx, game.screenH - 56);
  }
  ctx.fillText('A fan-made original. Not affiliated with Rockstar Games.', cx, game.screenH - 34);
}

export function drawPauseScreen(ctx, game, buttons) {
  menuBackdrop(ctx, game);
  const cx = game.screenW / 2;
  ctx.fillStyle = '#fff6ec';
  ctx.font = 'bold 54px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PAUSED', cx, 150);
  ctx.fillStyle = PALETTE.textDim;
  ctx.font = '16px Arial, sans-serif';
  ctx.fillText(`Cash $${game.cash.toLocaleString('en-US')} · Jobs done ${game.missions.completedCount}/5 · Wanted ${game.police.wanted}★`, cx, 186);
  let y = 240;
  drawButton(ctx, buttons, 'resume', cx - 150, y, 300, 52, 'RESUME', true);
  y += 66;
  drawButton(ctx, buttons, 'restart-mission', cx - 150, y, 300, 52, 'RESTART CURRENT JOB', false);
  y += 66;
  drawButton(ctx, buttons, 'mute', cx - 150, y, 300, 52, game.audio.muted ? 'SOUND: OFF' : 'SOUND: ON', false);
  y += 66;
  drawButton(ctx, buttons, 'quit-title', cx - 150, y, 300, 52, 'SAVE & QUIT TO TITLE', false);
}

export function drawEndScreen(ctx, game, buttons) {
  menuBackdrop(ctx, game);
  const cx = game.screenW / 2;
  const busted = game.endKind === 'busted';
  ctx.save();
  ctx.textAlign = 'center';
  ctx.shadowColor = busted ? '#2266ff' : '#ff2244';
  ctx.shadowBlur = 30;
  ctx.fillStyle = busted ? '#70a1ff' : '#ff4757';
  ctx.font = 'bold 84px Arial, sans-serif';
  ctx.fillText(busted ? 'BUSTED!' : 'WASTED', cx, 190);
  ctx.restore();
  ctx.fillStyle = PALETTE.text;
  ctx.font = '18px Arial, sans-serif';
  ctx.fillText(
    busted
      ? 'The NBPD took you in. Your lawyer got the charges dropped — for a price.'
      : 'You flatlined on the streets of Neon Bay. The hospital patched you up — for a price.',
    cx, 236,
  );
  ctx.fillStyle = '#ffd319';
  ctx.font = 'bold 20px Arial, sans-serif';
  ctx.fillText(`Lost $${game.endLost.toLocaleString('en-US')}`, cx, 272);
  let y = 330;
  drawButton(ctx, buttons, 'respawn', cx - 150, y, 300, 52, 'BACK ON THE STREETS', true);
  y += 66;
  drawButton(ctx, buttons, 'quit-title', cx - 150, y, 300, 52, 'QUIT TO TITLE', false);
}

export function drawMissionBriefing(ctx, game) {
  const mission = game.briefingMission;
  if (!mission || game.time - game.briefingAt > 7) return;
  const W = game.screenW;
  const age = game.time - game.briefingAt;
  const alpha = age > 5.5 ? Math.max(0, 1 - (age - 5.5) / 1.5) : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  panel(ctx, W / 2 - 330, 120, 660, 150);
  ctx.fillStyle = '#ffd319';
  ctx.font = 'bold 24px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(mission.title, W / 2, 158);
  ctx.fillStyle = PALETTE.text;
  ctx.font = '15px Arial, sans-serif';
  wrapText(ctx, mission.briefing, W / 2, 184, 600, 20);
  ctx.fillStyle = '#39ff88';
  ctx.font = 'bold 15px Arial, sans-serif';
  ctx.fillText(`PAYOUT $${mission.reward.toLocaleString('en-US')}`, W / 2, 252);
  ctx.restore();
}

export function drawJobDoneBanner(ctx, game) {
  if (!game.jobDone || game.time - game.jobDoneAt > 4) return;
  const W = game.screenW;
  const age = game.time - game.jobDoneAt;
  const alpha = age > 3 ? Math.max(0, 1 - (age - 3)) : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#39ff88';
  ctx.font = 'bold 40px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#39ff88';
  ctx.shadowBlur = 22;
  ctx.fillText(`JOB DONE  +$${game.jobDone.reward.toLocaleString('en-US')}`, W / 2, 120);
  ctx.restore();
}

export function drawStoryDoneBanner(ctx, game) {
  if (!game.storyDoneShown) return;
  const W = game.screenW;
  ctx.save();
  ctx.fillStyle = '#ffd319';
  ctx.font = 'bold 34px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#ffd319';
  ctx.shadowBlur = 20;
  ctx.fillText('NEON BAY IS YOURS, REX.', W / 2, 120);
  ctx.restore();
}

function wrapText(ctx, text, cx, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, cx, yy);
      line = word;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, cx, yy);
}
