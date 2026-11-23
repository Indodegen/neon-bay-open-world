// HUD: cash + bank, wanted stars, health + armor, speed + fuel, mission
// objective, 2D-canvas minimap with GPS route, toasts, named police units,
// dialog portraits, weapon bar, radio, garage panel, map screen, cutscene
// letterbox. Public API identical to round 6 (show/hide/showToast/update).
import { WEAPONS } from './combat.js';

export const RADIO_STATIONS = [
  'NEON FM 88.5 — SYNTHWAVE',
  'BAY 101.3 — SALSA Y REGGAETON',
  'VICE ROCK 95.7 — GUITARS',
];
export const GARAGE_UPGRADES = [
  { name: 'ENGINE TUNE — STAGE 2', price: 5000 },
  { name: 'ARMOR PLATING', price: 1800 },
  { name: 'NITRO BOOST', price: 3000 },
  { name: 'RESPRAY — NEON PINK', price: 100 },
  { name: 'SPOILER — GT WING', price: 750 },
  { name: 'GOLD RIMS', price: 1200 },
];
export const CREW = [
  { id: 'jax', name: 'JAX MARLOW', role: 'WHEELMAN' },
  { id: 'rosa', name: 'ROSA VEGA', role: 'FIXER' },
  { id: 'dex', name: 'DEX MALONE', role: 'MECHANIC' },
  { id: 'lucia', name: 'LUCIA REYES', role: 'GETAWAY DRIVER' },
  { id: 'preacher', name: 'MARCUS COLE', role: 'THE PREACHER' },
];
const PORTRAIT_COLORS = {
  jax: { skin: '#c98d64', hair: '#2a1a12', shirt: '#ff6b35', cap: '#ff9f1c' },
  rosa: { skin: '#d8a077', hair: '#1a0a0a', shirt: '#ff2e88', cap: null },
  dex: { skin: '#8a6b4a', hair: '#111111', shirt: '#2ed573', cap: '#2ed573' },
  lucia: { skin: '#c98d64', hair: '#3a1a0a', shirt: '#00e5ff', cap: null },
  preacher: { skin: '#5a3a22', hair: '#111111', shirt: '#e8e8e8', cap: null },
};

export class Hud {
  constructor() {
    this.el = document.getElementById('hud');
    this.cash = document.getElementById('cash');
    this.bank = document.getElementById('bank');
    this.stars = document.getElementById('stars');
    this.health = document.getElementById('healthfill');
    this.armor = document.getElementById('armorfill');
    this.speed = document.getElementById('speed');
    this.fuel = document.getElementById('fuelfill');
    this.objTitle = document.getElementById('obj-title');
    this.objText = document.getElementById('obj-text');
    this.objSub = document.getElementById('obj-sub');
    this.objCount = document.getElementById('obj-count');
    this.toast = document.getElementById('toast');
    this.map = document.getElementById('minimap');
    this.mctx = this.map.getContext('2d');
    this.toastTimer = 0;
    this.policeList = document.getElementById('police-list');
    this.weaponBar = document.getElementById('weaponbar');
    this.radioEl = document.getElementById('radio');
    this.dialogEl = document.getElementById('dialog');
    this.dialogName = document.getElementById('dialog-name');
    this.dialogText = document.getElementById('dialog-text');
    this.portrait = document.getElementById('portrait');
    this.pctx = this.portrait.getContext('2d');
    this.letterbox = document.getElementById('letterbox');
    this.dialogTimer = 0;
    this.radioIndex = 0;
    this.mapScreen = document.getElementById('map-screen');
    this.mapCanvas = document.getElementById('map-canvas');
    this.mapCtx = this.mapCanvas.getContext('2d');
    this.garagePanel = document.getElementById('garage-panel');
  }
  show() { this.el.classList.remove('hidden'); }
  hide() { this.el.classList.add('hidden'); }
  showToast(text, ms = 2600) {
    this.toast.textContent = text;
    this.toast.style.opacity = 1;
    this.toastTimer = ms / 1000;
  }
  cycleRadio() {
    this.radioIndex = (this.radioIndex + 1) % RADIO_STATIONS.length;
    this.showToast('RADIO — ' + RADIO_STATIONS[this.radioIndex], 1600);
  }
  // Dialog with a drawn portrait. cinematic=true adds letterbox bars.
  showDialog(speakerId, text, ms = 4200, cinematic = false) {
    const crew = CREW.find((c) => c.id === speakerId) || CREW[0];
    this.drawPortrait(this.pctx, speakerId);
    this.dialogName.textContent = crew.name + ' — ' + crew.role;
    this.dialogText.textContent = '"' + text + '"';
    this.dialogEl.classList.remove('hidden');
    if (cinematic) this.letterbox.classList.remove('hidden');
    this.dialogTimer = ms / 1000;
  }
  hideDialog() {
    this.dialogEl.classList.add('hidden');
    this.letterbox.classList.add('hidden');
    this.dialogTimer = 0;
  }
  drawPortrait(g, id) {
    const c = PORTRAIT_COLORS[id] || PORTRAIT_COLORS.jax;
    const S = 72;
    g.clearRect(0, 0, S, S);
    g.fillStyle = '#1a1030'; g.fillRect(0, 0, S, S);
    // shoulders / shirt
    g.fillStyle = c.shirt;
    g.beginPath(); g.moveTo(8, 72); g.quadraticCurveTo(36, 44, 64, 72); g.closePath(); g.fill();
    // neck + head
    g.fillStyle = c.skin;
    g.fillRect(31, 44, 10, 10);
    g.beginPath(); g.arc(36, 32, 17, 0, Math.PI * 2); g.fill();
    // hair or cap
    if (c.cap) {
      g.fillStyle = c.cap;
      g.beginPath(); g.arc(36, 30, 17, Math.PI, 0); g.fill();
      g.fillRect(19, 26, 34, 5);
      g.fillRect(30, 12, 12, 6);
    } else {
      g.fillStyle = c.hair;
      g.beginPath(); g.arc(36, 28, 17, Math.PI, 0); g.fill();
      if (id === 'lucia' || id === 'rosa') { // long hair down the sides
        g.fillRect(18, 28, 6, 22); g.fillRect(48, 28, 6, 22);
      }
    }
    // eyes + mouth
    g.fillStyle = '#14141c';
    g.fillRect(26, 32, 4, 3); g.fillRect(42, 32, 4, 3);
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(31, 44, 10, 2);
    // neon rim
    g.strokeStyle = c.shirt; g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, S - 3, S - 3);
  }
  showGarage(game) {
    const list = document.getElementById('garage-list');
    list.innerHTML = GARAGE_UPGRADES.map((u) =>
      `<div class="g-row"><span>${u.name}</span><b>$${u.price.toLocaleString('en-US')}</b></div>`).join('');
    document.getElementById('garage-cash').textContent =
      'CASH $' + game.player.cash.toLocaleString('en-US') + ' · BANK $' + (game.bank || 0).toLocaleString('en-US');
    this.garagePanel.classList.remove('hidden');
  }
  hideGarage() { this.garagePanel.classList.add('hidden'); }
  showMap(game) {
    this.mapScreen.classList.remove('hidden');
    this.drawBigMap(game);
    const done = Math.min(game.missions.index, 12);
    document.getElementById('map-missions').innerHTML =
      '<b>STORY ' + done + '/12</b>' + game.missions.defs.map((m, i) =>
        `<div class="m-row ${i < done ? 'done' : i === done ? 'active' : ''}">${i < done ? '✓' : i === done ? '▶' : '·'} ${m.title.replace('MISSION ', '')} — $${m.reward.toLocaleString('en-US')}</div>`).join('');
    document.getElementById('map-stats').innerHTML =
      `CASH $${game.player.cash.toLocaleString('en-US')} · BANK $${(game.bank || 0).toLocaleString('en-US')}<br>` +
      `NEON TAPES ${game.missions.tapesCollected}/24 · TAXI ${game.missions.stats.fares} · DELIVERIES ${game.missions.stats.deliveries} · RACES ${game.missions.stats.races}<br>` +
      `TAKEDOWNS ${game.combat.takedowns} · WANTED ${'★'.repeat(game.police.wanted) || 'CLEAN'}<br>` +
      `GANGS — VIPERS (HARBOR) · SOL KINGS (BOARDWALK) · CORTEZ (DOWNTOWN)`;
  }
  hideMap() { this.mapScreen.classList.add('hidden'); }
  drawBigMap(game) {
    const g = this.mapCtx, S = 460, C = 230;
    g.clearRect(0, 0, S, S);
    g.fillStyle = '#0d1430'; g.fillRect(0, 0, S, S);
    const toMap = (x, z) => [C + (x / 300) * 210, C + (z / 300) * 210];
    // ocean + beach
    g.fillStyle = '#1e6f9e'; g.fillRect(420, 0, 40, S);
    g.fillStyle = '#e8cf9a'; g.fillRect(405, 0, 15, S);
    // gang turf tint
    g.fillStyle = 'rgba(46,213,115,0.13)';
    g.fillRect(20, 300, 150, 140); // harbor — Vipers
    g.fillStyle = 'rgba(0,229,255,0.13)';
    g.fillRect(360, 60, 60, 340); // boardwalk — Sol Kings
    g.fillStyle = 'rgba(255,46,136,0.13)';
    g.fillRect(160, 160, 140, 140); // downtown — Cortez
    // roads
    g.strokeStyle = '#3d4454'; g.lineWidth = 7;
    for (let i = -5; i <= 5; i++) {
      const p = (i * 52 / 300) * 210;
      g.beginPath(); g.moveTo(C + p, 10); g.lineTo(C + p, S - 10); g.stroke();
      g.beginPath(); g.moveTo(10, C + p); g.lineTo(S - 10, C + p); g.stroke();
    }
    // tapes
    g.fillStyle = '#ffd23f';
    for (const t of game.missions.tapes) {
      if (t.taken) continue;
      const [x, z] = toMap(t.x, t.z);
      g.fillRect(x - 2, z - 2, 4, 4);
    }
    // mission marker + player
    if (game.missions.marker) {
      const [mx, mz] = toMap(game.missions.marker.position.x, game.missions.marker.position.z);
      g.fillStyle = '#ffd23f';
      g.beginPath(); g.arc(mx, mz, 9, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
    }
    const pp = game.player.inCar ? game.player.inCar.mesh.position : game.player.mesh.position;
    const [px, pz] = toMap(pp.x, pp.z);
    g.fillStyle = '#2ed573';
    g.beginPath(); g.arc(px, pz, 7, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
  }
  update(dt, game) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.style.opacity = 0;
    }
    if (this.dialogTimer > 0) {
      this.dialogTimer -= dt;
      if (this.dialogTimer <= 0) this.hideDialog();
    }
    this.cash.textContent = '$' + game.player.cash.toLocaleString('en-US');
    if (this.bank) this.bank.textContent = 'BANK $' + (game.bank || 0).toLocaleString('en-US');
    const w = game.police.wanted;
    let s = '';
    for (let i = 0; i < 5; i++) s += `<span class="${i < w ? '' : 'off'}">★</span>`;
    this.stars.innerHTML = s;
    this.health.style.width = Math.max(0, game.player.health) + '%';
    if (this.armor) this.armor.style.width = Math.max(0, game.player.armor || 0) + '%';
    if (this.fuel) this.fuel.style.width = Math.max(0, game.fuel ?? 100) + '%';
    const mph = game.player.inCar ? Math.abs(game.player.inCar.speed) * 2.2 : 0;
    this.speed.innerHTML = Math.round(mph) + '<small> MPH</small>';
    const o = game.missions.objectiveText();
    this.objTitle.textContent = o.title;
    this.objText.textContent = o.text;
    this.objSub.textContent = o.sub;
    if (this.objCount) this.objCount.textContent = 'STORY ' + Math.min(game.missions.index + 1, 12) + '/12 · TAPES ' + game.missions.tapesCollected + '/24';
    if (this.radioEl) this.radioEl.textContent = '♪ ' + RADIO_STATIONS[this.radioIndex];
    // police units panel — closest unit first so the nearest threat is on top
    if (this.policeList) {
      const pp = game.player.inCar ? game.player.inCar.mesh.position : game.player.mesh.position;
      const units = game.police.unitList(pp);
      units.sort((a, b) => a.dist - b.dist);
      this.policeList.innerHTML = units.length
        ? units.map((u) => `<div class="u-row"><b>${u.callsign}</b> ${u.name} · ${u.status} · ${u.dist}m</div>`).join('')
        : '';
      this.policeList.classList.toggle('hidden', units.length === 0);
    }
    // weapon bar: slots 1/2/3 + current weapon ammo + reload state
    if (this.weaponBar) {
      const c = game.combat;
      this.weaponBar.innerHTML = WEAPONS.map((wp, i) =>
        `<div class="w-slot ${i === c.weaponIndex ? 'active' : ''}"><b>${i + 1}</b> ${wp.name} <span>${i === c.weaponIndex ? c.ammo + ' / ' + c.ammoReserve : '—'}</span></div>`).join('')
        + (c.reloadTimer > 0 ? '<div class="w-reload">RELOADING…</div>' : '');
    }
    this.drawMinimap(game);
  }
  drawMinimap(game) {
    const g = this.mctx, S = 200, C = 100;
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath(); g.arc(C, C, 98, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#0d1430'; g.fillRect(0, 0, S, S);
    const toMap = (x, z) => [C + (x / 300) * 96, C + (z / 300) * 96];
    // Ocean + beach on the east edge.
    g.fillStyle = '#1e6f9e'; g.fillRect(196, 0, 4, S);
    g.fillStyle = '#e8cf9a'; g.fillRect(190, 0, 6, S);
    // Gang turf tints, same as the big map screen — the minimap should read
    // whose streets you are on at a glance.
    g.fillStyle = 'rgba(46,213,115,0.13)'; g.fillRect(9, 130, 65, 61); // harbor — Vipers
    g.fillStyle = 'rgba(0,229,255,0.13)'; g.fillRect(156, 26, 26, 148); // boardwalk — Sol Kings
    g.fillStyle = 'rgba(255,46,136,0.13)'; g.fillRect(70, 70, 61, 61); // downtown — Cortez
    // Roads.
    g.strokeStyle = '#3d4454'; g.lineWidth = 5;
    for (let i = -5; i <= 5; i++) {
      const p = (i * 52 / 300) * 96;
      g.beginPath(); g.moveTo(C + p, 4); g.lineTo(C + p, 196); g.stroke();
      g.beginPath(); g.moveTo(4, C + p); g.lineTo(196, C + p); g.stroke();
    }
    const pp = game.player.inCar ? game.player.inCar.mesh.position : game.player.mesh.position;
    const [px, pz] = toMap(pp.x, pp.z);
    // GPS route: dashed line from the player to the mission marker.
    const m = game.missions.current();
    if (m && game.missions.marker) {
      const [mx, mz] = toMap(game.missions.marker.position.x, game.missions.marker.position.z);
      g.strokeStyle = '#ffd23f'; g.lineWidth = 2; g.setLineDash([5, 4]);
      g.beginPath(); g.moveTo(px, pz); g.lineTo(mx, mz); g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#ffd23f';
      g.beginPath(); g.arc(mx, mz, 7, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
    }
    // Neon tapes (gold dots).
    g.fillStyle = '#ffd23f';
    for (const t of game.missions.tapes) {
      if (t.taken) continue;
      const [x, z] = toMap(t.x, t.z);
      g.fillRect(x - 1, z - 1, 2, 2);
    }
    // Traffic (grey), police (blue/red), heli (yellow), player (green arrow).
    for (const car of game.traffic.cars) {
      const [x, z] = toMap(car.mesh.position.x, car.mesh.position.z);
      g.fillStyle = '#9aa3b2'; g.fillRect(x - 2, z - 2, 4, 4);
    }
    for (const cop of game.police.cars) {
      const [x, z] = toMap(cop.mesh.position.x, cop.mesh.position.z);
      g.fillStyle = '#3b82f6'; g.beginPath(); g.arc(x, z, 4, 0, Math.PI * 2); g.fill();
    }
    if (game.police.heli) {
      const [x, z] = toMap(game.police.heli.position.x, game.police.heli.position.z);
      g.fillStyle = '#ffe66d'; g.beginPath(); g.arc(x, z, 5, 0, Math.PI * 2); g.fill();
    }
    const ang = game.player.inCar ? game.player.inCar.angle : game.player.angle;
    g.save();
    g.translate(px, pz); g.rotate(Math.atan2(Math.sin(ang), Math.cos(ang)) * -1 + Math.PI);
    g.fillStyle = '#2ed573';
    g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 6); g.lineTo(-6, 6); g.closePath(); g.fill();
    g.restore();
    g.restore();
  }
}
