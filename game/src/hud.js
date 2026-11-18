// The HUD, laid out the GTA 6 way: round minimap bottom-left with the weapon
// above it, wanted stars top-right, cash bottom-right, the active mission
// top-left, clock and radio on screen, a named police-unit list, a dialog box
// with a portrait, a notification feed, and the full map / garage / gun-shop
// screens.
import { formatCash, formatClock, clamp } from './utils.js';
import { drawPortrait } from './portraits.js';

export function createHud() {
  const root = document.getElementById('hud');
  root.innerHTML = `
    <div id="hud-mission" class="hud-panel mission-panel hidden">
      <div id="hud-mission-title" class="mission-title"></div>
      <div id="hud-mission-text" class="mission-text"></div>
      <div id="hud-mission-dist" class="mission-dist"></div>
    </div>
    <div id="hud-counters" class="hud-panel counters"></div>
    <div id="hud-top-right" class="hud-panel">
      <div id="hud-wanted" class="stars"></div>
      <div id="hud-clock" class="clock">5:30 PM</div>
      <div id="hud-weather" class="weather"></div>
      <div id="hud-police" class="police-list hidden"></div>
    </div>
    <div id="hud-notifs" class="notifs"></div>
    <div id="hud-arrow" class="arrow hidden">▲</div>
    <div id="hud-bottom-left" class="hud-panel">
      <div id="hud-weapon" class="weapon"></div>
      <div class="bar-row"><span class="bar-label">HP</span><div class="bar"><div id="hud-health-fill"></div></div></div>
      <div class="bar-row"><span class="bar-label">ARMOR</span><div class="bar"><div id="hud-armor-fill"></div></div></div>
      <canvas id="minimap" width="190" height="190"></canvas>
    </div>
    <div id="hud-bottom-right" class="hud-panel">
      <div id="hud-radio" class="radio"></div>
      <div id="hud-speed" class="speed hidden"><span id="hud-speed-num">0</span><span class="speed-unit"> km/h</span>
        <div class="bar cond"><div id="hud-cond-fill"></div></div>
        <div id="hud-cond-label" class="cond-label"></div>
      </div>
      <div id="hud-cash" class="cash">$0</div>
      <div id="hud-jobs" class="jobs">Jobs done: 0/12</div>
    </div>
    <div id="hud-dialog" class="dialog hidden">
      <canvas id="hud-portrait" width="72" height="72"></canvas>
      <div class="dialog-body"><div id="hud-dialog-name" class="dialog-name"></div><div id="hud-dialog-text" class="dialog-text"></div></div>
    </div>
    <div id="hud-toast" class="toast hidden"></div>
    <div id="hud-crosshair" class="crosshair hidden">+</div>
    <div id="hud-hint" class="hint">WASD move · E enter car · F punch · J / click shoot · R reload · Tab map · M jobs · P pause</div>
    <div id="screen-title" class="screen">
      <div class="title-block">
        <div class="title-kicker">CORAL BAY · A NEON CRIME STORY</div>
        <h1 class="title-main">NEON<br>BAY</h1>
        <p class="title-sub">Sun, salt air, and twelve jobs for Vera Solano.<br>Steal cars. Outrun the CBPD. Get paid.</p>
        <button id="btn-play" class="btn big">▶ &nbsp;START ENGINE</button>
        <div id="save-slots" class="save-slots"></div>
        <div class="title-controls">WASD move · Shift run · E enter / exit car · F punch · J or click shoot · R reload<br>Space handbrake · G garage · Tab map · M jobs · C radio · P pause · N mute</div>
      </div>
    </div>
    <div id="screen-briefing" class="screen hidden">
      <div class="modal">
        <div class="modal-kicker">JOB FROM VERA SOLANO</div>
        <div class="briefing-head">
          <canvas id="briefing-portrait" width="84" height="84"></canvas>
          <h2 id="briefing-title" class="modal-title"></h2>
        </div>
        <p id="briefing-text" class="modal-text"></p>
        <div id="briefing-payout" class="modal-payout"></div>
        <button id="btn-accept" class="btn big">ACCEPT JOB</button>
        <button id="btn-decline" class="btn ghost">NOT NOW</button>
      </div>
    </div>
    <div id="screen-pause" class="screen hidden">
      <div class="modal wide">
        <div class="modal-kicker">PAUSED</div>
        <h2 class="modal-title">Take a breath</h2>
        <div id="pause-stats" class="stats-grid"></div>
        <button id="btn-resume" class="btn big">RESUME</button>
        <button id="btn-restart" class="btn">RESTART DAY</button>
        <button id="btn-quit-title" class="btn ghost">QUIT TO TITLE</button>
      </div>
    </div>
    <div id="screen-busted" class="screen hidden">
      <div class="modal bad">
        <div class="modal-kicker">CBPD</div>
        <h2 class="modal-title">BUSTED</h2>
        <p id="busted-text" class="modal-text"></p>
        <button id="btn-busted-ok" class="btn big">PAY AND WALK</button>
      </div>
    </div>
    <div id="screen-wasted" class="screen hidden">
      <div class="modal bad">
        <div class="modal-kicker">ST. MARINA HOSPITAL</div>
        <h2 class="modal-title">WASTED</h2>
        <p id="wasted-text" class="modal-text"></p>
        <button id="btn-wasted-ok" class="btn big">LEAVE HOSPITAL</button>
      </div>
    </div>
    <div id="screen-complete" class="screen hidden">
      <div class="modal good">
        <div class="modal-banner">★ MISSION PASSED ★</div>
        <h2 id="complete-title" class="modal-title"></h2>
        <p id="complete-text" class="modal-text"></p>
        <div id="complete-unlock" class="modal-unlock"></div>
        <button id="btn-complete-ok" class="btn big">COLLECT</button>
      </div>
    </div>
    <div id="screen-jobs" class="screen hidden">
      <div class="modal wide">
        <div class="modal-kicker">VERA SOLANO — JOBS</div>
        <h2 class="modal-title">The list</h2>
        <div id="jobs-list" class="jobs-list"></div>
        <div class="modal-kicker">SIDE JOBS — REPEATABLE</div>
        <div id="side-list" class="jobs-list"></div>
        <button id="btn-jobs-close" class="btn big">CLOSE</button>
      </div>
    </div>
    <div id="screen-map" class="screen hidden">
      <div class="modal map-modal">
        <div class="modal-kicker">CORAL BAY — MAP</div>
        <div class="map-wrap">
          <canvas id="bigmap" width="640" height="500"></canvas>
          <div class="map-side">
            <div id="map-complete" class="map-complete"></div>
            <div id="map-story" class="map-story"></div>
            <div id="map-stats" class="map-stats"></div>
            <div class="map-legend">
              <div><span class="blip yellow">●</span> Mission target</div>
              <div><span class="blip blue">●</span> CBPD unit</div>
              <div><span class="blip green">●</span> Cash stash</div>
              <div><span class="blip pink">●</span> Property</div>
              <div><span class="blip white">▲</span> You</div>
            </div>
          </div>
        </div>
        <button id="btn-map-close" class="btn big">CLOSE MAP</button>
      </div>
    </div>
    <div id="screen-garage" class="screen hidden">
      <div class="modal wide">
        <div class="modal-kicker">MAKO GARAGE</div>
        <h2 class="modal-title">Tune it up</h2>
        <div id="garage-list" class="shop-list"></div>
        <div id="garage-respray" class="respray-row"></div>
        <button id="btn-garage-close" class="btn big">BACK TO THE STREET</button>
      </div>
    </div>
    <div id="screen-gunshop" class="screen hidden">
      <div class="modal wide">
        <div class="modal-kicker">LOCK &amp; LOAD — GUN SHOP</div>
        <h2 class="modal-title">Tool up</h2>
        <div id="gunshop-list" class="shop-list"></div>
        <button id="btn-gunshop-close" class="btn big">BACK TO THE STREET</button>
      </div>
    </div>
  `;
  return {
    root,
    wanted: document.getElementById('hud-wanted'),
    clock: document.getElementById('hud-clock'),
    weather: document.getElementById('hud-weather'),
    police: document.getElementById('hud-police'),
    cash: document.getElementById('hud-cash'),
    jobs: document.getElementById('hud-jobs'),
    mission: document.getElementById('hud-mission'),
    missionTitle: document.getElementById('hud-mission-title'),
    missionText: document.getElementById('hud-mission-text'),
    missionDist: document.getElementById('hud-mission-dist'),
    counters: document.getElementById('hud-counters'),
    weapon: document.getElementById('hud-weapon'),
    minimap: document.getElementById('minimap'),
    healthFill: document.getElementById('hud-health-fill'),
    armorFill: document.getElementById('hud-armor-fill'),
    radio: document.getElementById('hud-radio'),
    speed: document.getElementById('hud-speed'),
    speedNum: document.getElementById('hud-speed-num'),
    condFill: document.getElementById('hud-cond-fill'),
    condLabel: document.getElementById('hud-cond-label'),
    notifs: document.getElementById('hud-notifs'),
    dialog: document.getElementById('hud-dialog'),
    dialogPortrait: document.getElementById('hud-portrait'),
    dialogName: document.getElementById('hud-dialog-name'),
    dialogText: document.getElementById('hud-dialog-text'),
    arrow: document.getElementById('hud-arrow'),
    toast: document.getElementById('hud-toast'),
    crosshair: document.getElementById('hud-crosshair'),
    hint: document.getElementById('hud-hint'),
    screens: {
      title: document.getElementById('screen-title'),
      briefing: document.getElementById('screen-briefing'),
      pause: document.getElementById('screen-pause'),
      busted: document.getElementById('screen-busted'),
      wasted: document.getElementById('screen-wasted'),
      complete: document.getElementById('screen-complete'),
      jobs: document.getElementById('screen-jobs'),
      map: document.getElementById('screen-map'),
      garage: document.getElementById('screen-garage'),
      gunshop: document.getElementById('screen-gunshop'),
    },
  };
}

let toastTimer = null;
export function showToast(hud, text, ms = 4200) {
  hud.toast.textContent = text;
  hud.toast.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => hud.toast.classList.add('hidden'), ms);
}

export function addNotification(hud, text, kind = '') {
  const el = document.createElement('div');
  el.className = 'notif ' + kind;
  el.textContent = text;
  hud.notifs.prepend(el);
  while (hud.notifs.children.length > 4) hud.notifs.removeChild(hud.notifs.lastChild);
  setTimeout(() => { el.classList.add('fade'); }, 4600);
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 5400);
}

let dialogTimer = null;
export function showDialog(hud, who, name, text, ms = 5200) {
  drawPortrait(hud.dialogPortrait, who);
  hud.dialogName.textContent = name;
  hud.dialogText.textContent = text;
  hud.dialog.classList.remove('hidden');
  if (dialogTimer) clearTimeout(dialogTimer);
  dialogTimer = setTimeout(() => hud.dialog.classList.add('hidden'), ms);
}

export function hideDialog(hud) {
  hud.dialog.classList.add('hidden');
  if (dialogTimer) clearTimeout(dialogTimer);
}

export function showScreen(hud, name) {
  for (const key of Object.keys(hud.screens)) {
    hud.screens[key].classList.toggle('hidden', key !== name);
  }
  hud.root.classList.toggle('in-game', name === null);
}

export function hideAllScreens(hud) {
  showScreen(hud, null);
}

export function updateHud(hud, snap) {
  let stars = '';
  for (let i = 0; i < 5; i += 1) stars += i < snap.wanted ? '★' : '☆';
  hud.wanted.textContent = stars;
  hud.wanted.classList.toggle('hot', snap.wanted >= 3);
  hud.clock.textContent = formatClock(snap.timeOfDay);
  hud.weather.textContent = snap.weather === 'rain' ? '☂ Rain' : (snap.golden ? '☀ Golden hour' : snap.night ? '☾ Night' : '☀ Clear');
  hud.cash.textContent = formatCash(snap.cash);
  hud.jobs.textContent = 'Jobs done: ' + snap.jobsDone + '/' + snap.jobsTotal;
  hud.healthFill.style.width = clamp(snap.health, 0, 100) + '%';
  hud.healthFill.style.background = snap.health > 50 ? '#37d67a' : snap.health > 25 ? '#ffb02e' : '#ff3b30';
  hud.armorFill.style.width = clamp(snap.armor, 0, 100) + '%';
  hud.armorFill.style.background = '#4d9fff';
  hud.weapon.textContent = snap.armed ? ('🔫 ' + snap.weaponName + '  ' + snap.ammo + ' / ' + snap.reserveAmmo) : '👊 Fists';
  hud.radio.textContent = '♪ ' + snap.radio;
  hud.crosshair.classList.toggle('hidden', !snap.armed);
  if (snap.inCar) {
    hud.speed.classList.remove('hidden');
    hud.speedNum.textContent = String(Math.round(snap.speedKmh));
    hud.speed.classList.toggle('fast', snap.speedKmh > 90);
    hud.condFill.style.width = clamp(snap.carHealth, 0, 100) + '%';
    hud.condFill.style.background = snap.carHealth > 50 ? '#37d67a' : snap.carHealth > 25 ? '#ffb02e' : '#ff3b30';
    hud.condLabel.textContent = snap.carName + ' · ' + Math.round(snap.carHealth) + '%';
  } else {
    hud.speed.classList.add('hidden');
  }
  if (snap.objective) {
    hud.mission.classList.remove('hidden');
    hud.missionTitle.textContent = snap.objective.title;
    hud.missionText.textContent = snap.objective.text;
    hud.missionDist.textContent = snap.objective.distance != null
      ? Math.round(snap.objective.distance) + ' m' : '';
  } else {
    hud.mission.classList.add('hidden');
  }
  hud.counters.textContent = '◆ Stashes ' + snap.stashes + '/' + snap.stashTotal
    + '   ·   Driving Lv ' + snap.skills.driving
    + '   ·   Shooting Lv ' + snap.skills.shooting
    + '   ·   Stamina Lv ' + snap.skills.stamina;
  // Police unit list: named units with distance and status.
  if (snap.policeUnits && snap.policeUnits.length > 0) {
    hud.police.classList.remove('hidden');
    hud.police.innerHTML = snap.policeUnits.slice(0, 6).map((u) =>
      `<div class="unit-row"><span class="unit-name">${u.name}</span><span class="unit-status ${u.statusClass}">${u.status}</span><span class="unit-dist">${u.dist} m</span></div>`).join('');
  } else {
    hud.police.classList.add('hidden');
  }
  if (snap.arrowAngle != null) {
    hud.arrow.classList.remove('hidden');
    hud.arrow.style.transform = `translate(-50%,-50%) rotate(${snap.arrowAngle}rad)`;
  } else {
    hud.arrow.classList.add('hidden');
  }
  hud.hint.classList.toggle('hidden', snap.mode !== 'play');
}

/** Draw the live minimap: roads, beach, water, island, blips. */
export function drawMinimap(hud, snap) {
  const canvas = hud.minimap;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const scale = W / 620;
  const toX = (x) => (x + 290) * scale;
  const toY = (z) => (z + 290) * scale;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0e6f8e';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#d9b380';
  ctx.fillRect(toX(285), 0, W - toX(285), H);
  ctx.fillStyle = '#3a3f45';
  ctx.fillRect(0, 0, toX(285), H);
  ctx.fillStyle = '#3f7a44';
  ctx.beginPath();
  ctx.arc(toX(415), toY(-60), 62 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#c9c9c9';
  ctx.lineWidth = 3;
  for (const x of snap.avenues) {
    ctx.beginPath(); ctx.moveTo(toX(x), toY(-275)); ctx.lineTo(toX(x), toY(215)); ctx.stroke();
  }
  for (const z of snap.streets) {
    ctx.beginPath(); ctx.moveTo(toX(-275), toY(z)); ctx.lineTo(toX(285), toY(z)); ctx.stroke();
  }
  ctx.strokeStyle = '#ffc46b';
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(toX(300), toY(-60)); ctx.lineTo(toX(360), toY(-60)); ctx.stroke();
  if (snap.target) {
    const tx = toX(snap.target.x);
    const ty = toY(snap.target.z);
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath(); ctx.arc(tx, ty, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(tx, ty, 9, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = '#7CFC00';
  for (const s of snap.stashes || []) {
    ctx.fillRect(toX(s.x) - 2.5, toY(s.z) - 2.5, 5, 5);
  }
  ctx.fillStyle = '#4d9fff';
  for (const c of snap.cops) {
    ctx.beginPath(); ctx.arc(toX(c.x), toY(c.z), 3.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const c of snap.traffic) {
    ctx.fillRect(toX(c.x) - 1.5, toY(c.z) - 1.5, 3, 3);
  }
  const px = toX(snap.playerX);
  const py = toY(snap.playerZ);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(snap.playerHeading);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -8); ctx.lineTo(5.5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5.5, 6); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px Arial';
  ctx.fillText('N', W / 2 - 4, 13);
}

/** The full map screen: the whole city, big, with every marker and label. */
export function drawBigMap(hud, snap) {
  const canvas = document.getElementById('bigmap');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const scale = W / 640;
  const toX = (x) => (x + 300) * scale;
  const toY = (z) => (z + 300) * scale * (H / W) * 1.0;
  ctx.fillStyle = '#0e6f8e';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#d9b380';
  ctx.fillRect(toX(285), 0, W - toX(285), H);
  ctx.fillStyle = '#33383f';
  ctx.fillRect(0, 0, toX(285), H);
  // City blocks.
  ctx.fillStyle = '#454b54';
  for (let ai = 0; ai < snap.avenues.length - 1; ai += 1) {
    for (let si = 0; si < snap.streets.length - 1; si += 1) {
      const x0 = toX(snap.avenues[ai] + 6);
      const z0 = toY(snap.streets[si] + 6);
      const w = (snap.avenues[ai + 1] - snap.avenues[ai] - 12) * scale;
      const h = (snap.streets[si + 1] - snap.streets[si] - 12) * scale;
      ctx.fillRect(x0, z0, w, h);
    }
  }
  ctx.fillStyle = '#3f7a44';
  ctx.beginPath();
  ctx.arc(toX(415), toY(-60), 62 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e8e8e8';
  ctx.lineWidth = 4;
  for (const x of snap.avenues) {
    ctx.beginPath(); ctx.moveTo(toX(x), toY(-275)); ctx.lineTo(toX(x), toY(215)); ctx.stroke();
  }
  for (const z of snap.streets) {
    ctx.beginPath(); ctx.moveTo(toX(-275), toY(z)); ctx.lineTo(toX(285), toY(z)); ctx.stroke();
  }
  ctx.strokeStyle = '#ffc46b';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(toX(300), toY(-60)); ctx.lineTo(toX(360), toY(-60)); ctx.stroke();
  // Place labels.
  ctx.font = 'bold 13px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  for (const p of snap.places || []) {
    ctx.fillText(p.label, toX(p.x), toY(p.z) - 8);
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9fd8ff';
  ctx.font = 'bold 14px Arial';
  ctx.fillText('CORAL BAY', toX(-260), toY(-262));
  ctx.fillStyle = '#ffd27a';
  ctx.fillText('THE BAY', toX(330), toY(120));
  ctx.fillText('CORAL CAY', toX(375), toY(-100));
  // Stashes.
  ctx.fillStyle = '#7CFC00';
  for (const s of snap.stashes || []) {
    ctx.beginPath(); ctx.arc(toX(s.x), toY(s.z), 5, 0, Math.PI * 2); ctx.fill();
  }
  // Properties.
  ctx.fillStyle = '#ff2e88';
  for (const p of snap.properties || []) {
    ctx.beginPath(); ctx.arc(toX(p.x), toY(p.z), 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(toX(p.x), toY(p.z), 9, 0, Math.PI * 2); ctx.stroke();
  }
  // Mission target.
  if (snap.target) {
    const tx = toX(snap.target.x);
    const ty = toY(snap.target.z);
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath(); ctx.arc(tx, ty, 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(tx, ty, 12, 0, Math.PI * 2); ctx.stroke();
  }
  // Police.
  ctx.fillStyle = '#4d9fff';
  for (const c of snap.cops) {
    ctx.beginPath(); ctx.arc(toX(c.x), toY(c.z), 5, 0, Math.PI * 2); ctx.fill();
  }
  // Player.
  const px = toX(snap.playerX);
  const py = toY(snap.playerZ);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(snap.playerHeading);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -11); ctx.lineTo(8, 8); ctx.lineTo(0, 4); ctx.lineTo(-8, 8); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
}
