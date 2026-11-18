// NEON BAY — game.js
// Main loop, player controller (on foot + driving), chase camera, dynamic
// day/night + rain/storm/lightning, saves, interactions, cutscenes and the
// debug API the playtest harness and shot staging use.
//
// Bug lessons baked in:
//  - shoot/punch cooldowns tick in step() in EVERY mode (foot AND driving).
//  - E (interact) prioritises NPCs/shops over the car; briefing is gated on
//    NO active mission; a 350 ms debounce stops a duplicated keypress from
//    re-opening a dialog mid-action.
//  - navigation always uses the CAR's position when driving (never a stale
//    on-foot position) and re-routes via grid waypoints from the new position.
//  - teleport() defaults heading to the current heading, never undefined.

import { WORLD, TIME, PLAYER, VEHICLES, MISSIONS, RADIO, CHARACTERS, STASHES, PROPERTIES, WEATHER_NAMES } from './config.js';
import { buildWorld } from './world.js';
import { createVehicle, stepVehicle, spawnTraffic, stepTraffic, repaintVehicle } from './vehicles.js';
import { createPolice, stepPolice, addHeat, starsForHeat } from './police.js';
import { createMissions, startMission, stepMissions, stepJob, startJob, checkStashes, checkNearMiss, nextMissionId, failMission } from './missions.js';
import { createCombat, firePistol, punch, explode, stepCombat } from './combat.js';
import { createHUD } from './hud.js';
import { createAudio } from './audio.js';
import { clamp, lerp, damp, dist2d, angDiff, mulberry32, gridRoute, fmtClock, landMaxX } from './util.js';

const SAVE_KEY = 'neonbay-save-';

export function createGame() {
  const G = {
    scene: null, renderer: null, camera: null, clock: null,
    world: null, hud: null, audio: null, police: null, M: null, combat: null,
    player: null, traffic: [], npcs: [], markers: [],
    state: null, mode: 'title', paused: false,
    time: 0, shake: 0, rain: 0, lightning: 0, lightningT: 0,
    weatherTimer: 90, autoWeather: true,
    race: null, rival: null, missionVehicle: null,
    missionTarget: null, stashList: STASHES,
    sunLight: null, ambLight: null, hemiLight: null,
    rainPts: null, camDist: 9, camYaw: 0,
    keys: {}, mouseDown: false, mouseX: 0, mouseY: 0,
    interactT: 0, stepCount: 0, fps: 0, fpsT: 0, fpsN: 0,
    staged: null, // shot staging state
  };

  G.state = freshState();

  function freshState() {
    return {
      cash: 500, hp: 100, armor: 0, ammo: 12, reserve: 60,
      weapon: 'FISTS', radio: 0, hour: TIME.startHour, weather: 0,
      skill: 0, upgrades: { engine: 0, armor: 0, brakes: 0, respray: 0 },
      paint: 0xc22430,
      stats: { missionsDone: 0, jobsDone: 0, stashes: 0, playTime: 0, carsStolen: 0, nearMisses: 0 },
      saveSlot: null, outfit: 0,
    };
  }

  // ---------------- player mesh ----------------
  function buildPlayerMesh() {
    const g = new THREE.Group();
    const skin = new THREE.MeshLambertMaterial({ color: 0xc98d64 });
    const shirt = new THREE.MeshLambertMaterial({ color: 0x27324a });
    const pants = new THREE.MeshLambertMaterial({ color: 0x1d1d22 });
    const jacket = new THREE.MeshLambertMaterial({ color: 0x8a2a3a });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.05, 0.45), jacket);
    body.position.y = 1.25; body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), skin);
    head.position.y = 2.05; head.castShadow = true; g.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.31, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshLambertMaterial({ color: 0x14100c }));
    hair.position.y = 2.12; g.add(hair);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.85, 0.34), pants);
    legL.position.set(-0.22, 0.42, 0); g.add(legL);
    const legR = legL.clone(); legR.position.x = 0.22; g.add(legR);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.85, 0.28), shirt);
    armL.position.set(-0.58, 1.25, 0); g.add(armL);
    const armR = armL.clone(); armR.position.x = 0.58; g.add(armR);
    // Pistol in the right hand when armed.
    const gun = new THREE.Group();
    const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.42), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    gun.add(gunBody);
    gun.position.set(0.58, 0.85, 0.25); gun.visible = false;
    g.add(gun);
    g.userData = { legL, legR, armL, armR, gun, head };
    return g;
  }

  function buildNPC(color, x, z, heading) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.05, 0.45), new THREE.MeshLambertMaterial({ color }));
    body.position.y = 1.25; body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), new THREE.MeshLambertMaterial({ color: 0xc98d64 }));
    head.position.y = 2.05; g.add(head);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.85, 0.34), new THREE.MeshLambertMaterial({ color: 0x1d1d22 }));
    legL.position.set(-0.22, 0.42, 0); g.add(legL);
    const legR = legL.clone(); legR.position.x = 0.22; g.add(legR);
    g.position.set(x, 0, z); g.rotation.y = heading;
    G.scene.add(g);
    return g;
  }

  // ---------------- init ----------------
  G.init = function (renderer, camera) {
    G.renderer = renderer; G.camera = camera;
    G.scene = new THREE.Scene();
    G.scene.background = new THREE.Color(0xff9a52);
    G.scene.fog = new THREE.Fog(0xff9a52, 120, 700);
    G.renderer.shadowMap.enabled = true;
    G.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    G.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    G.renderer.toneMappingExposure = 1.05;

    G.world = buildWorld(G.scene, 1337);
    G.hud = createHUD(G);
    G.audio = createAudio();
    G.police = createPolice(G.scene);
    G.M = createMissions();
    G.combat = createCombat(G.scene);

    // Lights.
    G.sunLight = new THREE.DirectionalLight(0xffd9a0, 2.2);
    G.sunLight.position.set(120, 180, 60);
    G.sunLight.castShadow = true;
    G.sunLight.shadow.mapSize.set(1024, 1024);
    G.sunLight.shadow.camera.left = -160; G.sunLight.shadow.camera.right = 160;
    G.sunLight.shadow.camera.top = 160; G.sunLight.shadow.camera.bottom = -160;
    G.sunLight.shadow.camera.far = 700;
    G.scene.add(G.sunLight);
    G.ambLight = new THREE.AmbientLight(0x8090a8, 0.55);
    G.scene.add(G.ambLight);
    G.hemiLight = new THREE.HemisphereLight(0xbfd8ff, 0x3a2f26, 0.5);
    G.scene.add(G.hemiLight);

    // Player.
    const mesh = buildPlayerMesh();
    G.scene.add(mesh);
    G.player = {
      mesh, x: -30, z: 160, heading: Math.PI, speed: 0,
      hp: 100, armor: 0, ammo: 12, reserve: 60, weapon: 'FISTS',
      vehicle: null, inBoat: false, walkPhase: 0,
      shootCooldown: 0, lastShotHit: false, airborne: false, airT: 0,
      prompt: null, promptAction: null,
    };
    mesh.position.set(-30, 0, 160);

    // Vera (briefing NPC) at the safehouse, Marcus at the garage, Lena at the market.
    G.npcs.push({ key: 'vera', mesh: buildNPC(0xff2e88, -40, 168, Math.PI), x: -40, z: 168, role: 'briefing' });
    G.npcs.push({ key: 'marcus', mesh: buildNPC(0xffb347, -180, -66, 0), x: -180, z: -66, role: 'garage' });
    G.npcs.push({ key: 'lena', mesh: buildNPC(0x7fd4ff, 154, 130, Math.PI / 2), x: 154, z: 130, role: 'jobs' });

    // Starter car parked by the safehouse, on the z=161 lane facing east
    // so the first drive heads down a clear street, not into a building.
    const starter = createVehicle(G.scene, 'sedan', -24, 161, Math.PI * 0.5);
    starter.isPlayer = true;
    G.playerCar = starter;
    G.vehicles = [starter];

    // Traffic.
    const rng = mulberry32(4242);
    G.traffic = spawnTraffic(G.scene, rng, 14, G.world);
    G.vehicles.push(...G.traffic);

    // Street-cash pickups scattered around.
    for (let i = 0; i < 10; i++) {
      const a = rng() * Math.PI * 2, r = 60 + rng() * 260;
      const x = clamp(Math.cos(a) * r, -420, 300), z = clamp(Math.sin(a) * r, -420, 420);
      if (G.world.blocked(x, z, 1)) continue;
      const m = G.spawnMarker(x, z, 0x4dff6b, 0.8);
      G.M.cashPickups.push({ x, z, mesh: m, amount: 25 + Math.floor(rng() * 4) * 25, taken: false });
    }

    // Rain particles (hidden until rain starts).
    const rainGeo = new THREE.BufferGeometry();
    const N = 1400, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 120;
      pos[i * 3 + 1] = Math.random() * 50;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 120;
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    G.rainPts = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0xaaccee, size: 0.35, transparent: true, opacity: 0 }));
    G.rainPts.visible = false;
    G.scene.add(G.rainPts);

    bindInput();
    G.hud.showTitle();
    G.hud.setObjective('Visit Vera Solano for the next job');
    G.updateSky(0);
    return G;
  };

  // ---------------- input ----------------
  function bindInput() {
    const down = (e) => {
      if (e.repeat) return;
      G.keys[e.code] = true;
      handleKey(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
    };
    const up = (e) => { G.keys[e.code] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) { G.mouseDown = true; G.audio.ensure(); tryShoot(); }
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) G.mouseDown = false; });
    window.addEventListener('blur', () => { G.keys = {}; G.mouseDown = false; });
    // First gesture starts audio + music.
    window.addEventListener('pointerdown', () => { G.audio.ensure(); G.audio.startMusic(); }, { once: true });
    window.addEventListener('keydown', () => { G.audio.ensure(); G.audio.startMusic(); }, { once: true });
  }

  function tryShoot() {
    if (G.mode !== 'play') return;
    const p = G.player;
    if (p.shootCooldown > 0) return;
    if (p.weapon === 'FISTS') { punch(G.combat, G); return; }
    // Aim: forward from the player (or the car, drive-by).
    const from = { x: p.x, y: p.vehicle ? 1.5 : 1.6, z: p.z };
    const dir = { x: Math.sin(p.heading), y: 0, z: Math.cos(p.heading) };
    firePistol(G.combat, G, from, dir);
  }

  function handleKey(code) {
    if (G.mode === 'title') {
      if (code === 'Enter' || code === 'KeyE' || code === 'Space') { G.mode = 'play'; G.hud.hideScreen(); G.hud.toast('Welcome to Coral Bay — find Vera at the safehouse'); }
      return;
    }
    // Modal screens: E / Escape dismisses or accepts. P also resumes
    // from pause — the pause screen promises "P / ESC — resume", and
    // without this P did nothing while paused.
    if (G.hud.screenKind) {
      if (code === 'KeyE' || code === 'Escape' || code === 'Enter' || (code === 'KeyP' && G.hud.screenKind === 'pause')) {
        const kind = G.hud.screenKind;
        if (kind === 'briefing' && code === 'KeyE') {
          const id = nextMissionId(G.M);
          G.hud.hideScreen();
          if (id) { startMission(G.M, id, G); }
          else { G.hud.toast('Story complete — free roam!'); }
          return;
        }
        if (kind === 'busted' || kind === 'wasted' || kind === 'complete') { respawn(); return; }
        if (kind === 'garage' || kind === 'gunshop' || kind === 'safehouse' || kind === 'jobs' || kind === 'pause' || kind === 'map') {
          G.hud.hideScreen();
          G.mode = 'play';
          return;
        }
        G.hud.hideScreen();
      }
      // Shop hotkeys.
      if (G.hud.screenKind === 'garage') buyUpgrade(code);
      if (G.hud.screenKind === 'gunshop') buyAmmo(code);
      if (G.hud.screenKind === 'safehouse') saveSlotKey(code);
      if (G.hud.screenKind === 'jobs') jobKey(code);
      return;
    }
    switch (code) {
      case 'KeyF': toggleVehicle(); break;
      case 'KeyE': interact(); break;
      case 'KeyR': reload(); break;
      case 'KeyQ': switchWeapon(); break;
      case 'KeyM': openMap(); break;
      case 'KeyP': case 'Escape': openPause(); break;
      case 'KeyJ': openJobs(); break;
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': setRadio(Number(code.slice(-1)) - 1); break;
      case 'KeyC': G.camDist = G.camDist === 9 ? 14 : 9; break;
      case 'KeyV': G.state.weather = (G.state.weather + 1) % 4; G.hud.toast('Weather: ' + WEATHER_NAMES[G.state.weather]); break;
    }
  }

  function setRadio(i) {
    if (i < 0 || i > 3) return;
    G.state.radio = i;
    G.audio.setRadio(i);
    G.hud.toast(RADIO[i].name + ' — ' + RADIO[i].desc);
  }
  function switchWeapon() {
    const p = G.player;
    p.weapon = p.weapon === 'FISTS' ? 'PISTOL' : 'FISTS';
    G.state.weapon = p.weapon;
    p.mesh.userData.gun.visible = p.weapon === 'PISTOL';
    G.audio.blip(p.weapon === 'PISTOL' ? 700 : 400, 0.07, 'square', 0.2);
  }
  function reload() {
    const p = G.player;
    if (p.weapon !== 'PISTOL' || p.ammo >= PLAYER.pistolMag || p.reserve <= 0) return;
    const need = PLAYER.pistolMag - p.ammo;
    const take = Math.min(need, p.reserve);
    p.ammo += take; p.reserve -= take;
    G.audio.blip(500, 0.06, 'square', 0.2);
    setTimeout(() => G.audio.blip(800, 0.06, 'square', 0.2), 120);
  }
  function buyUpgrade(code) {
    const ids = ['engine', 'armor', 'brakes', 'respray'];
    const map = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5, Digit7: 6, Digit8: 7 };
    const idx = map[code];
    if (idx === undefined) return;
    if (idx < 4) {
      const id = ids[idx];
      const lvl = G.state.upgrades[id] || 0;
      if (lvl >= 3) { G.hud.toast('Already maxed'); return; }
      const price = [1200, 1500, 900, 500][idx] * (lvl + 1);
      if (G.state.cash < price) { G.hud.toast('Not enough cash'); return; }
      G.state.cash -= price;
      G.state.upgrades[id] = lvl + 1;
      if (G.player.vehicle) G.player.vehicle.upgrades[id] = lvl + 1;
      G.audio.cash();
      G.hud.notify('UPGRADE', `${id.toUpperCase()} → LVL ${lvl + 1}`);
      G.hud.showGarage();
    } else {
      const colors = [0xc22430, 0xd8a03c, 0x2a9d8f, 0x7b2fbe];
      const price = 500;
      if (G.state.cash < price) { G.hud.toast('Not enough cash'); return; }
      G.state.cash -= price;
      G.state.paint = colors[idx - 4];
      if (G.player.vehicle) repaintVehicle(G.scene, G.player.vehicle, G.state.paint);
      G.hud.notify('RESPRAY', 'Fresh paint — looking sharp');
    }
  }
  function buyAmmo(code) {
    if (code === 'Digit1' && G.state.cash >= 120) { G.state.cash -= 120; G.player.reserve += 60; G.audio.cash(); G.hud.toast('Ammo +60'); }
    if (code === 'Digit2' && G.state.cash >= 300) { G.state.cash -= 300; G.player.armor = 100; G.audio.cash(); G.hud.toast('Body armor equipped'); }
    if (code === 'Digit3' && G.state.cash >= 80) { G.state.cash -= 80; G.player.hp = Math.min(100, G.player.hp + 50); G.audio.cash(); G.hud.toast('Healed +50 HP'); }
  }
  function saveSlotKey(code) {
    const map = { Digit1: 1, Digit2: 2, Digit3: 3 };
    if (map[code]) saveGame(map[code]);
    if (code === 'Digit4') { G.player.hp = 100; G.state.hour = 8; G.hud.toast('Slept — morning in Coral Bay'); }
    if (code === 'Digit5') { G.state.outfit = (G.state.outfit + 1) % 3; G.hud.toast('Outfit changed'); }
  }
  function jobKey(code) {
    const ids = ['taxi', 'courier', 'race', 'stunt'];
    const map = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 };
    if (map[code] !== undefined) {
      if (startJob(G.M, G, ids[map[code]])) G.hud.hideScreen();
      else G.hud.toast('Finish the current job first');
    }
  }

  function openMap() { if (G.mode !== 'play') return; G.mode = 'map'; G.hud.showMap(); }
  function openPause() { if (G.mode !== 'play') return; G.mode = 'pause'; G.hud.showPause(); }
  function openJobs() { if (G.mode !== 'play') return; G.hud.showJobs(); }

  // ---------------- vehicles ----------------
  function toggleVehicle() {
    const p = G.player;
    if (G.mode !== 'play') return;
    if (p.vehicle) {
      // Exit: step out to the side.
      const v = p.vehicle;
      v.isPlayer = false;
      const sx = v.x + Math.cos(v.heading) * 2.2, sz = v.z - Math.sin(v.heading) * 2.2;
      p.x = G.world.blocked(sx, sz, 0.5) ? v.x - Math.cos(v.heading) * 2.2 : sx;
      p.z = G.world.blocked(sx, sz, 0.5) ? v.z + Math.sin(v.heading) * 2.2 : sz;
      p.heading = v.heading;
      p.vehicle = null; p.inBoat = false;
      p.mesh.visible = true;
      p.mesh.position.set(p.x, 0, p.z);
      G.audio.door();
      return;
    }
    // Enter nearest car (own, mission or traffic).
    let best = null, bd = 1e9;
    for (const v of G.vehicles) {
      if (v.dead) continue;
      const d = dist2d(p.x, p.z, v.x, v.z);
      if (d < 4.5 && d < bd) { best = v; bd = d; }
    }
    if (!best) return;
    if (best.ai && best.ai.mode === 'cruise') {
      // Carjack a traffic car.
      best.ai = null;
      G.state.stats.carsStolen++;
      addHeat(G.police, 18, 'carjack');
      G.hud.notify('CARJACKED', 'The owner is calling the cops!');
      G.audio.door();
    }
    p.vehicle = best;
    best.isPlayer = true;
    p.inBoat = best.type === 'boat';
    p.mesh.visible = false;
    p.heading = best.heading;
    if (best.missionCar) G.hud.toast('Mission vehicle secured');
    G.audio.engineStart();
  }

  // ---------------- interaction ----------------
  function interact() {
    if (G.mode !== 'play') return;
    const now = performance.now();
    if (now - G.interactT < 350) return; // debounce duplicated keypresses
    G.interactT = now;
    const p = G.player;
    // Priority 1: NPCs (briefing / garage / jobs) — never the car.
    for (const n of G.npcs) {
      if (dist2d(p.x, p.z, n.x, n.z) < PLAYER.interactRadius) {
        if (n.role === 'briefing') {
          if (G.M.current) { G.hud.toast('Finish the current mission first'); return; }
          const id = nextMissionId(G.M);
          if (!id) { G.hud.showDialog('vera', 'That\'s the whole story, boss. Coral Bay is yours — go enjoy it.', 6); return; }
          const m = MISSIONS.find(x => x.id === id);
          G.hud.showBriefing(m);
          G.mode = 'briefing';
          return;
        }
        if (n.role === 'garage') { G.hud.showGarage(); G.mode = 'garage'; return; }
        if (n.role === 'jobs') { G.hud.showJobs(); G.mode = 'jobs'; return; }
      }
    }
    // Priority 2: fixed locations.
    if (dist2d(p.x, p.z, 356, 120) < 5) { G.hud.showSafehouse(); G.mode = 'safehouse'; return; } // marina loft door
    if (dist2d(p.x, p.z, -180, -66) < 5) { G.hud.showGarage(); G.mode = 'garage'; return; }
    if (dist2d(p.x, p.z, 120, -140) < 5) { G.hud.showGunshop(); G.mode = 'gunshop'; return; }
    if (dist2d(p.x, p.z, -32, 180) < 5) { G.hud.showSafehouse(); G.mode = 'safehouse'; return; }
    // Priority 3: entering a car is F's job — E only hints.
    let nearCar = false;
    for (const v of G.vehicles) if (!v.dead && dist2d(p.x, p.z, v.x, v.z) < 4.5) nearCar = true;
    if (nearCar) G.hud.toast('Press F to enter the vehicle');
  }

  function respawn() {
    const p = G.player;
    G.state.cash = Math.max(0, G.state.cash - 250);
    p.hp = 100; p.armor = 0;
    if (p.vehicle) { p.vehicle.isPlayer = false; p.vehicle = null; }
    p.x = -40; p.z = 168; p.heading = Math.PI;
    p.mesh.visible = true;
    p.mesh.position.set(p.x, 0, p.z);
    G.police.heat = 0; G.police.stars = 0;
    G.hud.hideScreen();
    G.mode = 'play';
    G.audio.engineStop();
    G.hud.toast('Back on your feet — stay out of trouble');
  }

  // ---------------- helpers used by missions / combat ----------------
  G.addHeat = function (n) { addHeat(G.police, n); };
  G.damagePlayer = function (n) {
    const p = G.player;
    let dmg = n;
    if (p.armor > 0) { const absorbed = Math.min(p.armor, dmg * 0.6); p.armor -= absorbed; dmg -= absorbed; }
    p.hp -= dmg;
    G.shake = Math.max(G.shake, 0.35);
    if (p.hp <= 0) { p.hp = 0; G.mode = 'wasted'; G.hud.showWasted('You took too much damage.'); G.audio.fail(); }
  };
  G.spawnMarker = function (x, z, color = 0xffd166, scale = 1) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1.1 * scale, 1.1 * scale, 0.25, 16),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
    m.position.set(x, 0.15, z);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 26, 8, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.set(x, 13, z);
    G.scene.add(m); G.scene.add(beam);
    const marker = new THREE.Group(); marker.add(m); marker.add(beam);
    G.scene.add(marker);
    G.markers.push(marker);
    return marker;
  };
  G.spawnMissionVehicle = function (type, x, z) {
    if (G.missionVehicle) { G.scene.remove(G.missionVehicle.mesh.root); G.vehicles = G.vehicles.filter(v => v !== G.missionVehicle); }
    const v = createVehicle(G.scene, type, x, z, 0);
    v.missionCar = true;
    G.missionVehicle = v;
    G.vehicles.push(v);
    G.spawnMarker(x, z, 0xffd166, 1.4);
    return v;
  };
  G.spawnRival = function (x, z, type) {
    if (G.rival) {
      G.scene.remove(G.rival.mesh.root);
      G.vehicles = G.vehicles.filter(v => v !== G.rival);
    }
    const v = createVehicle(G.scene, type || 'sports', x + 6, z, Math.PI / 2, { color: 0x7b2fbe });
    v.ai = { mode: 'rival' };
    G.rival = v;
    G.vehicles.push(v);
    return v;
  };
  G.startStreetRace = function () {
    // Circuit on lane centrelines (23 + 46k) around the bay loop.
    const circuit = [
      { x: 23, z: 23 }, { x: 207, z: 23 }, { x: 207, z: 207 }, { x: 23, z: 207 },
      { x: -161, z: 207 }, { x: -161, z: 23 }, { x: -161, z: -161 }, { x: 23, z: -161 },
      { x: 207, z: -161 }, { x: 207, z: 23 },
    ];
    G.race = { waypoints: circuit, idx: 0, lap: 1, laps: 3, finished: false, won: false, rivalIdx: 0, rivalLap: 1, rivalFinished: false };
    G.spawnRival(23, 17);
  };

  // Mission 5 "Bridge Run": one lap down the bay bridge to the island
  // checkpoint. The rival starts on the bridge beside the player.
  G.startBridgeRace = function () {
    const waypoints = [
      { x: 300, z: -60 }, { x: 380, z: -60 }, { x: 460, z: -60 }, { x: 540, z: -60 },
    ];
    G.race = { waypoints, idx: 0, lap: 1, laps: 1, finished: false, won: false, rivalIdx: 0, rivalLap: 1, rivalFinished: false };
    // Kai drives a sedan (top 34, same as the player's starter car), so the
    // race is winnable on merit — a sports rival (top 52) covers the 240 m
    // bridge in ~5.7 s and beats even a perfect sedan run (~8.5 s).
    G.spawnRival(300, -60, 'sedan');
  };

  // ---------------- save / load ----------------
  function saveGame(slot) {
    const s = {
      cash: G.state.cash, hp: G.player.hp, armor: G.player.armor,
      ammo: G.player.ammo, reserve: G.player.reserve, weapon: G.player.weapon,
      radio: G.state.radio, hour: G.state.hour, weather: G.state.weather,
      skill: G.state.skill, upgrades: G.state.upgrades, paint: G.state.paint,
      stats: G.state.stats, completed: G.M.completed,
      stashFound: [...G.M.stashFound], x: G.player.x, z: G.player.z,
    };
    try {
      localStorage.setItem(SAVE_KEY + slot, JSON.stringify(s));
      G.state.saveSlot = slot;
      G.audio.cash();
      G.hud.notify('SAVED', `Game saved to slot ${slot}`);
    } catch { G.hud.toast('Save failed — storage unavailable'); }
  }
  function loadGame(slot) {
    try {
      const raw = localStorage.getItem(SAVE_KEY + slot);
      if (!raw) return false;
      const s = JSON.parse(raw);
      G.state.cash = s.cash; G.player.hp = s.hp; G.player.armor = s.armor;
      G.player.ammo = s.ammo; G.player.reserve = s.reserve; G.player.weapon = s.weapon;
      G.state.radio = s.radio; G.state.hour = s.hour; G.state.weather = s.weather;
      G.state.skill = s.skill; G.state.upgrades = s.upgrades; G.state.paint = s.paint;
      G.state.stats = s.stats; G.M.completed = s.completed || [];
      G.M.stashFound = new Set(s.stashFound || []);
      G.teleport(s.x, s.z);
      G.state.saveSlot = slot;
      return true;
    } catch { return false; }
  }
  G.saveGame = saveGame;
  G.loadGame = loadGame;

  G.teleport = function (x, z, heading) {
    const p = G.player;
    // Default heading to the CURRENT heading — never undefined.
    const h = heading === undefined ? p.heading : heading;
    if (p.vehicle) { p.vehicle.x = x; p.vehicle.z = z; p.vehicle.heading = h; p.vehicle.speed = 0; p.x = x; p.z = z; p.heading = h; }
    else { p.x = x; p.z = z; p.heading = h; p.mesh.position.set(x, 0, z); p.mesh.rotation.y = h; }
    if (G.M.current) G.M.current.routeStale = true; // force grid re-route from the new spot
  };

  // ---------------- sky / weather ----------------
  G.updateSky = function (dt) {
    const h = G.state.hour;
    const dayF = clamp(Math.sin(((h - 6) / 12) * Math.PI), -1, 1); // 1 at noon, -1 at midnight
    const golden = h > 16.2 && h < 19.0 ? 1 - Math.abs(h - 17.6) / 1.4 : 0;
    const night = dayF < -0.15 ? 1 : dayF < 0.15 ? (0.15 - dayF) / 0.3 : 0;
    const sun = G.sunLight;
    const ang = ((h - 6) / 12) * Math.PI;
    sun.position.set(Math.cos(ang) * 220, Math.sin(ang) * 220 + 20, 90);
    sun.intensity = dayF > 0 ? 1.4 + dayF * 1.2 + golden * 0.8 : 0.06;
    sun.color.setHex(golden > 0.5 ? 0xffb36b : dayF > 0 ? 0xfff2d8 : 0x8899ff);
    G.ambLight.intensity = 0.28 + Math.max(0, dayF) * 0.4;
    G.hemiLight.intensity = 0.25 + Math.max(0, dayF) * 0.45;

    // Sky + fog palette.
    const sky = new THREE.Color();
    if (night > 0.6) sky.setHex(0x0b1026);
    else if (golden > 0.4) sky.setHex(0xff8a4d);
    else if (dayF > 0.4) sky.setHex(0x7ec3e8);
    else if (h < 8) sky.setHex(0xffb37a);
    else sky.setHex(0x5a7ea8);
    const fogC = sky.clone().multiplyScalar(0.92);
    G.scene.background.lerp(sky, Math.min(1, (dt || 1) * 2));
    G.scene.fog.color.lerp(fogC, Math.min(1, (dt || 1) * 2));
    const rainF = clamp(G.rain, 0, 1);
    G.scene.fog.near = lerp(140, 55, rainF);
    G.scene.fog.far = lerp(760, 300, rainF);

    // Sun / moon sprites.
    const w = G.world.anim;
    if (w.sunSprite) {
      w.sunSprite.position.set(Math.cos(ang) * 480, Math.max(20, Math.sin(ang) * 380), -260);
      w.sunSprite.material.opacity = dayF > -0.1 ? 0.9 : 0;
    }
    if (w.moonSprite) {
      w.moonSprite.position.set(-Math.cos(ang) * 480, Math.max(30, -Math.sin(ang) * 380), -260);
      w.moonSprite.material.opacity = night > 0.4 ? 0.85 : 0;
    }
    // Streetlights + facade windows at night.
    const lampOn = night > 0.4;
    for (const pl of G.world.lampLights) pl.intensity = lampOn ? 260 : 0;
    for (const m of G.world.facadeMats) m.emissiveIntensity = lampOn ? 0.85 : golden > 0.4 ? 0.25 : 0;
    for (const lm of G.world.lampGlows) lm.material.color.setHex(lampOn ? 0xffe6a8 : 0x555544);
    // Rain visuals.
    if (G.rainPts) {
      const target = G.rain > 0.05;
      G.rainPts.visible = target;
      if (target) {
        G.rainPts.material.opacity = 0.25 + G.rain * 0.45;
        G.rainPts.position.set(G.player.x, 0, G.player.z);
        const pos = G.rainPts.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          let y = pos.getY(i) - dt * 55;
          if (y < 0) y = 50;
          pos.setY(i, y);
        }
        pos.needsUpdate = true;
      }
    }
    // Lightning in storms.
    if (G.state.weather === 3) {
      G.lightningT -= dt;
      if (G.lightningT <= 0) {
        G.lightningT = 6 + Math.random() * 10;
        G.lightning = 1;
        G.audio.thunder();
      }
    }
    if (G.lightning > 0) {
      G.lightning = Math.max(0, G.lightning - dt * 2.2);
      G.ambLight.intensity += G.lightning * 1.4;
    }
  };

  // ---------------- main step ----------------
  G.step = function (dt) {
    dt = Math.min(dt, 0.1);
    G.time += dt;
    G.stepCount++;
    G.fpsN++; G.fpsT += dt;
    if (G.fpsT >= 1) { G.fps = G.fpsN / G.fpsT; G.fpsN = 0; G.fpsT = 0; }

    const p = G.player;
    const inModal = G.hud.screenKind !== null;
    const playing = G.mode === 'play' || G.mode === 'briefing';

    // Cooldowns tick in EVERY mode — foot AND driving — so drive-by
    // shooting can never freeze after one shot.
    p.shootCooldown = Math.max(0, p.shootCooldown - dt);
    p.lastShotHit = false;
    if (G.mouseDown && p.weapon === 'PISTOL' && G.mode === 'play') tryShoot();

    if (playing && !inModal) {
      G.state.stats.playTime += dt;
      // Clock + weather are frozen while a shot is staged (G.staged is set
      // by stageShot): otherwise the slow capture lets golden hour drift
      // into night before the screenshot lands.
      if (!G.staged) {
        G.state.hour += (dt / TIME.dayLength) * 24;
        if (G.state.hour >= 24) G.state.hour -= 24;
        G.weatherTimer -= dt;
        if (G.autoWeather && G.weatherTimer <= 0) {
          G.weatherTimer = 80 + Math.random() * 60;
          const r = Math.random();
          G.state.weather = r < 0.45 ? 0 : r < 0.65 ? 1 : r < 0.85 ? 2 : 3;
        }
      }
      const rainTarget = G.state.weather === 2 ? 0.7 : G.state.weather === 3 ? 1 : 0;
      G.rain += (rainTarget - G.rain) * Math.min(1, dt * 0.5);

      stepPlayer(dt);
      stepCamera(dt);
      stepTrafficAll(dt);
      stepPolice(G.police, G.scene, dt, p, G.world, Math.random, G.audio, (reason) => {
        if (G.mode === 'play') { G.mode = 'busted'; G.hud.showBusted(reason); G.audio.fail(); }
      });
      const pos = { x: p.x, z: p.z };
      stepMissions(G.M, G, dt, pos);
      stepJob(G.M, G, dt, pos);
      checkStashes(G.M, G, pos);
      checkNearMiss(G.M, G, dt);
      stepRace(dt);
      stepPickups(pos);
      stepNPCs(dt);
      // Vehicle damage smoke + death explosion.
      for (const v of G.vehicles) {
        if (v.dead && !v.exploded) {
          v.exploded = true;
          explode(G.combat, G, v.x, 1.4, v.z, 9, 60);
          if (v.isPlayer) { G.damagePlayer(45); }
        }
        if (!v.dead && v.hp < v.maxHp * 0.35) {
          v.smokeTimer -= dt;
          if (v.smokeTimer <= 0) {
            v.smokeTimer = 0.12;
            spawnSmoke(v.x, v.z);
          }
        }
      }
      // Speeding adds a little heat; clean driving decays it (police module).
      if (p.vehicle && Math.abs(p.vehicle.speed) > 38 && G.police.stars < 5) {
        addHeat(G.police, 0.4 * dt, 'speeding');
      }
      // Stunt ramp: beach ramp zone.
      p.airborne = false;
      if (p.vehicle && Math.abs(p.vehicle.speed) > 34 && p.x > 300 && p.x < 340 && p.z > 40 && p.z < 100) {
        p.airborne = true; p.airT = 1.2;
      }
      if (p.airT > 0) p.airT -= dt;
      // Skill grows with clean driving + missions.
      G.state.skill = Math.min(100, Math.floor(G.state.stats.missionsDone * 6 + G.state.stats.jobsDone * 2 + G.state.stats.nearMisses));
    }

    stepCombat(G.combat, dt);
    G.world.update(dt, G.time, G.state.hour, G.state.weather);
    G.updateSky(dt);
    // Camera shake decay.
    if (G.shake > 0) {
      G.shake = Math.max(0, G.shake - dt * 1.6);
      G.camera.position.x += (Math.random() - 0.5) * G.shake * 0.5;
      G.camera.position.y += (Math.random() - 0.5) * G.shake * 0.5;
    }
    // HUD sync.
    const missionTarget = currentTarget();
    G.missionTarget = missionTarget;
    G.hud.update({
      cash: G.state.cash, hour: G.state.hour, weather: G.state.weather, rain: G.rain,
      stars: G.police.stars, radio: G.state.radio,
      weapon: p.weapon, ammo: p.ammo, reserve: p.reserve,
      hp: Math.max(0, Math.round(p.hp)), armor: Math.round(p.armor),
      vehicle: p.vehicle, stashes: G.M.stashFound.size,
      missionsDone: G.M.completed.length, skill: G.state.skill,
      policeUnits: G.police.units.filter(u => !u.v.dead).map(u => ({ name: u.name, dist: Math.round(dist2d(u.v.x, u.v.z, p.x, p.z)), status: u.status })),
      heli: G.police.heli ? { name: G.police.heli.name, dist: Math.round(dist2d(G.police.heli.g.position.x, G.police.heli.g.position.z, p.x, p.z)), status: G.police.heli.status } : null,
      prompt: p.prompt, missionName: G.M.current ? G.M.current.def.name : null,
    });
    const stashPts = STASHES.filter(s => !G.M.stashFound.has(s.x + ',' + s.z));
    G.hud.drawMinimap(G.world, p, G.police, missionTarget, stashPts);
  };

  function currentTarget() {
    const cur = G.M.current;
    if (cur && cur.stage) {
      if (cur.stage.type === 'goto' || cur.stage.type === 'steal' || cur.stage.type === 'race' || cur.stage.type === 'hold') {
        return { x: cur.stage.x, z: cur.stage.z };
      }
      if (cur.targets && cur.targets.length) {
        const t = cur.targets.find(t => !t.done);
        if (t) return { x: t.x, z: t.z };
      }
    }
    if (G.M.job && G.M.job.def.id === 'taxi') return G.M.job.stage === 0 ? G.M.job.pickup : G.M.job.drop;
    if (!cur) {
      const id = nextMissionId(G.M);
      if (id) return { x: -40, z: 168 }; // Vera
    }
    return null;
  }

  function stepPlayer(dt) {
    const p = G.player;
    const k = G.keys;
    if (p.vehicle) {
      const v = p.vehicle;
      let throttle = 0;
      if (k.KeyW || k.ArrowUp) throttle += 1;
      if (k.KeyS || k.ArrowDown) throttle -= 1;
      let steer = 0;
      if (k.KeyA || k.ArrowLeft) steer -= 1;
      if (k.KeyD || k.ArrowRight) steer += 1;
      if (k.Space) throttle = v.speed > 0 ? -1 : throttle; // handbrake
      stepVehicle(v, dt, throttle, steer, G.world, G.vehicles);
      p.x = v.x; p.z = v.z; p.heading = v.heading;
      if (v.hp <= 0 && !v.dead) v.dead = true;
      G.audio.engineSet(Math.abs(v.speed) / v.def.top, Math.abs(throttle));
      // Prompt: none while driving (F exits).
      p.prompt = 'F — exit vehicle · Q — weapon · R — reload';
      p.promptAction = null;
    } else {
      // On foot.
      let mx = 0, mz = 0;
      if (k.KeyW || k.ArrowUp) mz += 1;
      if (k.KeyS || k.ArrowDown) mz -= 1;
      if (k.KeyA || k.ArrowLeft) mx -= 1;
      if (k.KeyD || k.ArrowRight) mx += 1;
      const running = k.ShiftLeft || k.ShiftRight;
      const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
      if (mx || mz) {
        // Camera-relative movement: the chase cam sits behind the heading,
        // so W moves along the heading, D moves to the camera's right.
        const len = Math.hypot(mx, mz); mx /= len; mz /= len;
        const h = p.heading;
        const wx = Math.sin(h) * mz + Math.cos(h) * mx;
        const wz = Math.cos(h) * mz - Math.sin(h) * mx;
        const nx = p.x + wx * speed * dt;
        const nz = p.z + wz * speed * dt;
        if (!G.world.blocked(nx, p.z, 0.7)) p.x = nx;
        if (!G.world.blocked(p.x, nz, 0.7)) p.z = nz;
        p.heading = Math.atan2(wx, wz);
        p.walkPhase += dt * speed * 1.6;
        if (Math.floor(p.walkPhase) !== Math.floor(p.walkPhase - dt * speed * 1.6)) G.audio.footsteps();
      }
      // Eastern edge is the bay shoreline (x=470) except on the bridge
      // deck and the island — see landMaxX in util.js.
      p.x = clamp(p.x, -455, landMaxX(p.x, p.z)); p.z = clamp(p.z, -455, 455);
      // Walk animation.
      const u = p.mesh.userData;
      const swing = (mx || mz) ? Math.sin(p.walkPhase) * 0.5 : 0;
      u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
      u.armL.rotation.x = -swing * 0.8; u.armR.rotation.x = swing * 0.8;
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
      // Context prompt.
      p.prompt = contextPrompt();
      G.audio.engineSet(0, 0);
    }
  }

  function contextPrompt() {
    const p = G.player;
    for (const n of G.npcs) {
      if (dist2d(p.x, p.z, n.x, n.z) < PLAYER.interactRadius) {
        if (n.role === 'briefing') return G.M.current ? 'Vera — mission in progress' : 'E — talk to Vera Solano';
        if (n.role === 'garage') return 'E — Neon Garage';
        if (n.role === 'jobs') return 'E — side jobs board';
      }
    }
    if (dist2d(p.x, p.z, -32, 180) < 5) return 'E — Safehouse (save / sleep)';
    if (dist2d(p.x, p.z, 120, -140) < 5) return 'E — Ammu-Nation';
    let nearCar = false;
    for (const v of G.vehicles) if (!v.dead && dist2d(p.x, p.z, v.x, v.z) < 4.5) nearCar = true;
    if (nearCar) return 'F — enter vehicle';
    return null;
  }

  // Snap the chase camera behind the player instantly (no damping).
  // Shot staging needs this for modes where stepCamera() never runs
  // (garage / map): without it the camera stays at its boot position
  // and the staged car is nowhere in frame.
  // lookShift (world units) aims the camera that far to the subject's
  // left, which pushes the subject right in frame — the garage panel
  // docks left, so the car must sit right of centre, not under it.
  G.snapCamera = function (lookShift) {
    const p = G.player, cam = G.camera;
    const dist = p.vehicle ? G.camDist + 3 : G.camDist;
    const height = p.vehicle ? 4.2 : 3.4;
    cam.position.set(p.x - Math.sin(p.heading) * dist, height, p.z - Math.cos(p.heading) * dist);
    const s = lookShift || 0;
    const tx = p.x + Math.sin(p.heading) * 6 + Math.cos(p.heading) * s;
    const tz = p.z + Math.cos(p.heading) * 6 - Math.sin(p.heading) * s;
    cam.lookAt(tx, 1.4, tz);
  };

  function stepCamera(dt) {
    const p = G.player;
    const cam = G.camera;
    const dist = p.vehicle ? G.camDist + 3 : G.camDist;
    const height = p.vehicle ? 4.2 : 3.4;
    // Chase cam: behind the heading, position smoothed (no yaw lerp — the
    // camera snaps to the heading and the position smoothing removes judder).
    const cx = p.x - Math.sin(p.heading) * dist;
    const cz = p.z - Math.cos(p.heading) * dist;
    const tx = p.x + Math.sin(p.heading) * 6;
    const tz = p.z + Math.cos(p.heading) * 6;
    cam.position.x = damp(cam.position.x, cx, 6, dt);
    cam.position.y = damp(cam.position.y, height, 6, dt);
    cam.position.z = damp(cam.position.z, cz, 6, dt);
    cam.lookAt(tx, 1.4, tz);
  }

  function stepTrafficAll(dt) {
    const rng = Math.random;
    for (const t of G.traffic) {
      if (t.dead) continue;
      // Traffic avoids the player's car a little.
      stepTraffic(t, dt, G.world, rng);
    }
    // Despawn far traffic, respawn near the player to keep the streets alive.
    for (const t of G.vehicles) { /* traffic list is authoritative */ }
  }

  function stepRace(dt) {
    if (!G.race) return;
    const r = G.race;
    const p = G.player;
    if (r.finished) return;
    // A mission race stage reads the outcome in stepMissions (which runs
    // before stepRace each tick), so a finished mission race stays in place
    // for stepMissions to consume — it clears G.race itself. A side-job
    // race is cleared here, as before.
    const missionRace = !!(G.M.current && G.M.current.stage && G.M.current.stage.type === 'race');
    const finish = (won) => {
      r.finished = true;
      r.won = won;
      G.hud.notify(won ? 'RACE WON' : 'RACE LOST',
        won ? (missionRace ? 'You beat Kai across the bridge' : 'You beat the circuit — $400') : 'The rival finished first');
      if (won && !missionRace) { G.state.cash += 400; G.audio.cash(); }
      if (G.M.job && G.M.job.def.id === 'race') { G.M.job = null; }
      if (!missionRace) G.race = null;
    };
    const wp = r.waypoints[r.idx];
    if (dist2d(p.x, p.z, wp.x, wp.z) < 10) {
      r.idx++;
      if (r.idx >= r.waypoints.length) {
        r.idx = 0; r.lap++;
        if (r.lap > r.laps) { finish(!r.rivalFinished); return; }
        G.hud.notify('LAP ' + r.lap, `${r.laps} laps — keep pushing`);
      }
    }
    // Rival follows the same circuit.
    if (G.rival && !r.rivalFinished) {
      const rv = G.rival;
      const rwp = r.waypoints[r.rivalIdx];
      const d = dist2d(rv.x, rv.z, rwp.x, rwp.z);
      if (d < 10) {
        r.rivalIdx++;
        if (r.rivalIdx >= r.waypoints.length) {
          r.rivalIdx = 0; r.rivalLap++;
          if (r.rivalLap > r.laps) {
            r.rivalFinished = true;
            if (!r.finished) finish(false);
          }
        }
      }
      const want = Math.atan2(rwp.x - rv.x, rwp.z - rv.z);
      const diff = angDiff(rv.heading, want);
      stepVehicle(rv, dt, 0.9, clamp(diff * 1.8, -1, 1), G.world, G.vehicles);
    }
  }

  function stepPickups(pos) {
    for (const pk of G.M.cashPickups) {
      if (pk.taken) continue;
      if (dist2d(pos.x, pos.z, pk.x, pk.z) < 3) {
        pk.taken = true;
        G.scene.remove(pk.mesh);
        G.state.cash += pk.amount;
        G.state.stats.stashes++;
        G.audio.pickup();
        G.hud.notify('STREET CASH', `+$${pk.amount}`);
      }
    }
  }

  function stepNPCs(dt) {
    for (const n of G.npcs) {
      // Idle sway + face the player when close.
      const d = dist2d(n.mesh.position.x, n.mesh.position.z, G.player.x, G.player.z);
      if (d < 8) {
        const want = Math.atan2(G.player.x - n.x, G.player.z - n.z);
        n.mesh.rotation.y += angDiff(n.mesh.rotation.y, want) * Math.min(1, dt * 4);
      }
    }
  }

  function spawnSmoke(x, z) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.5 }));
    s.position.set(x + (Math.random() - 0.5) * 2, 1.6, z + (Math.random() - 0.5) * 2);
    G.scene.add(s);
    setTimeout(() => G.scene.remove(s), 700);
  }

  // ---------------- debug API (playtest harness + shot staging) ----------------
  G.debug = {
    state() {
      return {
        mode: G.mode, screen: G.hud.screenKind,
        x: +G.player.x.toFixed(1), z: +G.player.z.toFixed(1),
        heading: +G.player.heading.toFixed(2),
        hp: Math.round(G.player.hp), armor: Math.round(G.player.armor),
        cash: G.state.cash, stars: G.police.stars, heat: Math.round(G.police.heat),
        hour: +G.state.hour.toFixed(2), weather: G.state.weather, rain: +G.rain.toFixed(2),
        vehicle: G.player.vehicle ? { type: G.player.vehicle.type, speed: +G.player.vehicle.speed.toFixed(1), hp: Math.round(G.player.vehicle.hp) } : null,
        weapon: G.player.weapon, ammo: G.player.ammo, reserve: G.player.reserve,
        mission: G.M.current ? { id: G.M.current.def.id, name: G.M.current.def.name, stage: G.M.current.stageIdx, label: G.M.current.stage?.label } : null,
        completed: [...G.M.completed], job: G.M.job ? G.M.job.def.id : null,
        fps: Math.round(G.fps), steps: G.stepCount,
        units: G.police.units.length, heli: !!G.police.heli,
        stashes: G.M.stashFound.size,
      };
    },
    teleport(x, z, h) { G.teleport(x, z, h); return G.debug.state(); },
    start() { G.mode = 'play'; G.hud.hideScreen(); return G.debug.state(); },
    startMission(id) { G.mode = 'play'; G.hud.hideScreen(); return startMission(G.M, id, G); },
    setWanted(n) { G.police.heat = [0, 35, 85, 165, 265, 405][n] || 0; G.police.stars = n; return G.debug.state(); },
    setTime(h) { G.state.hour = h; G.updateSky(1); return G.debug.state(); },
    setWeather(w) { G.state.weather = w; G.autoWeather = false; return G.debug.state(); },
    setRain(r) { G.rain = r; return G.debug.state(); },
    giveCash(n) { G.state.cash += n; return G.state.cash; },
    enterCar() { toggleVehicle(); return G.debug.state(); },
    save(slot) { saveGame(slot); return true; },
    load(slot) { return loadGame(slot); },
    dismiss() { G.hud.hideScreen(); G.hud.hideDialog(); if (G.mode !== 'play') G.mode = 'play'; return G.debug.state(); },
    showDialog(charKey, text, dur) { G.hud.showDialog(charKey, text, dur || 120); return true; },
    stageShot(kind) { return G.stageShot(kind); },
  };

  // ---------------- shot staging (deterministic scenes) ----------------
  G.stageShot = function (kind) {
    G.staged = kind;
    G.autoWeather = false;
    G.mode = 'play';
    G.hud.hideScreen();
    if (kind === 'cover') {
      // Golden-hour chase with helicopter, dense HUD, dialog.
      G.state.hour = 17.5; G.state.weather = 0; G.rain = 0;
      G.updateSky(1);
      // A getaway car on the z=69 lane beside the staging point, so the
      // chase is actually driven (toggleVehicle finds nothing otherwise).
      const chaseCar = createVehicle(G.scene, 'sports', 116, 69, Math.PI * 0.5);
      G.vehicles.push(chaseCar);
      G.teleport(118, 67, Math.PI * 0.5);
      G.player.weapon = 'PISTOL'; G.player.ammo = 12; G.player.reserve = 120;
      G.state.weapon = 'PISTOL';
      G.player.mesh.userData.gun.visible = true;
      if (!G.player.vehicle) toggleVehicle();
      if (G.player.vehicle) G.player.vehicle.speed = 22;
      // Staged chase car is a prop: give it a big hp pool so the pursuing
      // units' rams don't wreck it to 0% before the slow capture lands.
      if (G.player.vehicle) { G.player.vehicle.maxHp = 1000; G.player.vehicle.hp = 1000; }
      G.debug.setWanted(4);
      G.debug.startMission(5);
      G.hud.showDialog('vera', 'The bridge is the only way out — lose them before the island, or this whole city comes down on you.', 120);
      G.hud.notify('MISSION — Bridge Run', 'Race Kai across the bay bridge');
    } else if (kind === 'night') {
      // Neon-night shootout in the rain, dialog + portrait.
      G.state.hour = 21.5; G.state.weather = 3; G.rain = 1;
      G.updateSky(1);
      G.teleport(118, -138, Math.PI);
      G.player.weapon = 'PISTOL'; G.player.ammo = 9; G.player.reserve = 96;
      G.state.weapon = 'PISTOL';
      G.player.mesh.userData.gun.visible = true;
      // Staged in a car, not on foot: a foot cop arrests an on-foot
      // player within seconds at 3★, which puts the BUSTED screen over
      // the shot. The car is parked (speed 0) so the camera holds still
      // while the rain, neon and dialog settle for the capture.
      const nightCar = createVehicle(G.scene, 'sports', 116, -138, Math.PI);
      G.vehicles.push(nightCar);
      if (!G.player.vehicle) toggleVehicle();
      if (G.player.vehicle) {
        G.player.vehicle.maxHp = 1000; G.player.vehicle.hp = 1000;
        G.player.vehicle.speed = 0;
        G.player.vehicle.steer = 0; // no drift while parked for the shot
      }
      G.debug.setWanted(3);
      G.debug.startMission(10);
      G.hud.showDialog('diego', 'Three of them, by the ferris wheel. You take the left, I take the right — and nobody leaves.', 120);
      G.hud.notify('MISSION — Ferris Fall', 'The crew arrived — clear them (3)');
    } else if (kind === 'garage') {
      // Cinematic garage: golden light, upgraded car, garage screen.
      G.state.hour = 17.8; G.state.weather = 0; G.rain = 0;
      G.updateSky(1);
      G.teleport(-176, -66, Math.PI * 0.5);
      G.state.cash = 48250;
      G.state.upgrades = { engine: 3, armor: 2, brakes: 2, respray: 1 };
      // A parked sports car on the z=-69 lane beside the garage, so the
      // shot always shows the upgraded car (toggleVehicle finds nothing
      // otherwise — the nearest traffic is nondeterministic).
      const garageCar = createVehicle(G.scene, 'sports', -174, -67, Math.PI * 0.5);
      G.vehicles.push(garageCar);
      if (!G.player.vehicle) toggleVehicle();
      if (G.player.vehicle) {
        G.player.vehicle.upgrades = { engine: 3, armor: 2, brakes: 2 };
        repaintVehicle(G.scene, G.player.vehicle, 0xd8a03c);
      }
      // Marcus the mechanic stands at (-180,-66), dead in the snapped
      // camera's sightline to the car — move him beside the car instead
      // so he reads as the mechanic next to the gold car, not a blocker.
      const marcus = G.npcs.find(n => n.key === 'marcus');
      if (marcus) { marcus.x = -174; marcus.z = -60; marcus.mesh.position.set(-174, 0, -60); }
      // The camera never follows in garage mode (stepCamera only runs in
      // play), so snap it behind the car now — otherwise the shot shows
      // the spawn street and the upgraded car is out of frame. Aim 3
      // units left so the gold car sits right of centre, clear of the
      // left-docked garage panel.
      G.snapCamera(3);
      G.hud.showGarage();
      G.mode = 'garage';
    } else if (kind === 'map') {
      G.state.hour = 10.2; G.state.weather = 0; G.rain = 0;
      G.updateSky(1);
      G.teleport(0, 0, 0);
      // Same camera snap as the garage shot: map mode never runs
      // stepCamera, so the backdrop would otherwise be the spawn view.
      G.snapCamera();
      G.M.completed = [1, 2, 3, 4, 5];
      G.state.cash = 18400;
      G.hud.showMap();
      G.mode = 'map';
    }
    return kind;
  };

  return G;
}
