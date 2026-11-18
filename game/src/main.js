// NEON BAY — entry point. Builds the renderer, wires every system together,
// runs the fixed-step simulation, and owns the game modes (title, play,
// pause, briefing, busted, wasted, map, garage, gun shop, cutscene) and the
// debug handle the playtest reads.
import { makeRng, clamp, damp, angleDelta, distance2D, formatCash } from './utils.js';
import { buildWorld, applyTimeOfDay, animateWorld, PLACES, AVENUES, STREETS, ISLAND, groundHeightAt, nearestRoadPoint } from './world.js';
import { createPlayer, updatePlayerOnFoot, updateCamera, setCinematicCamera } from './player.js';
import { spawnVehicle, driveVehicle, damageVehicle, collideVehicles, removeVehicle, vehicleSpeedKmh, VEHICLE_TYPES } from './vehicles.js';
import { createPedestrian, updatePedestrian, killPedestrian, spawnTraffic, updateTrafficCar, updateTrafficCollisions } from './traffic.js';
import { createWanted, addHeat, clearWanted, updateWanted, spawnFootCops, updateFootCop, getPoliceUnits, spawnStagedCop } from './police.js';
import { MISSIONS, SIDE_JOBS, STASH_SPOTS, PROPERTIES, createMissionState, nextMissionDef, startMission, completeMission, failMission, updateMission, missionObjectiveText, missionTarget, spawnCashPickup, updateCashPickups, repairCost, makeSideJob, notifyNearMiss } from './missions.js';
import { createCombat, shootPistol, reloadPistol, punch, explode, updateCombat } from './combat.js';
import { createHud, showToast, showScreen, hideAllScreens, updateHud, drawMinimap, drawBigMap, addNotification, showDialog, hideDialog } from './hud.js';
import { drawPortrait } from './portraits.js';
import { createParticles, exhaustPuff, dustPuff, sparkBurst, updateParticles } from './particles.js';
import { loadSave, writeSave, clearSave, listSlots } from './save.js';
import { stageShot } from './shots.js';
import * as audio from './audio.js';

const STEP = 1 / 60;
const SAVE_EVERY_SECONDS = 20;
const RADIO_STATIONS = ['NEON FM 88.5', 'SUNSET ROCK 101.1', 'BAY TALK 540 AM', 'PALM BEACH 96.3'];
const WEAPONS = {
  pistol: { name: 'Pistol', cooldown: 0.28, damage: 26 },
  ap: { name: 'AP Pistol', cooldown: 0.15, damage: 34 },
};
const GARAGE_UPGRADES = [
  { id: 'engine', name: 'Engine Tuning', desc: '+8% top speed per level', price: 800, max: 3 },
  { id: 'armor', name: 'Armor Plating', desc: '-15% damage taken per level', price: 600, max: 3 },
  { id: 'tires', name: 'Sport Tires', desc: '+10% grip per level', price: 500, max: 3 },
];
const RESPRAY_COLORS = [0xd21f3c, 0x1f6fb2, 0x2f9e44, 0xe8a33d, 0x7a4fd0, 0x222831, 0xd8d3c8, 0x0e7c86];
const GUNSHOP_ITEMS = [
  { id: 'ammo', name: 'Pistol Ammo ×24', desc: 'Standard 9mm rounds', price: 50 },
  { id: 'armor', name: 'Body Armor', desc: 'Full vest — 100 armor', price: 150 },
  { id: 'health', name: 'Med Kit', desc: 'Patch yourself up — full health', price: 80 },
  { id: 'ap', name: 'AP Pistol', desc: 'Faster fire, harder hits', price: 800 },
];

const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed') || 20261118);
const SHOT = params.get('shot') || null;

export function createGame() {
  const canvas = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1600);
  camera.position.set(0, 8, 26);

  const world = buildWorld(scene, SEED);
  const player = createPlayer(scene);
  const hud = createHud();
  const combat = createCombat(scene);
  const particles = createParticles(scene);
  const rng = makeRng(SEED + 101);

  const game = {
    renderer, scene, camera, world, player, hud, combat, particles, rng,
    mode: 'title',
    timeOfDay: 17.4,
    weather: 'clear',
    weatherTimer: 75,
    lightningTimer: 8,
    flashTimer: 0,
    elapsed: 0,
    playSeconds: 0,
    cash: 250,
    cashEarned: 0,
    bestWanted: 0,
    armor: 0,
    radioIndex: 0,
    input: { keys: new Set(), mouseDown: false, dragMoved: 0 },
    car: null,
    vehicles: [],
    traffic: [],
    peds: [],
    footCops: [],
    rivals: [],
    wanted: createWanted(),
    missions: createMissionState(),
    cashPickups: [],
    stashes: [],
    cameraMode: 'follow',
    cinematicEye: null,
    cinematicFocus: null,
    nearMissCooldown: 0,
    saveTimer: SAVE_EVERY_SECONDS,
    healthRegenTimer: 0,
    copPunchCooldown: 0,
    pickupRespawnTimer: 45,
    exhaustTimer: 0,
    shotMode: !!SHOT,
    pausedFrom: null,
    missionCar: null,
    boat: null,
    saveSlot: 1,
    skills: { driving: 1, shooting: 1, stamina: 1 },
    skillXp: { driving: 0, shooting: 0, stamina: 0 },
    stats: { distanceDriven: 0, shotsFired: 0, shotsHit: 0, carsStolen: 0, nearMisses: 0 },
    cutscene: null,
    garageCar: null,
    diag: [],
  };
  player.weapon = WEAPONS.pistol;
  player.armor = 0;

  // ---------- spawning ----------
  function spawnParkedCars() {
    const spots = [...world.carSpawns];
    const types = ['sedan', 'sedan', 'sports', 'truck', 'bike', 'sedan'];
    for (let i = 0; i < 22; i += 1) {
      const spot = spots.splice(Math.floor(rng.next() * spots.length), 1)[0];
      if (!spot) break;
      // Parked along the curb, off the driving lanes, so the roads stay clear.
      const road = nearestRoadPoint(spot.x, spot.z);
      const onAvenue = Math.abs(road.x - spot.x) < 2;
      const px = onAvenue ? road.x + (rng.chance(0.5) ? 7.6 : -7.6) : spot.x;
      const pz = onAvenue ? spot.z : road.z + (rng.chance(0.5) ? 7.6 : -7.6);
      const type = types[Math.floor(rng.next() * types.length)];
      const heading = onAvenue ? (rng.chance(0.5) ? 0 : Math.PI) : (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2);
      const car = spawnVehicle(scene, type, px, pz, heading, {
        parked: true, randomColor: true, seed: Math.floor(rng.next() * 1e9),
      });
      game.vehicles.push(car);
    }
    // The red Comet for the Hot Wheels job, parked by the casino.
    const comet = spawnVehicle(scene, 'sports', 150, -127.5, Math.PI / 2, {
      parked: true, color: 0xd21f3c, missionCar: true,
    });
    game.vehicles.push(comet);
    game.missionCar = comet;
    // The Wave Runner at Sunset Pier.
    const boat = spawnVehicle(scene, 'boat', 314, -60, Math.PI / 2, { parked: true });
    game.vehicles.push(boat);
    game.boat = boat;
  }

  function spawnPedestrians() {
    for (let i = 0; i < 26; i += 1) {
      const spot = world.pedSpawns[Math.floor(rng.next() * world.pedSpawns.length)];
      game.peds.push(createPedestrian(scene, spot.x, spot.z, rng));
    }
  }

  function spawnStreetCash() {
    const spots = [
      { x: -60, z: 68 }, { x: 120, z: -52 }, { x: -180, z: -52 },
      { x: 60, z: 128 }, { x: 210, z: 28 },
    ];
    for (const s of spots) game.cashPickups.push(spawnCashPickup(scene, s.x, s.z));
  }

  function spawnStashes() {
    for (const s of STASH_SPOTS) {
      game.stashes.push(spawnCashPickup(scene, s.x, s.z, 250, true));
    }
  }

  function clearDynamic() {
    for (const v of game.vehicles) removeVehicle(scene, v);
    for (const c of game.wanted.cops) scene.remove(c.mesh);
    for (const p of game.peds) scene.remove(p.group);
    for (const c of game.footCops) scene.remove(c.group);
    for (const r of game.rivals) scene.remove(r.group);
    for (const rb of game.wanted.roadblocks) scene.remove(rb.group);
    if (game.wanted.heli) scene.remove(game.wanted.heli.group);
    if (game.wanted.boat) scene.remove(game.wanted.boat.mesh);
    for (const p of game.cashPickups) scene.remove(p.mesh);
    for (const p of game.stashes) scene.remove(p.mesh);
    if (game.missions.active) {
      if (game.missions.active.beacon) scene.remove(game.missions.active.beacon);
      for (const d of game.missions.active.drops) if (d.mesh) scene.remove(d.mesh);
    }
    game.vehicles = [];
    game.traffic = [];
    game.peds = [];
    game.footCops = [];
    game.rivals = [];
    game.cashPickups = [];
    game.stashes = [];
    game.wanted = createWanted();
    game.missions = createMissionState();
    game.car = null;
    game.missionCar = null;
    game.boat = null;
  }

  function resetWorld() {
    clearDynamic();
    game.traffic = spawnTraffic(scene, world, rng, 14);
    for (const t of game.traffic) game.vehicles.push(t);
    spawnParkedCars();
    spawnPedestrians();
    spawnStreetCash();
    spawnStashes();
    game.player.x = 0;
    game.player.z = 10;
    game.player.heading = 0;
    game.player.cameraYaw = 0;
    game.player.health = 100;
    game.player.armed = false;
    game.player.ammo = 12;
    game.player.reserveAmmo = 48;
    game.player.group.visible = true;
    game.timeOfDay = 17.4;
    game.weather = 'clear';
    game.mode = 'play';
    applyTimeOfDay(world, scene, game.timeOfDay, game.weather);
  }

  game.resetWorld = resetWorld;

  // ---------- helpers exposed to shots / tests ----------
  game.setTimeOfDay = (h) => {
    game.timeOfDay = h;
    applyTimeOfDay(world, scene, h, game.weather);
  };
  game.setWeather = (w) => {
    game.weather = w;
    applyTimeOfDay(world, scene, game.timeOfDay, w);
  };
  game.teleportPlayer = (x, z, heading) => {
    exitCar(true);
    player.x = x;
    player.z = z;
    player.heading = heading === undefined ? player.heading : heading;
    player.group.position.set(x, groundHeightAt(x, z), z);
  };
  game.spawnPlayerCar = (type, x, z, heading) => {
    const car = spawnVehicle(scene, type, x, z, heading, {});
    car.isPlayer = true;
    game.vehicles.push(car);
    return car;
  };
  game.enterCar = (car) => enterCar(car);
  game.setWantedLevel = (level) => {
    game.wanted.heat = level * 20;
    game.wanted.level = level;
    game.wanted.decayTimer = 9999;
  };
  game.startMissionIndex = (index) => {
    const def = MISSIONS[index];
    if (!def) return;
    game.missions.nextIndex = index;
    startMission(game.missions, scene, def, handleMissionEvent);
  };
  game.hideTitle = () => {
    hideAllScreens(hud);
    game.mode = 'play';
  };
  game.firePistol = () => firePistol();
  game.openGarageScreen = () => openGarage();
  game.openMapScreen = () => openMap();
  game.openGunshopScreen = () => openGunshop();
  game.stageCop = (x, z, heading) => spawnStagedCop(scene, game.wanted, x, z, heading);
  game.renderFrame = () => {
    if (game.cameraMode === 'cinematic' && game.cinematicEye && game.cinematicFocus) {
      setCinematicCamera(camera, game.cinematicFocus.x, game.cinematicFocus.y, game.cinematicFocus.z,
        game.cinematicEye.x, game.cinematicEye.y, game.cinematicEye.z, world);
    }
    updateHudFromState();
    renderer.render(scene, camera);
  };

  // ---------- damage, skills, stats ----------
  function damagePlayer(amount) {
    let left = amount;
    if (game.armor > 0) {
      const absorbed = Math.min(game.armor, left);
      game.armor -= absorbed;
      left -= absorbed;
    }
    player.health -= left;
    game.healthRegenTimer = 0;
  }

  function addSkillXp(skill, amount) {
    game.skillXp[skill] += amount;
    const level = Math.min(10, 1 + Math.floor(game.skillXp[skill] / 20));
    if (level > game.skills[skill]) {
      game.skills[skill] = level;
      addNotification(hud, 'Skill up! ' + skill + ' reached level ' + level, 'gold');
      audio.playMissionComplete();
    }
  }

  function completePercent() {
    const total = MISSIONS.length + STASH_SPOTS.length + PROPERTIES.length;
    const done = game.missions.completed.length + game.missions.stashesFound + game.missions.propertiesOwned.length;
    return Math.round((done / total) * 100);
  }

  // ---------- mission events ----------
  function handleMissionEvent(ev) {
    if (ev.type === 'toast') showToast(hud, ev.text);
    else if (ev.type === 'objective') showToast(hud, 'Objective: ' + ev.text, 5000);
    else if (ev.type === 'cash') {
      game.cash += ev.amount;
      game.cashEarned += ev.amount;
      audio.playCash();
    } else if (ev.type === 'setWanted') {
      game.setWantedLevel(ev.level);
    } else if (ev.type === 'setTime') {
      game.setTimeOfDay(ev.hours);
    } else if (ev.type === 'dialog') {
      showDialog(hud, ev.who, ev.name, ev.text, 6000);
    } else if (ev.type === 'stash') {
      game.missions.stashesFound += 1;
      addNotification(hud, 'Neon stash found (' + game.missions.stashesFound + '/' + STASH_SPOTS.length + ')', 'gold');
    } else if (ev.type === 'spawnRivals') {
      spawnRivals(ev.x, ev.z, ev.count);
    } else if (ev.type === 'missionComplete') {
      let payout = ev.def.payout;
      if (game.missions.propertiesOwned.includes('clubroom')) payout += 100;
      game.cash += payout;
      game.cashEarned += payout;
      game.mode = 'complete';
      document.getElementById('complete-title').textContent = ev.def.title + ' — DONE';
      document.getElementById('complete-text').textContent =
        'Vera wires ' + formatCash(payout) + ' to your account. ' +
        game.missions.completed.length + ' of ' + MISSIONS.length + ' jobs done.';
      const next = nextMissionDef(game.missions);
      document.getElementById('complete-unlock').textContent = next
        ? 'Unlocked: ' + next.title + ' — ' + formatCash(next.payout)
        : 'All twelve jobs done. Coral Bay is yours.';
      showScreen(hud, 'complete');
      addNotification(hud, '★ MISSION PASSED — ' + ev.def.title, 'good');
      addNotification(hud, '+' + formatCash(payout), 'gold');
      if (next) addNotification(hud, 'Unlocked: ' + next.title, 'gold');
      writeSave(game, game.saveSlot);
    } else if (ev.type === 'missionFailed') {
      showToast(hud, 'Job failed: ' + ev.reason, 6000);
      addNotification(hud, 'Job failed: ' + ev.reason, 'bad');
    }
  }

  function spawnRivals(x, z, count) {
    for (let i = 0; i < count; i += 1) {
      const ped = createPedestrian(scene, x + rng.range(-8, 8), z + rng.range(-8, 8), rng);
      ped.group.traverse((o) => {
        if (o.isMesh && o.material && o.material.color) o.material.color.setHex(0x8a1f1f);
      });
      ped.speed = 5.2;
      ped.isRival = true;
      game.rivals.push(ped);
    }
    showDialog(hud, 'rico', 'Rico', 'Maro\'s boys are here. Drop all three of them.', 5000);
  }

  // ---------- entering / exiting cars ----------
  function nearestCar(maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const v of game.vehicles) {
      if (v.dead || v === game.car) continue;
      const d = distance2D(player.x, player.z, v.x, v.z);
      if (d < bestD) { bestD = d; best = v; }
    }
    return best;
  }

  function enterCar(car) {
    if (!car || car.dead) return false;
    if (car.isPolice && game.wanted.level > 0) return false;
    if (car.parked || car.isTraffic || car.missionCar) {
      const seen = game.peds.some((p) => !p.dead && distance2D(p.x, p.z, car.x, car.z) < 25)
        || game.wanted.cops.length > 0;
      addHeat(game.wanted, seen ? 12 : 6);
      game.stats.carsStolen += 1;
      if (seen) showToast(hud, 'Someone saw you take that car!');
      else showToast(hud, 'Car taken — keep it quiet.');
    }
    car.parked = false;
    car.isTraffic = false;
    car.isPlayer = true;
    car.cameraYaw = car.heading;
    game.car = car;
    game.traffic = game.traffic.filter((t) => t !== car);
    player.group.visible = false;
    audio.playClick();
    return true;
  }

  function exitCar(silent) {
    const car = game.car;
    if (!car) return;
    game.car = null;
    car.isPlayer = false;
    player.group.visible = true;
    const sideX = car.x + Math.cos(car.heading) * 2.2;
    const sideZ = car.z - Math.sin(car.heading) * 2.2;
    player.x = sideX;
    player.z = sideZ;
    player.heading = car.heading;
    player.cameraYaw = car.cameraYaw;
    player.group.position.set(sideX, groundHeightAt(sideX, sideZ), sideZ);
    if (!silent) audio.playClick();
  }

  // ---------- busted / wasted ----------
  function goBusted() {
    const fine = Math.min(game.cash, 200);
    game.cash -= fine;
    clearWanted(game.wanted);
    for (const cop of game.wanted.cops) scene.remove(cop.mesh);
    game.wanted.cops = [];
    game.mode = 'busted';
    audio.playBusted();
    document.getElementById('busted-text').textContent =
      'The CBPD picked you up. Fine paid: ' + formatCash(fine) + '. Vera is not impressed.';
    showScreen(hud, 'busted');
    writeSave(game, game.saveSlot);
  }

  function goWasted() {
    const bill = Math.min(game.cash, 300);
    game.cash -= bill;
    clearWanted(game.wanted);
    for (const cop of game.wanted.cops) scene.remove(cop.mesh);
    game.wanted.cops = [];
    if (game.missions.active) failMission(game.missions, scene, 'You woke up in hospital.', handleMissionEvent);
    game.mode = 'wasted';
    audio.playBusted();
    document.getElementById('wasted-text').textContent =
      'St. Marina patched you up. Hospital bill: ' + formatCash(bill) + '.';
    showScreen(hud, 'wasted');
    writeSave(game, game.saveSlot);
  }

  function respawnAt(x, z) {
    exitCar(true);
    player.x = x;
    player.z = z;
    player.health = 100;
    player.armed = false;
    player.group.position.set(x, groundHeightAt(x, z), z);
    hideAllScreens(hud);
    game.mode = 'play';
  }

  // ---------- cutscene player ----------
  function playCutscene(steps, after) {
    game.cutscene = { steps, index: 0, timer: 0, after };
    game.mode = 'cutscene';
    hideAllScreens(hud);
    applyCutsceneStep();
  }

  function applyCutsceneStep() {
    const cs = game.cutscene;
    if (!cs) return;
    const s = cs.steps[cs.index];
    if (!s) { endCutscene(); return; }
    game.cameraMode = 'cinematic';
    game.cinematicEye = s.eye;
    game.cinematicFocus = s.focus;
    if (s.who) showDialog(hud, s.who, s.name, s.text, s.dur * 1000);
    cs.timer = 0;
  }

  function endCutscene() {
    const after = game.cutscene ? game.cutscene.after : null;
    game.cutscene = null;
    game.cameraMode = 'follow';
    hideDialog(hud);
    game.mode = 'play';
    if (after) after();
  }

  const INTRO_CUTSCENE = [
    { eye: { x: -40, y: 26, z: -120 }, focus: { x: 120, y: 8, z: 40 }, who: 'vera', name: 'Vera Solano', text: 'Coral Bay. Sun, salt, and money that smells like the sea.', dur: 3.2 },
    { eye: { x: 60, y: 6, z: 90 }, focus: { x: 30, y: 6, z: 30 }, who: 'vera', name: 'Vera Solano', text: 'Twelve jobs. You do them clean, you get paid clean.', dur: 3.2 },
    { eye: { x: 300, y: 18, z: -20 }, focus: { x: 415, y: 4, z: -60 }, who: 'vera', name: 'Vera Solano', text: 'And if the CBPD comes knocking — drive like the bay is on fire.', dur: 3.0 },
  ];

  // ---------- input ----------
  const keys = game.input.keys;
  window.addEventListener('keydown', (ev) => {
    if (ev.repeat) return;
    keys.add(ev.code);
    if (ev.code === 'Tab') {
      ev.preventDefault();
      if (game.mode === 'play') openMap();
      else if (game.mode === 'map') closeMap();
      return;
    }
    if (ev.code === 'KeyM' && game.mode === 'play') openJobs();
    if (ev.code === 'KeyC' && game.mode === 'play') {
      game.radioIndex = (game.radioIndex + 1) % RADIO_STATIONS.length;
      showToast(hud, '♪ ' + RADIO_STATIONS[game.radioIndex]);
    }
    if (ev.code === 'KeyP' || ev.code === 'Escape') {
      if (game.mode === 'play') {
        game.mode = 'paused';
        fillPauseStats();
        showScreen(hud, 'pause');
      } else if (game.mode === 'paused') {
        hideAllScreens(hud);
        game.mode = 'play';
      } else if (game.mode === 'map') closeMap();
      else if (game.mode === 'jobs') { hideAllScreens(hud); game.mode = 'play'; }
      else if (game.mode === 'garage' || game.mode === 'gunshop') { hideAllScreens(hud); game.mode = 'play'; }
    }
    if (ev.code === 'Enter' && game.mode === 'cutscene') endCutscene();
    if (ev.code === 'KeyN') audio.setMuted(!audio.isMuted());
    if (ev.code === 'KeyE' && game.mode === 'play') {
      game.diag.push({ t: Math.round(game.elapsed * 10) / 10, ev: 'E', mode: game.mode, nearClub: nearClub(), inCar: !!game.car });
      if (game.car) exitCar();
      else {
        // The briefing is for taking the NEXT job. While a mission is
        // active, E at the club forecourt gets the player back into their
        // parked car instead of re-opening the briefing on every press.
        if (nearClub() && !game.missions.active) openBriefing();
        else if (nearGunshop()) openGunshop();
        else if (nearApartment()) useSafehouse();
        else {
          const car = nearestCar(5.5);
          if (car) enterCar(car);
        }
      }
    }
    if (ev.code === 'KeyG' && game.mode === 'play') {
      if (game.car && nearGarage()) openGarage();
      else if (game.car) showToast(hud, 'Mako Garage is on the west side — follow the green wrench on the map.');
    }
    if (ev.code === 'KeyR' && game.mode === 'play') reloadPistol(player);
    if (ev.code === 'KeyF' && game.mode === 'play' && !game.car) {
      punch(combat, player, { peds: [...game.peds, ...game.rivals], cars: game.vehicles });
      addHeat(game.wanted, 4);
    }
    if (ev.code === 'KeyJ' && game.mode === 'play' && player.armed) firePistol();
    if (ev.code === 'Digit1' && game.mode === 'play') { player.armed = false; }
    if (ev.code === 'Digit2' && game.mode === 'play') { player.armed = true; audio.unlockAudio(); }
    if (ev.code === 'Enter' && game.mode === 'title') startGame(0);
  });
  window.addEventListener('keyup', (ev) => keys.delete(ev.code));
  window.addEventListener('blur', () => keys.clear());

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener('mousedown', (ev) => {
    dragging = true;
    lastX = ev.clientX;
    lastY = ev.clientY;
    game.input.dragMoved = 0;
    audio.unlockAudio();
  });
  window.addEventListener('mousemove', (ev) => {
    if (!dragging) return;
    const dx = ev.clientX - lastX;
    const dy = ev.clientY - lastY;
    lastX = ev.clientX;
    lastY = ev.clientY;
    game.input.dragMoved += Math.abs(dx) + Math.abs(dy);
    if (game.car) {
      game.car.cameraYaw -= dx * 0.005;
      game.car.cameraYaw = clamp(game.car.cameraYaw, game.car.heading - 1.4, game.car.heading + 1.4);
    } else {
      player.cameraYaw -= dx * 0.005;
      player.cameraPitch = clamp(player.cameraPitch + dy * 0.004, 0.05, 1.1);
    }
  });
  window.addEventListener('mouseup', () => {
    if (dragging && game.input.dragMoved < 6 && game.mode === 'play' && player.armed && !game.car) {
      firePistol();
    }
    dragging = false;
  });
  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    player.cameraDist = clamp(player.cameraDist + Math.sign(ev.deltaY) * 1.2, 5, 14);
  }, { passive: false });
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

  function firePistol() {
    if (!player.armed || game.mode !== 'play') return;
    game.stats.shotsFired += 1;
    const origin = {
      x: player.x + Math.sin(player.heading) * 0.6,
      y: 1.5,
      z: player.z + Math.cos(player.heading) * 0.6,
    };
    const dir = { x: Math.sin(player.heading), y: -0.02, z: Math.cos(player.heading) };
    const fired = shootPistol(combat, origin, dir, player, {
      peds: [...game.peds, ...game.footCops, ...game.rivals],
      cars: [...game.vehicles, ...game.wanted.cops],
    });
    if (fired) {
      addHeat(game.wanted, 7);
      if (combat.lastHit) {
        game.stats.shotsHit += 1;
        addSkillXp('shooting', 2);
      }
      for (const p of game.peds) {
        if (!p.dead && distance2D(p.x, p.z, player.x, player.z) < 30) p.panic = 4;
      }
    }
  }

  function nearClub() {
    return distance2D(player.x, player.z, PLACES.club.x, PLACES.club.z + 16) < 9;
  }
  function nearGarage() {
    const cx = game.car ? game.car.x : player.x;
    const cz = game.car ? game.car.z : player.z;
    return distance2D(cx, cz, PLACES.garage.x, PLACES.garage.z + 14) < 14;
  }
  function nearGunshop() {
    return distance2D(player.x, player.z, 120, 30) < 9;
  }
  function nearApartment() {
    return distance2D(player.x, player.z, -60, 150) < 9;
  }

  function tryRepair() {
    const car = game.car;
    if (!car || !nearGarage()) return;
    if (game.missions.propertiesOwned.includes('garage')) {
      car.health = car.maxHealth;
      car.smokeLevel = 0;
      showToast(hud, 'Mako Garage (yours): repaired on the house.');
      return;
    }
    const cost = repairCost(car);
    if (cost <= 0) { showToast(hud, 'Mako Garage: she is already mint.'); return; }
    if (game.cash < cost) { showToast(hud, 'Mako Garage: repair is ' + formatCash(cost) + ' — you are short.'); return; }
    game.cash -= cost;
    car.health = car.maxHealth;
    car.smokeLevel = 0;
    audio.playCash();
    showToast(hud, 'Mako Garage: repaired for ' + formatCash(cost) + '.');
  }

  function useSafehouse() {
    if (!game.missions.propertiesOwned.includes('apartment')) {
      showToast(hud, 'Sunset Apartment — for sale: $2,500. Buy it from the Jobs menu (M).');
      return;
    }
    player.health = 100;
    game.timeOfDay = 8.0;
    applyTimeOfDay(world, scene, game.timeOfDay, game.weather);
    writeSave(game, game.saveSlot);
    showToast(hud, 'You crash at the Sunset Apartment. Rested, healed, saved.');
    addNotification(hud, 'Safehouse — progress saved', 'good');
  }

  // ---------- screens ----------
  function openBriefing() {
    game.diag.push({ t: Math.round(game.elapsed * 10) / 10, ev: 'openBriefing', mode: game.mode });
    const def = nextMissionDef(game.missions);
    if (!def) {
      showToast(hud, 'All twelve jobs are done. Coral Bay is yours, kid.');
      return;
    }
    drawPortrait(document.getElementById('briefing-portrait'), def.giver === 'Rico' ? 'rico' : 'vera');
    document.getElementById('briefing-title').textContent = def.title;
    document.getElementById('briefing-text').textContent = def.briefing;
    document.getElementById('briefing-payout').textContent = 'Payout: ' + formatCash(def.payout);
    game.mode = 'briefing';
    showScreen(hud, 'briefing');
  }

  function openJobs() {
    const list = document.getElementById('jobs-list');
    list.innerHTML = MISSIONS.map((m, i) => {
      const done = game.missions.completed.includes(m.id);
      const active = game.missions.active && game.missions.active.def.id === m.id;
      const status = done ? '✓ DONE' : active ? '● ACTIVE' : '○ OPEN';
      return `<div class="job-row"><b>${i + 1}. ${m.title}</b><span>${status} · ${formatCash(m.payout)}</span><br><span class="job-brief">${m.briefing}</span></div>`;
    }).join('') + PROPERTIES.map((p) => {
      const owned = game.missions.propertiesOwned.includes(p.id);
      return `<div class="job-row"><b>🏠 ${p.name}</b><span>${owned ? '✓ OWNED' : formatCash(p.price)}</span><br><span class="job-brief">${p.perk}</span>${owned ? '' : ` <button class="shop-buy" data-buy-prop="${p.id}">BUY</button>`}</div>`;
    }).join('');
    document.getElementById('side-list').innerHTML = SIDE_JOBS.map((j) => {
      return `<div class="job-row"><b>${j.title}</b><span>${formatCash(j.payout)}</span><br><span class="job-brief">${j.briefing}</span> <button class="shop-buy" data-side="${j.id}">START</button></div>`;
    }).join('');
    game.mode = 'jobs';
    showScreen(hud, 'jobs');
    list.querySelectorAll('[data-buy-prop]').forEach((btn) => {
      btn.addEventListener('click', () => buyProperty(btn.dataset.buyProp));
    });
    document.getElementById('side-list').querySelectorAll('[data-side]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const def = makeSideJob(btn.dataset.side, rng);
        hideAllScreens(hud);
        game.mode = 'play';
        startMission(game.missions, scene, def, handleMissionEvent);
      });
    });
  }

  function buyProperty(id) {
    const prop = PROPERTIES.find((p) => p.id === id);
    if (!prop || game.missions.propertiesOwned.includes(id)) return;
    if (game.cash < prop.price) {
      showToast(hud, prop.name + ' costs ' + formatCash(prop.price) + ' — you are short.');
      return;
    }
    game.cash -= prop.price;
    game.missions.propertiesOwned.push(id);
    addNotification(hud, 'Property bought: ' + prop.name, 'gold');
    audio.playCash();
    writeSave(game, game.saveSlot);
    openJobs();
  }

  function openMap() {
    game.mode = 'map';
    showScreen(hud, 'map');
    document.getElementById('map-complete').textContent = 'Completion: ' + completePercent() + '%';
    document.getElementById('map-story').innerHTML = MISSIONS.map((m, i) => {
      const done = game.missions.completed.includes(m.id);
      const active = game.missions.active && game.missions.active.def.id === m.id;
      return `<div>${done ? '✓' : active ? '●' : '○'} ${i + 1}. ${m.title}</div>`;
    }).join('') + `<div>◆ Stashes ${game.missions.stashesFound}/${STASH_SPOTS.length}</div>`
      + PROPERTIES.map((p) => `<div>${game.missions.propertiesOwned.includes(p.id) ? '✓' : '○'} ${p.name}</div>`).join('');
    document.getElementById('map-stats').innerHTML = statsHtml();
    drawBigMap(hud, mapSnapshot());
  }

  function closeMap() {
    hideAllScreens(hud);
    game.mode = 'play';
  }

  function statsHtml() {
    const s = game.stats;
    const acc = s.shotsFired > 0 ? Math.round((s.shotsHit / s.shotsFired) * 100) : 0;
    return `<b>Cash earned:</b> ${formatCash(game.cashEarned)}<br>` +
      `<b>Jobs done:</b> ${game.missions.completed.length}/${MISSIONS.length} · <b>Side jobs:</b> ${game.missions.sideJobsDone}<br>` +
      `<b>Distance driven:</b> ${(game.stats.distanceDriven / 1000).toFixed(1)} km · <b>Cars stolen:</b> ${s.carsStolen}<br>` +
      `<b>Shots:</b> ${s.shotsHit}/${s.shotsFired} (${acc}%) · <b>Near misses:</b> ${s.nearMisses}<br>` +
      `<b>Best wanted:</b> ${game.bestWanted}★ · <b>Time played:</b> ${Math.floor(game.playSeconds / 60)} min<br>` +
      `<b>Skills:</b> Driving Lv ${game.skills.driving} · Shooting Lv ${game.skills.shooting} · Stamina Lv ${game.skills.stamina}<br>` +
      `<b>Completion:</b> ${completePercent()}%`;
  }

  function fillPauseStats() {
    document.getElementById('pause-stats').innerHTML = statsHtml();
  }

  function openGarage() {
    const car = game.car;
    if (!car) return;
    game.mode = 'garage';
    showScreen(hud, 'garage');
    car.upgrades = car.upgrades || { engine: 0, armor: 0, tires: 0 };
    const list = document.getElementById('garage-list');
    list.innerHTML = GARAGE_UPGRADES.map((u) => {
      const lvl = car.upgrades[u.id];
      const maxed = lvl >= u.max;
      return `<div class="shop-row"><div><b>${u.name} — Lv ${lvl}/${u.max}</b><br><span class="desc">${u.desc}</span></div>` +
        `<button class="shop-buy" data-upgrade="${u.id}" ${maxed ? 'disabled' : ''}>${maxed ? 'MAXED' : 'BUY ' + formatCash(u.price)}</button></div>`;
    }).join('') + `<div class="shop-row"><div><b>Repair</b><br><span class="desc">Fix the bodywork</span></div>` +
      `<button class="shop-buy" data-repair="1">REPAIR ${game.missions.propertiesOwned.includes('garage') ? 'FREE' : formatCash(repairCost(car))}</button></div>`
      + `<div class="shop-row"><div><b>Buy Mako Garage</b><br><span class="desc">Free repairs, forever</span></div>` +
      (game.missions.propertiesOwned.includes('garage')
        ? '<span>✓ OWNED</span>'
        : `<button class="shop-buy" data-buy-prop="garage">BUY ${formatCash(4000)}</button>`) + '</div>';
    document.getElementById('garage-respray').innerHTML =
      '<span style="align-self:center;font-weight:bold">Respray — $200:</span>' +
      RESPRAY_COLORS.map((c) => `<button class="swatch" data-color="${c}" style="background:#${c.toString(16).padStart(6, '0')}"></button>`).join('');
    list.querySelectorAll('[data-upgrade]').forEach((btn) => {
      btn.addEventListener('click', () => buyUpgrade(btn.dataset.upgrade));
    });
    list.querySelector('[data-repair]').addEventListener('click', () => { tryRepair(); openGarage(); });
    const buyProp = list.querySelector('[data-buy-prop]');
    if (buyProp) buyProp.addEventListener('click', () => { buyProperty('garage'); openGarage(); });
    document.getElementById('garage-respray').querySelectorAll('[data-color]').forEach((btn) => {
      btn.addEventListener('click', () => resprayCar(Number(btn.dataset.color)));
    });
  }

  function buyUpgrade(id) {
    const car = game.car;
    if (!car) return;
    const up = GARAGE_UPGRADES.find((u) => u.id === id);
    car.upgrades = car.upgrades || { engine: 0, armor: 0, tires: 0 };
    if (car.upgrades[id] >= up.max) return;
    if (game.cash < up.price) { showToast(hud, 'Not enough cash for ' + up.name + '.'); return; }
    game.cash -= up.price;
    car.upgrades[id] += 1;
    applyUpgrades(car);
    audio.playCash();
    addNotification(hud, up.name + ' → Lv ' + car.upgrades[id], 'gold');
    openGarage();
  }

  function applyUpgrades(car) {
    const u = car.upgrades || { engine: 0, armor: 0, tires: 0 };
    car.def = { ...VEHICLE_TYPES[car.type] };
    car.def.topSpeed = VEHICLE_TYPES[car.type].topSpeed * (1 + 0.08 * u.engine);
    car.def.turn = VEHICLE_TYPES[car.type].turn * (1 + 0.10 * u.tires);
    car.armorLevel = u.armor;
  }

  function resprayCar(color) {
    const car = game.car;
    if (!car) return;
    if (game.cash < 200) { showToast(hud, 'Respray is $200 — you are short.'); return; }
    game.cash -= 200;
    const bodyMat = car.mesh.userData.bodyMat;
    if (bodyMat) bodyMat.color.setHex(color);
    audio.playCash();
    showToast(hud, 'Respray done — looking fresh.');
  }

  function openGunshop() {
    game.mode = 'gunshop';
    showScreen(hud, 'gunshop');
    const list = document.getElementById('gunshop-list');
    list.innerHTML = GUNSHOP_ITEMS.map((item) => {
      const owned = item.id === 'ap' && player.weapon === WEAPONS.ap;
      return `<div class="shop-row"><div><b>${item.name}</b><br><span class="desc">${item.desc}</span></div>` +
        `<button class="shop-buy" data-item="${item.id}" ${owned ? 'disabled' : ''}>${owned ? 'OWNED' : 'BUY ' + formatCash(item.price)}</button></div>`;
    }).join('');
    list.querySelectorAll('[data-item]').forEach((btn) => {
      btn.addEventListener('click', () => buyGunshopItem(btn.dataset.item));
    });
  }

  function buyGunshopItem(id) {
    const item = GUNSHOP_ITEMS.find((i) => i.id === id);
    if (!item || game.cash < item.price) { showToast(hud, 'Not enough cash.'); return; }
    game.cash -= item.price;
    if (id === 'ammo') player.reserveAmmo += 24;
    else if (id === 'armor') game.armor = 100;
    else if (id === 'health') player.health = 100;
    else if (id === 'ap') { player.weapon = WEAPONS.ap; player.armed = true; }
    audio.playCash();
    addNotification(hud, 'Bought: ' + item.name, 'gold');
    openGunshop();
  }

  function renderSaveSlots() {
    const slots = listSlots();
    const wrap = document.getElementById('save-slots');
    wrap.innerHTML = [1, 2, 3].map((n) => {
      const s = slots[n];
      const label = s
        ? `${formatCash(s.cash)} · ${s.jobsDone}/${MISSIONS.length} jobs · ${new Date(s.savedAt).toLocaleDateString()}`
        : 'EMPTY SLOT';
      return `<button class="save-slot" data-slot="${n}"><b>SLOT ${n}</b> <span>${label}</span></button>`;
    }).join('');
    wrap.querySelectorAll('[data-slot]').forEach((btn) => {
      btn.addEventListener('click', () => startGame(Number(btn.dataset.slot)));
    });
  }

  function startGame(slot) {
    audio.unlockAudio();
    audio.startMusic();
    if (slot > 0) {
      const save = loadSave(slot);
      if (save) {
        game.saveSlot = slot;
        game.cash = save.cash;
        game.cashEarned = save.cashEarned || 0;
        game.missions.completed = save.completed;
        game.missions.nextIndex = save.nextIndex;
        game.missions.stashesFound = save.stashesFound || 0;
        game.missions.propertiesOwned = save.propertiesOwned || [];
        game.missions.sideJobsDone = save.sideJobsDone || 0;
        game.playSeconds = save.playSeconds;
        game.bestWanted = save.bestWanted;
        game.skills = save.skills || game.skills;
        game.skillXp = save.skillXp || game.skillXp;
      }
    } else {
      game.saveSlot = 1;
    }
    hideAllScreens(hud);
    game.mode = 'play';
    showToast(hud, 'Welcome to Coral Bay. Walk to Club Lumen and press E for work.', 6000);
    // First-time intro cutscene: the city introduces itself.
    if (!slot && !game._introPlayed) {
      game._introPlayed = true;
      playCutscene(INTRO_CUTSCENE);
    }
  }

  document.getElementById('btn-play').addEventListener('click', () => startGame(0));
  document.getElementById('btn-accept').addEventListener('click', () => {
    game.diag.push({ t: Math.round(game.elapsed * 10) / 10, ev: 'accept', mode: game.mode });
    const def = nextMissionDef(game.missions);
    hideAllScreens(hud);
    game.mode = 'play';
    if (def) {
      if (def.id === 'coralcrown') {
        playCutscene([
          { eye: { x: 60, y: 8, z: 10 }, focus: { x: 90, y: 8, z: -30 }, who: 'vera', name: 'Vera Solano', text: 'The bank. The vault. Five stars. This is the one they will write about.', dur: 3.0 },
          { eye: { x: 200, y: 30, z: -100 }, focus: { x: 415, y: 4, z: -60 }, who: 'vera', name: 'Vera Solano', text: 'Get across that bridge and the crown is yours.', dur: 2.6 },
        ], () => startMission(game.missions, scene, def, handleMissionEvent));
      } else {
        startMission(game.missions, scene, def, handleMissionEvent);
      }
    }
  });
  document.getElementById('btn-decline').addEventListener('click', () => {
    hideAllScreens(hud);
    game.mode = 'play';
  });
  document.getElementById('btn-resume').addEventListener('click', () => {
    hideAllScreens(hud);
    game.mode = 'play';
  });
  document.getElementById('btn-restart').addEventListener('click', () => {
    clearSave(game.saveSlot);
    location.reload();
  });
  document.getElementById('btn-quit-title').addEventListener('click', () => {
    writeSave(game, game.saveSlot);
    location.reload();
  });
  document.getElementById('btn-busted-ok').addEventListener('click', () => respawnAt(PLACES.club.x, PLACES.club.z + 16));
  document.getElementById('btn-wasted-ok').addEventListener('click', () => respawnAt(PLACES.hospital.x, PLACES.hospital.z + 14));
  document.getElementById('btn-complete-ok').addEventListener('click', () => {
    hideAllScreens(hud);
    game.mode = 'play';
  });
  document.getElementById('btn-jobs-close').addEventListener('click', () => {
    hideAllScreens(hud);
    game.mode = 'play';
  });
  document.getElementById('btn-map-close').addEventListener('click', closeMap);
  document.getElementById('btn-garage-close').addEventListener('click', () => {
    hideAllScreens(hud);
    game.mode = 'play';
  });
  document.getElementById('btn-gunshop-close').addEventListener('click', () => {
    hideAllScreens(hud);
    game.mode = 'play';
  });

  // ---------- per-frame simulation ----------
  function step(dt) {
    game.elapsed += dt;
    if (game.mode === 'play') game.playSeconds += dt;

    // Cutscene clock.
    if (game.cutscene) {
      game.cutscene.timer += dt;
      const s = game.cutscene.steps[game.cutscene.index];
      if (s && game.cutscene.timer >= s.dur) {
        game.cutscene.index += 1;
        applyCutsceneStep();
      }
    }

    // Day/night drifts slowly; weather rolls on a timer.
    if (!game.shotMode && game.mode !== 'cutscene') {
      game.timeOfDay = (game.timeOfDay + dt / 150) % 24;
      game.weatherTimer -= dt;
      if (game.weatherTimer <= 0) {
        game.weatherTimer = 60 + rng.next() * 70;
        const roll = rng.next();
        if (game.weather === 'clear') game.weather = roll < 0.62 ? 'clear' : roll < 0.88 ? 'rain' : 'storm';
        else if (game.weather === 'rain') game.weather = roll < 0.55 ? 'clear' : roll < 0.8 ? 'rain' : 'storm';
        else game.weather = roll < 0.5 ? 'rain' : 'clear';
        if (game.weather === 'storm') {
          game.lightningTimer = 4 + rng.next() * 6;
          showToast(hud, '⛈ Storm rolling in off the bay.');
        }
      }
    }
    // Lightning in a storm: a flash, then thunder.
    if (game.weather === 'storm') {
      game.lightningTimer -= dt;
      if (game.lightningTimer <= 0) {
        game.lightningTimer = 5 + rng.next() * 9;
        game.flashTimer = 0.16;
        audio.playThunder();
      }
    }
    if (game.flashTimer > 0) {
      game.flashTimer -= dt;
      world.flashLight.intensity = game.flashTimer > 0 ? 3.2 : 0;
    } else {
      world.flashLight.intensity = 0;
    }
    const timeBucket = Math.floor(game.timeOfDay * 24);
    if (timeBucket !== game._appliedBucket || game.weather !== game._appliedWeather) {
      game._appliedBucket = timeBucket;
      game._appliedWeather = game.weather;
      applyTimeOfDay(world, scene, game.timeOfDay, game.weather);
    }
    animateWorld(world, dt, game.elapsed, game.weather);

    const inPlay = game.mode === 'play';
    const pos = game.car ? { x: game.car.x, z: game.car.z } : { x: player.x, z: player.z };

    // Player / car.
    if (game.car) {
      const car = game.car;
      const prevX = car.x;
      const prevZ = car.z;
      driveVehicle(car, inPlay ? keys : new Set(), dt, world.colliders,
        (v, hitSpeed) => {
          if (hitSpeed > 8) {
            audio.playCrash();
            sparkBurst(particles, v.x, 1, v.z);
            addHeat(game.wanted, 2);
          }
        });
      car.mesh.position.y = car.type === 'boat'
        ? 0.3 + Math.sin(game.elapsed * 1.2) * 0.08
        : groundHeightAt(car.x, car.z);
      const driven = distance2D(prevX, prevZ, car.x, car.z);
      game.stats.distanceDriven += driven;
      if (Math.abs(car.speed) > 16) addSkillXp('driving', dt * 0.35);
      // Exhaust puffs on hard throttle; dust on sand.
      game.exhaustTimer -= dt;
      if (inPlay && keys.has('KeyW') && Math.abs(car.speed) > 3 && game.exhaustTimer <= 0) {
        game.exhaustTimer = 0.14;
        exhaustPuff(particles, car.x, 0.4, car.z, car.heading);
      }
      if (car.x > 285 && Math.abs(car.speed) > 8 && game.exhaustTimer <= 0) {
        game.exhaustTimer = 0.2;
        dustPuff(particles, car.x, 0.2, car.z);
      }
      // Near-miss bonus: fast pass beside a traffic car.
      if (Math.abs(car.speed) > 16 && game.nearMissCooldown <= 0) {
        for (const t of game.traffic) {
          if (t.dead || t.parked) continue;
          const d = distance2D(car.x, car.z, t.x, t.z);
          if (d > 2.6 && d < 4.6) {
            game.cash += 25;
            game.cashEarned += 25;
            game.stats.nearMisses += 1;
            game.nearMissCooldown = 3;
            showToast(hud, 'Near miss! +$25');
            audio.playCash();
            notifyNearMiss(game.missions);
            break;
          }
        }
      }
      // Car destroyed under the player.
      if (car.dead && !car.exploded) {
        car.exploded = true;
        explode(combat, car.x, car.z, { cars: [...game.vehicles, ...game.wanted.cops], peds: game.peds });
        damagePlayer(40);
        exitCar(true);
        player.x = car.x + 2;
        player.z = car.z + 2;
        addHeat(game.wanted, 10);
      }
      car.cameraYaw += angleDelta(car.cameraYaw, car.heading) * Math.min(1, dt * 1.1);
      audio.setEngine(Math.abs(car.speed) / car.def.topSpeed, inPlay);
    } else {
      updatePlayerOnFoot(player, inPlay ? keys : new Set(), dt, world,
        [...game.peds, ...game.footCops, ...game.rivals, ...game.vehicles.filter((v) => !v.dead)]);
      player.group.position.y = groundHeightAt(player.x, player.z)
        + (player.moving ? Math.abs(Math.sin(player.walkPhase)) * 0.07 : 0);
      audio.setEngine(0, false);
      if (inPlay && (keys.has('ShiftLeft') || keys.has('ShiftRight')) && player.moving) {
        addSkillXp('stamina', dt * 0.3);
      }
      // Run over by traffic (only while actually playing).
      if (inPlay) {
        for (const t of game.traffic) {
          if (t.dead || t.parked || Math.abs(t.speed) < 4) continue;
          if (distance2D(t.x, t.z, player.x, player.z) < 2.1) {
            damagePlayer(Math.abs(t.speed) * 1.6);
            player.x += (player.x - t.x) * 0.6;
            player.z += (player.z - t.z) * 0.6;
            audio.playCrash();
            break;
          }
        }
      }
    }
    if (game.nearMissCooldown > 0) game.nearMissCooldown -= dt;
    // Combat timers tick in every mode — the pistol cooldown used to freeze
    // while driving, so a drive-by could only ever fire once per car ride.
    if (player.punching > 0) player.punching -= dt;
    if (player.shootCooldown > 0) player.shootCooldown -= dt;

    // Traffic + collisions.
    for (const t of game.traffic) {
      updateTrafficCar(t, dt, world, rng, game.car, game.vehicles);
      t.mesh.position.y = groundHeightAt(t.x, t.z);
    }
    updateTrafficCollisions([...game.traffic, ...game.wanted.cops, ...(game.car ? [game.car] : [])],
      (v, rel) => { if (rel > 6) { audio.playCrash(); addHeat(game.wanted, 2); } });
    if (game.car) {
      for (const v of game.vehicles) {
        if (v === game.car || v.dead) continue;
        collideVehicles(game.car, v, (a, rel) => {
          if (rel > 6) { audio.playCrash(); sparkBurst(particles, game.car.x, 1, game.car.z); addHeat(game.wanted, 2); }
        });
      }
    }

    // Pedestrians.
    const threats = [];
    if (player.armed) threats.push({ x: player.x, z: player.z });
    for (const p of game.peds) {
      updatePedestrian(p, dt, world, threats, rng);
    }

    // Wanted + police.
    updateWanted(game.wanted, scene, world, rng, player, game.car, dt, game.elapsed, {
      onBusted: () => goBusted(),
      onRoadblock: () => showToast(hud, 'Roadblocks ahead — the CBPD is serious now.', 5000),
      footCops: game.footCops,
      onSpike: () => {
        showToast(hud, 'Spike strip! Tyres shredded — get to Mako Garage.', 5000);
        sparkBurst(particles, game.car.x, 0.6, game.car.z);
        audio.playCrash();
      },
    });
    for (const cop of game.wanted.cops) {
      cop.mesh.position.y = groundHeightAt(cop.x, cop.z);
    }
    if (game.wanted.level > game.bestWanted) game.bestWanted = game.wanted.level;
    audio.setSiren(game.wanted.level > 0 && inPlay);

    // Foot cops chase the hero on foot at 1 star and up.
    if (inPlay && !game.car && game.wanted.level >= 1 && game.footCops.length < 2) {
      const fresh = spawnFootCops(scene, world, rng, player.x, player.z, 2 - game.footCops.length);
      game.footCops.push(...fresh);
    }
    if (game.wanted.level === 0 || game.car) {
      for (const c of game.footCops) scene.remove(c.group);
      game.footCops = [];
    }
    if (game.copPunchCooldown > 0) game.copPunchCooldown -= dt;
    for (const cop of game.footCops) {
      updateFootCop(cop, dt, world, player, rng);
      if (distance2D(cop.x, cop.z, player.x, player.z) < 1.7 && game.copPunchCooldown <= 0) {
        game.copPunchCooldown = 1.1;
        damagePlayer(7);
        audio.playPunch();
        showToast(hud, 'CBPD officer is on you — run!', 2000);
      }
    }
    // Rivals chase and swing at the player.
    for (const rival of game.rivals) {
      if (rival.dead) continue;
      updateFootCop(rival, dt, world, player, rng);
      if (distance2D(rival.x, rival.z, player.x, player.z) < 1.7 && game.copPunchCooldown <= 0) {
        game.copPunchCooldown = 1.1;
        damagePlayer(7);
        audio.playPunch();
      }
    }

    // Missions.
    if (inPlay) {
      updateMission(game.missions, scene, dt, game.elapsed, pos, !!game.car,
        game.car ? game.car.type : null, handleMissionEvent, { rivals: game.rivals });
      game.cashPickups = updateCashPickups(game.cashPickups, scene, pos, dt, game.elapsed, (ev) => {
        if (ev.type === 'cash') { game.cash += ev.amount; game.cashEarned += ev.amount; }
        if (ev.type === 'toast') showToast(hud, ev.text);
        if (ev.type === 'stash') handleMissionEvent(ev);
      });
      game.stashes = updateCashPickups(game.stashes, scene, pos, dt, game.elapsed, (ev) => {
        if (ev.type === 'cash') { game.cash += ev.amount; game.cashEarned += ev.amount; }
        if (ev.type === 'toast') showToast(hud, ev.text);
        if (ev.type === 'stash') handleMissionEvent(ev);
      });
    }
    game.pickupRespawnTimer -= dt;
    if (game.pickupRespawnTimer <= 0) {
      game.pickupRespawnTimer = 55;
      const spot = world.pedSpawns[Math.floor(rng.next() * world.pedSpawns.length)];
      game.cashPickups.push(spawnCashPickup(scene, spot.x, spot.z));
    }

    // Health: slow regen after 10 clean seconds; wasted at zero.
    if (player.health < 100) {
      game.healthRegenTimer += dt;
      if (game.healthRegenTimer > 10) player.health = Math.min(100, player.health + dt * 3);
    } else {
      game.healthRegenTimer = 0;
    }
    if (player.health <= 0 && game.mode === 'play') {
      player.health = 0;
      goWasted();
    }

    updateCombat(combat, dt);
    updateParticles(particles, dt);

    // Autosave.
    game.saveTimer -= dt;
    if (game.saveTimer <= 0) {
      game.saveTimer = SAVE_EVERY_SECONDS;
      writeSave(game, game.saveSlot);
    }
  }

  game.step = step;

  // ---------- HUD snapshot ----------
  function updateHudFromState() {
    const objective = missionObjectiveText(game.missions);
    const target = missionTarget(game.missions);
    const focus = game.car || player;
    const camYaw = game.car ? game.car.cameraYaw : player.cameraYaw;
    let arrowAngle = null;
    let distance = null;
    if (target) {
      const bearing = Math.atan2(target.x - focus.x, target.z - focus.z);
      arrowAngle = -(bearing - camYaw);
      distance = distance2D(focus.x, focus.z, target.x, target.z);
    }
    const sunAngle = ((game.timeOfDay - 6) / 12) * Math.PI;
    const elev = Math.sin(sunAngle);
    const golden = elev > 0 && elev < 0.42;
    const night = elev <= 0.02;
    updateHud(hud, {
      wanted: game.wanted.level,
      timeOfDay: game.timeOfDay,
      weather: game.weather,
      golden, night,
      cash: game.cash,
      jobsDone: game.missions.completed.length,
      jobsTotal: MISSIONS.length,
      health: player.health,
      armor: game.armor,
      armed: player.armed && !game.car,
      weaponName: player.weapon.name,
      ammo: player.ammo,
      reserveAmmo: player.reserveAmmo,
      radio: RADIO_STATIONS[game.radioIndex],
      inCar: !!game.car,
      speedKmh: game.car ? vehicleSpeedKmh(game.car) : 0,
      carHealth: game.car ? (game.car.health / game.car.maxHealth) * 100 : 100,
      carName: game.car ? game.car.name : '',
      objective: objective ? { title: objective.title, text: objective.text, distance } : null,
      arrowAngle,
      mode: game.mode,
      policeUnits: getPoliceUnits(game.wanted, focus.x, focus.z),
      stashes: game.missions.stashesFound,
      stashTotal: STASH_SPOTS.length,
      skills: game.skills,
    });
    drawMinimap(hud, {
      avenues: AVENUES,
      streets: STREETS,
      playerX: focus.x,
      playerZ: focus.z,
      playerHeading: focus.heading,
      target,
      cops: game.wanted.cops.filter((c) => !c.dead),
      traffic: game.traffic.filter((t) => !t.dead),
      stashes: game.stashes.filter((s) => !s.taken).map((s) => ({ x: s.x, z: s.z })),
    });
  }

  function mapSnapshot() {
    const focus = game.car || player;
    return {
      avenues: AVENUES,
      streets: STREETS,
      playerX: focus.x,
      playerZ: focus.z,
      playerHeading: focus.heading,
      target: missionTarget(game.missions),
      cops: game.wanted.cops.filter((c) => !c.dead),
      stashes: game.stashes.filter((s) => !s.taken).map((s) => ({ x: s.x, z: s.z })),
      properties: PROPERTIES.map((p) => ({ x: p.x, z: p.z, owned: game.missions.propertiesOwned.includes(p.id) })),
      places: Object.values(PLACES),
    };
  }

  // ---------- main loop ----------
  let last = performance.now();
  let accumulator = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    if (game.mode !== 'paused') {
      accumulator += dt;
      let guard = 0;
      while (accumulator >= STEP && guard < 5) {
        step(STEP);
        accumulator -= STEP;
        guard += 1;
      }
      if (guard >= 5) accumulator = 0;
    }
    if (game.cameraMode === 'follow') {
      updateCamera(camera, player, game.car, dt, world);
    } else if (game.cinematicEye && game.cinematicFocus) {
      setCinematicCamera(camera, game.cinematicFocus.x, game.cinematicFocus.y, game.cinematicFocus.z,
        game.cinematicEye.x, game.cinematicEye.y, game.cinematicEye.z, world);
    }
    updateHudFromState();
    renderer.render(scene, camera);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---------- boot ----------
  resetWorld();
  renderSaveSlots();
  showScreen(hud, 'title');
  game.mode = 'title';
  applyTimeOfDay(world, scene, game.timeOfDay, game.weather);
  updateCamera(camera, player, null, 0.5, world);
  renderer.render(scene, camera);

  if (SHOT) {
    // Staged screenshot: run the real sim, then freeze on the frame. A shot
    // that opens a screen (garage / map) keeps its modal; the others hide
    // the title so the HUD reads.
    const staged = stageShot(SHOT, game);
    if (staged.screen === 'play') {
      game.mode = 'play';
      hideAllScreens(hud);
      updateHudFromState();
      renderer.render(scene, camera);
    }
    document.title = 'NEON BAY — shot staged: ' + SHOT;
  } else {
    requestAnimationFrame(frame);
  }

  // Debug handle for the playtest (read-only snapshot + the live game).
  window.__nb = {
    game,
    places: PLACES,
    snapshot() {
      const focus = game.car || player;
      const target = missionTarget(game.missions);
      return {
        mode: game.mode,
        timeOfDay: Number(game.timeOfDay.toFixed(2)),
        weather: game.weather,
        cash: Math.round(game.cash),
        wanted: game.wanted.level,
        heat: Math.round(game.wanted.heat),
        keys: [...game.input.keys],
        playerSpeed: Math.round(player.speed * 10) / 10,
        diag: game.diag.slice(-12),
        health: Math.round(player.health),
        armor: Math.round(game.armor),
        playerX: Number(player.x.toFixed(1)),
        playerZ: Number(player.z.toFixed(1)),
        carX: game.car ? Number(game.car.x.toFixed(1)) : null,
        carZ: game.car ? Number(game.car.z.toFixed(1)) : null,
        heading: Number(player.heading.toFixed(2)),
        cameraYaw: Number(player.cameraYaw.toFixed(2)),
        inCar: !!game.car,
        carType: game.car ? game.car.type : null,
        speedKmh: game.car ? Math.round(vehicleSpeedKmh(game.car)) : 0,
        carHealth: game.car ? Math.round(game.car.health) : null,
        armed: player.armed,
        ammo: player.ammo,
        mission: game.missions.active ? game.missions.active.def.id : null,
        missionStage: game.missions.active ? game.missions.active.stageIndex : null,
        jobsDone: game.missions.completed.length,
        cops: game.wanted.cops.length,
        heli: !!game.wanted.heli,
        boat: !!game.wanted.boat,
        traffic: game.traffic.length,
        peds: game.peds.length,
        stashesFound: game.missions.stashesFound,
        skills: { ...game.skills },
        target: target ? { x: Number(target.x.toFixed(1)), z: Number(target.z.toFixed(1)) } : null,
        title: document.title,
      };
    },
  };
  return game;
}

createGame();
