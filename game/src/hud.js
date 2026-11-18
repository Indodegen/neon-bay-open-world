// NEON BAY — hud.js
// The full GTA-style HUD (DOM + canvas minimap) and every screen: title,
// briefing, pause, busted/wasted, mission complete, jobs, full map, garage,
// gun shop, safehouse, cutscenes, notifications and dialog with procedural
// portraits. All text is original; all portraits are drawn on canvas.

import { CHARACTERS, RADIO, MISSIONS, SIDE_JOBS, GARAGE_UPGRADES, PROPERTIES, WEATHER_NAMES, STREETS } from './config.js';
import { fmtMoney, fmtClock, makeCanvas, roundRect } from './util.js';

// --- procedural portraits -----------------------------------------------------
export function portraitURL(key) {
  const ch = CHARACTERS[key] || CHARACTERS.vera;
  const c = makeCanvas(180, 200), x = c.getContext('2d');
  // backdrop
  const g = x.createLinearGradient(0, 0, 0, 200);
  g.addColorStop(0, '#2b2f45'); g.addColorStop(1, ch.accent + '55');
  x.fillStyle = g; x.fillRect(0, 0, 180, 200);
  x.strokeStyle = 'rgba(255,255,255,0.15)';
  for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(0, 30 + i * 36); x.lineTo(180, 14 + i * 36); x.stroke(); }
  // shoulders / jacket
  x.fillStyle = '#1d2233';
  x.beginPath(); x.moveTo(20, 200); x.quadraticCurveTo(30, 148, 90, 146); x.quadraticCurveTo(150, 148, 160, 200); x.closePath(); x.fill();
  x.fillStyle = ch.accent; x.fillRect(84, 148, 12, 52);
  // neck + head
  x.fillStyle = '#b97e55'; x.fillRect(80, 128, 20, 26);
  x.fillStyle = ch.skin;
  x.beginPath(); x.ellipse(90, 96, 34, 42, 0, 0, Math.PI * 2); x.fill();
  // ears
  x.beginPath(); x.ellipse(56, 98, 6, 9, 0, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.ellipse(124, 98, 6, 9, 0, 0, Math.PI * 2); x.fill();
  // hair per style
  x.fillStyle = ch.hair;
  if (ch.hairStyle === 'bob') {
    x.beginPath(); x.ellipse(90, 66, 38, 26, 0, Math.PI, Math.PI * 2); x.fill();
    x.fillRect(52, 66, 10, 44); x.fillRect(118, 66, 10, 44);
  } else if (ch.hairStyle === 'pony') {
    x.beginPath(); x.ellipse(90, 62, 34, 20, 0, Math.PI, Math.PI * 2); x.fill();
    x.beginPath(); x.ellipse(126, 96, 8, 34, 0.4, 0, Math.PI * 2); x.fill();
  } else if (ch.hairStyle === 'buzz') {
    x.beginPath(); x.ellipse(90, 64, 33, 14, 0, Math.PI, Math.PI * 2); x.fill();
  } else if (ch.hairStyle === 'flat') {
    x.fillRect(56, 52, 68, 14);
  } else if (ch.hairStyle === 'spike') {
    for (let i = 0; i < 6; i++) {
      x.beginPath(); x.moveTo(58 + i * 12, 62); x.lineTo(64 + i * 12, 38 + (i % 2) * 8); x.lineTo(70 + i * 12, 62); x.fill();
    }
  } else { // fade
    x.beginPath(); x.ellipse(90, 62, 34, 16, 0, Math.PI, Math.PI * 2); x.fill();
  }
  // brows, eyes, nose, mouth
  x.fillStyle = ch.hair;
  x.fillRect(68, 86, 16, 3); x.fillRect(96, 86, 16, 3);
  x.fillStyle = '#ffffff';
  x.beginPath(); x.ellipse(76, 96, 6, 4, 0, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.ellipse(104, 96, 6, 4, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#1a1a1a';
  x.beginPath(); x.arc(76, 96, 2.6, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.arc(104, 96, 2.6, 0, Math.PI * 2); x.fill();
  x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(90, 100); x.lineTo(88, 112); x.stroke();
  x.strokeStyle = '#7a3b2e';
  x.beginPath(); x.moveTo(80, 124); x.quadraticCurveTo(90, 129, 100, 124); x.stroke();
  // rim light
  x.strokeStyle = ch.accent; x.lineWidth = 3; x.globalAlpha = 0.7;
  x.beginPath(); x.ellipse(90, 96, 36, 44, 0, -0.6, 0.9); x.stroke();
  x.globalAlpha = 1;
  return c.toDataURL('image/png');
}

export function createHUD(game) {
  const root = document.getElementById('hud');
  root.innerHTML = `
  <div id="hud-top-left">
    <div id="mission-panel"><div id="mission-title">NEON BAY</div><div id="mission-objective">Visit Vera Solano for the next job</div>
    <div id="mission-progress"><div id="mission-progress-fill"></div></div><div id="mission-dist"></div></div>
  </div>
  <div id="hud-top-right">
    <div id="stars"></div>
    <div id="clock-weather"><span id="clock">17:24</span><span id="weather">Clear</span></div>
    <div id="radio-box"><span id="radio-name">NEON FM 88.4</span><span id="radio-desc">Synthwave nights</span></div>
  </div>
  <div id="hud-bottom-left">
    <canvas id="minimap" width="220" height="220"></canvas>
    <div id="weapon-box"><span id="weapon-name">FISTS</span><span id="weapon-ammo">—</span></div>
  </div>
  <div id="hud-bottom-right">
    <div id="cash">$0</div>
    <div id="speedo"><span id="speed">0</span><span id="speed-unit">MPH</span></div>
    <div id="veh-cond"><div id="veh-cond-fill"></div><span id="veh-cond-label">VEHICLE</span></div>
  </div>
  <div id="hud-bottom-center">
    <div id="hp-bar"><div id="hp-fill"></div><span>HP</span></div>
    <div id="armor-bar"><div id="armor-fill"></div><span>ARMOR</span></div>
  </div>
  <div id="police-list"></div>
  <div id="dialog"><img id="dialog-portrait" alt=""><div id="dialog-body"><div id="dialog-name"></div><div id="dialog-text"></div><div id="dialog-hint">E — continue</div></div></div>
  <div id="notifications"></div>
  <div id="counters"><span id="counter-stash">◆ 0/8 stashes</span><span id="counter-mission">★ 0/12 missions</span><span id="counter-skill">SKILL 0</span></div>
  <div id="interact-prompt"></div>
  <div id="screen"></div>
  <div id="cutscene-bars"><div class="bar top"></div><div class="bar bottom"></div></div>
  <div id="toast"></div>`;

  const $ = (id) => document.getElementById(id);
  const H = {
    game, root,
    notify(title, text, ms = 4200) {
      const n = document.createElement('div');
      n.className = 'notif';
      n.innerHTML = `<b>${title}</b><span>${text}</span>`;
      $('notifications').appendChild(n);
      setTimeout(() => { n.classList.add('out'); setTimeout(() => n.remove(), 500); }, ms);
    },
    toast(text, ms = 2600) {
      const t = $('toast'); t.textContent = text; t.classList.add('show');
      clearTimeout(H._toastT);
      H._toastT = setTimeout(() => t.classList.remove('show'), ms);
    },
    setObjective(text) { $('mission-objective').textContent = text; },
    setDistance(d) { $('mission-dist').textContent = d > 999 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m'; },
    setProgress(done, total) {
      const f = $('mission-progress-fill');
      f.style.width = total > 0 ? Math.min(100, (done / total) * 100) + '%' : '0%';
      f.style.display = total > 0 ? 'block' : 'none';
    },
    showDialog(charKey, text, durSec = 8) {
      $('dialog-portrait').src = portraitURL(charKey);
      const ch = CHARACTERS[charKey] || CHARACTERS.vera;
      $('dialog-name').textContent = `${ch.name} — ${ch.role}`;
      $('dialog-name').style.color = ch.accent;
      $('dialog-text').textContent = text;
      $('dialog').classList.add('show');
      clearTimeout(H._dlgT);
      if (durSec > 0) H._dlgT = setTimeout(() => H.hideDialog(), durSec * 1000);
    },
    hideDialog() { $('dialog').classList.remove('show'); },
    showMissionComplete(name, pay) {
      H.showScreen('complete', `
        <div class="big-title gold">MISSION PASSED</div>
        <div class="big-sub">${name}</div>
        <div class="big-pay">+$${pay.toLocaleString('en-US')}</div>
        <div class="big-hint">Press E to continue</div>`);
      setTimeout(() => { if (H.screenKind === 'complete') H.hideScreen(); }, 6000);
    },
    showBusted(reason) {
      H.showScreen('busted', `
        <div class="big-title red">BUSTED</div>
        <div class="big-sub">${reason}</div>
        <div class="big-hint">You lose $250 bail — Press E to respawn</div>`);
    },
    showWasted(reason) {
      H.showScreen('wasted', `
        <div class="big-title red">WASTED</div>
        <div class="big-sub">${reason}</div>
        <div class="big-hint">You lose $250 hospital bill — Press E to respawn</div>`);
    },
    screenKind: null,
    showScreen(kind, html) {
      H.screenKind = kind;
      const s = $('screen');
      // Tag the overlay itself with the kind so CSS can lay each screen
      // out differently (the garage docks left so the car stays visible).
      s.className = 'screen-' + kind;
      s.innerHTML = `<div class="screen-inner screen-${kind}">${html}</div>`;
      s.classList.add('show');
    },
    hideScreen() { H.screenKind = null; $('screen').classList.remove('show'); $('screen').innerHTML = ''; },

    showTitle() {
      H.showScreen('title', `
        <div class="title-logo">NEON<span>BAY</span></div>
        <div class="title-tag">CORAL BAY · A SUN-SOAKED OPEN WORLD</div>
        <div class="title-menu">
          <div class="title-item sel">▶ &nbsp;CONTINUE — ${game.state.saveSlot ? 'Slot ' + game.state.saveSlot : 'New Game'}</div>
          <div class="title-item">NEW GAME</div>
          <div class="title-item">LOAD GAME — 3 save slots</div>
          <div class="title-item">OPTIONS — Radio, Music, Controls</div>
        </div>
        <div class="title-controls">WASD drive / walk · E interact · F enter car · SPACE brake · LMB shoot · R reload · M map · P pause · 1-4 radio</div>
        <div class="title-foot">An original crime story. Not affiliated with Rockstar Games or GTA.</div>`);
    },
    showPause() {
      const st = game.state.stats;
      H.showScreen('pause', `
        <div class="big-title">PAUSED</div>
        <div class="panel-grid">
          <div><b>MISSIONS</b><span>${st.missionsDone} / 12 complete</span></div>
          <div><b>CASH</b><span>${fmtMoney(game.state.cash)}</span></div>
          <div><b>SIDE JOBS</b><span>${st.jobsDone} done</span></div>
          <div><b>STASHES</b><span>${game.M.stashFound.size} / 8</span></div>
          <div><b>PLAY TIME</b><span>${Math.floor(st.playTime / 60)} min</span></div>
          <div><b>WANTED</b><span>${game.police.stars} ★</span></div>
        </div>
        <div class="big-hint">P / ESC — resume · M — map · E — close</div>`);
    },
    showMap() {
      const done = game.M.completed.length;
      const pct = Math.round((done / 12) * 100);
      const rows = MISSIONS.map(m => `<div class="map-mission ${game.M.completed.includes(m.id) ? 'done' : ''}">${game.M.completed.includes(m.id) ? '✓' : '○'} ${m.id}. ${m.name} — $${m.pay.toLocaleString('en-US')}</div>`).join('');
      H.showScreen('map', `
        <div class="big-title">CORAL BAY — MAP</div>
        <div class="map-wrap">
          <canvas id="map-canvas" width="460" height="460"></canvas>
          <div class="map-side">
            <div class="map-pct">STORY ${pct}% COMPLETE</div>
            <div class="map-list">${rows}</div>
            <div class="map-legend">◆ You &nbsp; ● Mission &nbsp; ▲ Police &nbsp; ★ Stash &nbsp; ⌂ Safehouse</div>
            <div class="map-stats">Cash ${fmtMoney(game.state.cash)} · Jobs ${game.state.stats.jobsDone} · Stashes ${game.M.stashFound.size}/8 · Skill ${game.state.skill}</div>
            <div class="big-hint">M / E — close map</div>
          </div>
        </div>`);
      H.drawBigMap();
    },
    showGarage() {
      const rows = GARAGE_UPGRADES.map(u => {
        const lvl = game.state.upgrades[u.id] || 0;
        const next = lvl < 3 ? u.levels[lvl + 1] : null;
        return `<div class="shop-row"><b>${u.name}</b><span>${u.desc}</span><span>LVL ${lvl}/3</span><span>${next ? fmtMoney(next) + ' — press ' + (u.id === 'engine' ? '1' : u.id === 'armor' ? '2' : u.id === 'brakes' ? '3' : '4') : 'MAX'}</span></div>`;
      }).join('');
      H.showScreen('garage', `
        <div class="big-title gold">NEON GARAGE</div>
        <div class="big-sub">Upgrades apply to your current car · Respray changes paint</div>
        ${rows}
        <div class="shop-row"><b>Respray colour</b><span>Red / Gold / Teal / Purple</span><span>$500</span><span>press 5-8</span></div>
        <div class="big-hint">E — leave garage · Cash ${fmtMoney(game.state.cash)}</div>`);
    },
    showGunshop() {
      H.showScreen('gunshop', `
        <div class="big-title gold">AMMU-NATION</div>
        <div class="shop-row"><b>Pistol ammo ×60</b><span>Standard rounds</span><span>$120</span><span>press 1</span></div>
        <div class="shop-row"><b>Body armor</b><span>Full vest — 100 armor</span><span>$300</span><span>press 2</span></div>
        <div class="shop-row"><b>Medkit</b><span>Restore 50 HP</span><span>$80</span><span>press 3</span></div>
        <div class="big-hint">E — leave shop · Cash ${fmtMoney(game.state.cash)}</div>`);
    },
    showJobs() {
      const rows = SIDE_JOBS.map((j, i) => `<div class="shop-row"><b>${j.name}</b><span>${j.desc}</span><span>$${j.pay}</span><span>press ${i + 1}</span></div>`).join('');
      H.showScreen('jobs', `
        <div class="big-title">SIDE JOBS</div>
        ${rows}
        <div class="big-hint">E — close</div>`);
    },
    showSafehouse() {
      H.showScreen('safehouse', `
        <div class="big-title gold">SAFEHOUSE</div>
        <div class="big-sub">Your place above the marina. Save, heal, change clothes.</div>
        <div class="shop-row"><b>Save game</b><span>Slot 1 / 2 / 3</span><span>—</span><span>press 1-3</span></div>
        <div class="shop-row"><b>Sleep</b><span>Heal to full, advance to morning</span><span>—</span><span>press 4</span></div>
        <div class="shop-row"><b>Change outfit</b><span>Neon / Street / Classic</span><span>—</span><span>press 5</span></div>
        <div class="big-hint">E — leave safehouse</div>`);
    },
    showBriefing(mission) {
      const giver = CHARACTERS[mission.giver];
      H.showScreen('briefing', `
        <div class="briefing-wrap">
          <img class="briefing-portrait" src="${portraitURL(mission.giver)}">
          <div>
            <div class="big-title gold">${mission.name}</div>
            <div class="big-sub">${giver.name} — ${giver.role}</div>
            <p class="briefing-text">${mission.blurb}</p>
            <div class="big-pay">REWARD $${mission.pay.toLocaleString('en-US')}</div>
            <div class="big-hint">E — accept mission · ESC — decline</div>
          </div>
        </div>`);
    },
    cutscene(on) { $('cutscene-bars').classList.toggle('show', !!on); },

    // --- minimap -------------------------------------------------------------
    drawMinimap(world, player, police, missionTarget, stashPts) {
      const cv = $('minimap'), x = cv.getContext('2d');
      const S = 220, range = 260;
      x.clearRect(0, 0, S, S);
      x.fillStyle = 'rgba(10,14,20,0.82)'; x.fillRect(0, 0, S, S);
      const toMap = (wx, wz) => [S / 2 + (wx - player.x) * (S / range), S / 2 + (wz - player.z) * (S / range)];
      // water
      x.fillStyle = '#1d5f7a';
      const [wx0] = toMap(330, 0);
      if (wx0 < S) x.fillRect(Math.max(0, wx0), 0, S - Math.max(0, wx0), S);
      // roads (lanes run between buildings at half-block offsets)
      x.strokeStyle = 'rgba(200,200,200,0.5)'; x.lineWidth = 2;
      for (let i = -10; i <= 10; i++) {
        const [ax] = toMap(i * 46 + 23, 0); const [, bz] = toMap(0, i * 46 + 23);
        x.beginPath(); x.moveTo(ax, 0); x.lineTo(ax, S); x.stroke();
        x.beginPath(); x.moveTo(0, bz); x.lineTo(S, bz); x.stroke();
      }
      // park + island
      x.fillStyle = '#3f7a34';
      const [px, pz] = toMap(-120, 70); x.fillRect(px - 18, pz - 18, 36, 36);
      x.fillStyle = '#55703f';
      const [ix, iz] = toMap(560, -60); x.beginPath(); x.arc(ix, iz, 16, 0, 7); x.fill();
      // buildings
      x.fillStyle = 'rgba(120,130,150,0.55)';
      for (const c of world.colliders) {
        const [x0, z0] = toMap(c.x0, c.z0); const [x1, z1] = toMap(c.x1, c.z1);
        if (x1 < 0 || z1 < 0 || x0 > S || z0 > S) continue;
        x.fillRect(x0, z0, Math.max(2, x1 - x0), Math.max(2, z1 - z0));
      }
      // stashes
      x.fillStyle = '#7dff6b';
      for (const s of stashPts) { const [sx, sz] = toMap(s.x, s.z); x.fillRect(sx - 2, sz - 2, 4, 4); }
      // safehouse
      x.fillStyle = '#ffffff';
      const [hx, hz] = toMap(-32, 180); x.font = 'bold 12px Arial'; x.fillText('⌂', hx - 5, hz + 4);
      // mission target
      if (missionTarget) {
        const [mx, mz] = toMap(missionTarget.x, missionTarget.z);
        x.fillStyle = '#ffd166';
        x.beginPath(); x.arc(mx, mz, 6, 0, 7); x.fill();
        x.fillStyle = '#000'; x.font = 'bold 9px Arial'; x.fillText('!', mx - 1.5, mz + 3);
      }
      // police
      const blink = Math.floor(performance.now() / 300) % 2 === 0;
      for (const u of police.units) {
        if (u.v.dead) continue;
        const [ux, uz] = toMap(u.v.x, u.v.z);
        x.fillStyle = blink ? '#ff4444' : '#4488ff';
        x.beginPath(); x.moveTo(ux, uz - 5); x.lineTo(ux + 4, uz + 4); x.lineTo(ux - 4, uz + 4); x.closePath(); x.fill();
      }
      // player arrow
      x.save();
      x.translate(S / 2, S / 2); x.rotate(-player.heading);
      x.fillStyle = '#ffffff';
      x.beginPath(); x.moveTo(0, -8); x.lineTo(6, 7); x.lineTo(-6, 7); x.closePath(); x.fill();
      x.restore();
      // border
      x.strokeStyle = '#ffd166'; x.lineWidth = 3;
      x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 2, 0, 7); x.stroke();
    },

    drawBigMap() {
      const cv = $('map-canvas');
      if (!cv) return;
      const x = cv.getContext('2d');
      const S = 460;
      x.fillStyle = '#0d1420'; x.fillRect(0, 0, S, S);
      const toMap = (wx, wz) => [((wx + 460) / 920) * S, ((wz + 460) / 920) * S];
      x.fillStyle = '#1d5f7a';
      const [wx0] = toMap(330, 0); x.fillRect(wx0, 0, S - wx0, S);
      x.strokeStyle = 'rgba(200,200,200,0.45)'; x.lineWidth = 1.5;
      for (let i = -10; i <= 10; i++) {
        const [ax] = toMap(i * 46 + 23, 0); const [, bz] = toMap(0, i * 46 + 23);
        x.beginPath(); x.moveTo(ax, 0); x.lineTo(ax, S); x.stroke();
        x.beginPath(); x.moveTo(0, bz); x.lineTo(S, bz); x.stroke();
      }
      x.fillStyle = '#3f7a34';
      const [px, pz] = toMap(-120, 70); x.fillRect(px - 40, pz - 40, 80, 80);
      x.fillStyle = '#55703f';
      const [ix, iz] = toMap(560, -60); x.beginPath(); x.arc(ix, iz, 34, 0, 7); x.fill();
      x.fillStyle = 'rgba(120,130,150,0.5)';
      for (const c of game.world.colliders) {
        const [x0, z0] = toMap(c.x0, c.z0); const [x1, z1] = toMap(c.x1, c.z1);
        x.fillRect(x0, z0, Math.max(1.5, x1 - x0), Math.max(1.5, z1 - z0));
      }
      x.font = 'bold 13px Arial';
      const put = (wx, wz, sym, col) => { const [a, b] = toMap(wx, wz); x.fillStyle = col; x.fillText(sym, a - 6, b + 5); };
      put(-32, 180, '⌂', '#ffffff');
      for (const st of game.stashList || []) { if (!game.M.stashFound.has(st.x + ',' + st.z)) put(st.x, st.z, '★', '#7dff6b'); }
      if (game.missionTarget) put(game.missionTarget.x, game.missionTarget.z, '●', '#ffd166');
      for (const u of game.police.units) if (!u.v.dead) put(u.v.x, u.v.z, '▲', '#ff4444');
      put(game.player.x, game.player.z, '◆', '#ffffff');
      x.strokeStyle = '#ffd166'; x.lineWidth = 2; x.strokeRect(1, 1, S - 2, S - 2);
    },

    // --- per-frame HUD sync ----------------------------------------------------
    update(state) {
      $('cash').textContent = fmtMoney(state.cash);
      $('clock').textContent = fmtClock(state.hour);
      $('weather').textContent = WEATHER_NAMES[state.weather] + (state.rain > 0.5 ? ' ☔' : '');
      const r = RADIO[state.radio];
      $('radio-name').textContent = r.name;
      $('radio-name').style.color = r.color;
      $('radio-desc').textContent = r.desc;
      // stars
      let stars = '';
      for (let i = 0; i < 5; i++) stars += `<span class="star ${i < state.stars ? 'on' : ''}">★</span>`;
      $('stars').innerHTML = stars;
      // weapon
      $('weapon-name').textContent = state.weapon;
      $('weapon-ammo').textContent = state.weapon === 'FISTS' ? '—' : `${state.ammo} / ${state.reserve}`;
      // bars
      $('hp-fill').style.width = state.hp + '%';
      $('armor-fill').style.width = state.armor + '%';
      $('hp-fill').style.background = state.hp < 30 ? '#ff3333' : '#4dff6b';
      // speedo
      const v = state.vehicle;
      $('speed').textContent = v ? Math.round(Math.abs(v.speed) * 2.237) : '0';
      $('veh-cond').style.display = v ? 'flex' : 'none';
      if (v) {
        const pct = Math.max(0, (v.hp / v.maxHp) * 100);
        $('veh-cond-fill').style.width = pct + '%';
        $('veh-cond-fill').style.background = pct < 30 ? '#ff3333' : pct < 60 ? '#ffb347' : '#4dff6b';
        $('veh-cond-label').textContent = `${v.def.name.toUpperCase()} · ${Math.round(pct)}%`;
      }
      // counters
      $('counter-stash').textContent = `◆ ${state.stashes}/8 stashes`;
      $('counter-mission').textContent = `★ ${state.missionsDone}/12 missions`;
      $('counter-skill').textContent = `SKILL ${state.skill}`;
      // police list
      const pl = $('police-list');
      const units = state.policeUnits;
      if (units.length || state.heli) {
        let html = '<div class="police-head">CBPD PURSUIT</div>';
        for (const u of units) html += `<div class="police-row"><span>${u.name}</span><span>${u.dist}m</span><span class="st-${u.status.replace(/ /g, '')}">${u.status}</span></div>`;
        if (state.heli) html += `<div class="police-row"><span>${state.heli.name}</span><span>${state.heli.dist}m</span><span class="st-SEARCHLIGHT">${state.heli.status}</span></div>`;
        pl.innerHTML = html;
        pl.style.display = 'block';
      } else pl.style.display = 'none';
      // interact prompt — hidden while a dialog is open (the dialog's own
      // "E — continue" is the prompt then; the two boxes overlap otherwise).
      const ip = $('interact-prompt');
      const dialogOpen = $('dialog').classList.contains('show');
      if (state.prompt && !dialogOpen) { ip.textContent = state.prompt; ip.style.display = 'block'; }
      else ip.style.display = 'none';
      // mission title
      $('mission-title').textContent = state.missionName || 'NEON BAY';
    },
  };
  return H;
}
