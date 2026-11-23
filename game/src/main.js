// NEON BAY — bootstrap, game loop, state machine, save, enter/exit, shooting,
// pause. Round-6 flow is preserved: same states, same save key, same mission
// rules. Round 7 adds weather, weapons, radio, map, garage, fuel, bank/ATM,
// headlight spotlight, mission dialogs, and frozen staged shots.
import * as THREE from 'three';
import { makeRng, pick, range } from './random.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { buildCity } from './city.js';
import { Weather } from './weather.js';
import { Player } from './player.js';
import { Car, CAR_COLORS } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { Combat, WEAPONS } from './combat.js';
import { Hud } from './hud.js';
import { FollowCamera } from './camera.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(location.search);
const shotNum = Number(params.get('shot') || 0);
const frozen = shotNum >= 1 && shotNum <= 4; // staged shots: render, don't play
const rng = makeRng(shotNum > 0 ? 1000 + shotNum : 20261117);

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
// 1.18 (was 1.12): a touch more exposure so night scenes keep their shadows
// without crushing the car and road to black. Sunset shots stay in range.
renderer.toneMappingExposure = 1.18;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2000);

const city = buildCity(scene, rng);
const input = new Input(canvas);
const audio = new AudioEngine();
const player = new Player(scene);
player.armor = 0;
const weather = new Weather(scene, city,
  () => (player.inCar ? player.inCar.mesh.position : player.mesh.position));
const traffic = new Traffic(scene, rng);
const police = new Police(scene, rng);
const missions = new Missions(scene);
const combat = new Combat(scene, rng);
const hud = new Hud();
const follow = new FollowCamera(camera);

// One shared headlight spotlight: it follows the player's car at night.
// Bright + wide on purpose — in the rain-night shot this is what makes the
// road ahead readable. (Was intensity 5 / distance 48: the pool of light
// barely registered and the car read as a black blob.)
const carSpot = new THREE.SpotLight(0xfff2b0, 0, 80, 0.62, 0.45, 1.0);
scene.add(carSpot); scene.add(carSpot.target);

// Parked cars along the avenues — the ones Jax can steal.
const parked = [];
const parkSpots = [[8, -40], [8, 60], [-8, 120], [60, 8], [-60, -8], [120, -8], [-120, 8], [8, -160], [172, 8], [-172, -8]];
for (const [x, z] of parkSpots) {
  const c = new Car(scene, x, z, (rng() < 0.5 ? 0 : Math.PI / 2) + range(rng, -0.1, 0.1), pick(rng, CAR_COLORS));
  parked.push(c);
}
function allCars() { return [...parked, ...traffic.cars]; }

const game = { player, traffic, police, missions, combat, audio, scene, camera, follow, weather, city, hud };
game.bank = 2500;
game.fuel = 100;

const ATMS = [[8, 52], [-52, 8]];
const GAS_STATION = { x: 285, z: -150, r: 12 };
let refuelCharged = false;
let outOfFuelToasted = false;
let lastMissionIndex = 0;

const DIALOGS = [
  ['rosa', "Jax. You're out. The city forgot you — time to remind it."],
  ['rosa', "The GT's waiting at the beach. Don't scratch the paint. Actually — scratch it. It's stolen."],
  ['rosa', 'Harbor warehouse. Three Vipers. Make it loud.'],
  ['lucia', "Pier's quiet tonight. Keep it that way, Jax."],
  ['rosa', 'The Sunset GT. Downtown tower. Take it.'],
  ['dex', "Bring her to my lift and I'll make her fly."],
  ['rosa', 'Viper nest at the harbor. Four guns. No witnesses.'],
  ['rosa', 'Six tapes. I hid them where the cops never look.'],
  ['rosa', 'Run the beach with the heat on. Make them chase.'],
  ['preacher', 'Cortez owns that plaza. Take it back, brother.'],
  ['lucia', 'Last ferry, Jax. The case, the pier, dawn.'],
  ['rosa', 'The tower, Jax. The whole city watches. Make it count.'],
];

let state = 'menu'; // menu | playing | paused | over
let saveTimer = 0;

function saveGame() {
  try {
    localStorage.setItem('neonbay-save', JSON.stringify({
      cash: player.cash, bank: game.bank, fuel: game.fuel, armor: player.armor,
      mission: missions.index,
      x: player.mesh.position.x, z: player.mesh.position.z, health: player.health,
    }));
  } catch { /* storage unavailable */ }
}
function loadGame() {
  try {
    const s = JSON.parse(localStorage.getItem('neonbay-save') || 'null');
    if (!s) return false;
    player.cash = s.cash || 0; game.bank = s.bank ?? 2500; game.fuel = s.fuel ?? 100;
    player.armor = s.armor || 0;
    missions.index = s.mission || 0; player.health = s.health || 100;
    player.mesh.position.set(s.x || 0, 0, s.z || 8);
    return true;
  } catch { return false; }
}

function startGame() {
  audio.ensure();
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('pause').style.display = 'none';
  document.getElementById('gameover').style.display = 'none';
  hud.show();
  state = 'playing';
  const p = player.inCar ? player.inCar.mesh.position : player.mesh.position;
  follow.snap(p, player.angle, !!player.inCar);
  lastMissionIndex = missions.index;
  missions.armCombatMission(game);
  if (missions.index === 0) hud.showDialog(...DIALOGS[0], 6000, true);
}
function gameOver(kind) {
  state = 'over';
  saveGame();
  document.getElementById('over-text').textContent =
    kind === 'busted' ? 'The Coral Bay PD caught you. Your crew posts bail — but the heat stays.'
      : 'Jax is down. Rosa Vega sends a crew to drag you out of the gutter.';
  document.getElementById('gameover').style.display = 'flex';
  hud.hide();
}
function nearestCar(maxDist) {
  const pp = player.mesh.position;
  let best = null, bd = maxDist;
  for (const c of allCars()) {
    const d = Math.hypot(c.mesh.position.x - pp.x, c.mesh.position.z - pp.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
function nearestAtm(maxDist) {
  const pp = player.mesh.position;
  for (const [x, z] of ATMS) {
    if (Math.hypot(x - pp.x, z - pp.z) < maxDist) return [x, z];
  }
  return null;
}

document.getElementById('play-btn').addEventListener('click', () => { loadGame(); startGame(); });
document.getElementById('resume-btn').addEventListener('click', () => { state = 'playing'; document.getElementById('pause').style.display = 'none'; });
document.getElementById('retry-btn').addEventListener('click', () => {
  player.health = 100; police.clear();
  player.mesh.position.set(0, 0, 8);
  if (player.inCar) { player.inCar.speed = 0; player.exitCar(); }
  startGame();
});
// Tab opens the map — stop the browser from moving focus instead.
addEventListener('keydown', (e) => { if (e.code === 'Tab') e.preventDefault(); });

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Debug handle for automated verification (mission playthroughs, shot checks).
// Must be set BEFORE staging: stageShot flips __shotReady to true.
window.__game = game;
window.__shotReady = false;

// Screenshot staging: skip the menu, drop straight into a live scene.
if (frozen) {
  document.getElementById('menu').classList.add('hidden');
  hud.show();
  state = 'playing';
  stageShot(shotNum, game);
  lastMissionIndex = missions.index;
}

const clock = new THREE.Clock();
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  city.update(dt);
  weather.update(dt);
  if (state !== 'playing') {
    // Menu backdrop: slow orbit around the tower so the title screen is alive.
    if (state === 'menu') {
      const t = clock.elapsedTime * 0.05;
      camera.position.set(Math.sin(t) * 120, 55, Math.cos(t) * 120);
      camera.lookAt(-60, 30, -60);
    }
    renderer.render(scene, camera);
    return;
  }
  if (!frozen) {
    // Pause / mute / radio / weapons / map / garage keys.
    if (input.pressed('KeyP')) {
      state = 'paused';
      document.getElementById('pause-stats').textContent =
        `Cash $${player.cash.toLocaleString('en-US')} · Bank $${game.bank.toLocaleString('en-US')} · Mission ${Math.min(missions.index + 1, 12)} of 12 · Tapes ${missions.tapesCollected}/24 · Wanted ${'★'.repeat(police.wanted) || 'clean'}`;
      document.getElementById('pause').style.display = 'flex';
    }
    if (input.pressed('KeyM')) audio.toggleMute();
    if (input.pressed('KeyQ')) hud.cycleRadio();
    if (input.pressed('KeyT')) {
      // Side jobs: T cycles taxi → delivery → race. Each pays cash on arrival
      // and the marker swaps back to the story mission when it is done.
      const kinds = ['taxi', 'delivery', 'race'];
      game.sideJobCycle = ((game.sideJobCycle ?? -1) + 1) % kinds.length;
      const msg = missions.startSideJob(kinds[game.sideJobCycle], game);
      if (msg) hud.showToast(msg, 2600);
    }
    if (input.pressed('Digit1') && combat.switchWeapon(0)) hud.showToast('PISTOL — ' + combat.ammo + ' / ' + combat.ammoReserve, 1400);
    if (input.pressed('Digit2') && combat.switchWeapon(1)) hud.showToast('SMG — ' + combat.ammo + ' / ' + combat.ammoReserve, 1400);
    if (input.pressed('Digit3') && combat.switchWeapon(2)) hud.showToast('RIFLE — ' + combat.ammo + ' / ' + combat.ammoReserve, 1400);
    if (input.pressed('KeyR')) {
      if (combat.ammoReserve <= 0 && combat.ammo < combat.weapon.mag) hud.showToast('NO AMMO — FIND MORE', 1600);
      else combat.reload();
    }
    if (input.pressed('Tab')) {
      if (hud.mapScreen.classList.contains('hidden')) hud.showMap(game);
      else hud.hideMap();
    }
    if (input.pressed('KeyG')) {
      if (hud.garagePanel.classList.contains('hidden')) hud.showGarage(game);
      else hud.hideGarage();
    }
    if (input.pressed('KeyE')) {
      if (player.inCar) { player.exitCar(); audio.blip(440, 0.08); }
      else if (nearestAtm(3.5) && player.cash > 0) {
        // ATM: deposit all cash to the bank.
        game.bank += player.cash;
        hud.showToast(`DEPOSITED $${player.cash.toLocaleString('en-US')} — BANK $${game.bank.toLocaleString('en-US')}`, 2400);
        player.cash = 0;
        audio.cash();
      } else {
        const car = nearestCar(4.5);
        if (car) {
          player.enterCar(car);
          police.addHeat(12); // stealing a car is a crime
          hud.showToast(`STOLE THE ${car.name.toUpperCase()}`, 1800);
          audio.blip(520, 0.1, 'square', 0.15);
        }
      }
    }
    if (input.pressed('KeyF')) combat.punch(player, audio);

    // Shooting: click fires; SMG keeps firing while the mouse is held.
    const wantShoot = input.consumeClick() || (combat.weapon.auto && input.mouseDown);
    if (wantShoot && !player.inCar) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
      const origin = player.mesh.position.clone(); origin.y = 1.4;
      combat.shoot(origin, dir, player, audio);
      traffic.fleeFrom(player.mesh.position.x, player.mesh.position.z, 20);
    }

    // Update the world.
    if (player.inCar) {
      player.inCar.update(dt, input);
      if (Math.abs(player.inCar.speed) > 8) police.addHeat(dt * 1.5); // speeding adds heat
      // Fuel: drains with speed; empty tank caps the car at a crawl.
      if (Math.abs(player.inCar.speed) > 1) game.fuel = Math.max(0, game.fuel - dt * (Math.abs(player.inCar.speed) / player.inCar.maxSpeed) * 0.5);
      if (game.fuel <= 0) {
        player.inCar.speed = Math.min(player.inCar.speed, 8);
        if (!outOfFuelToasted) { outOfFuelToasted = true; hud.showToast('OUT OF FUEL — FIND A GAS STATION', 3000); }
      } else outOfFuelToasted = false;
      // Gas station on the beach road: drive onto the pad to refuel ($50).
      const cp = player.inCar.mesh.position;
      if (Math.hypot(cp.x - GAS_STATION.x, cp.z - GAS_STATION.z) < GAS_STATION.r) {
        if (game.fuel < 100) {
          if (!refuelCharged && player.cash >= 50) {
            player.cash -= 50; refuelCharged = true;
            hud.showToast('REFUELING — $50', 2000);
          }
          game.fuel = Math.min(100, game.fuel + dt * 30);
        }
      } else refuelCharged = false;
    } else {
      player.update(dt, input, follow.yaw);
    }
    traffic.update(dt, player.mesh.position);
    combat.update(dt, player, audio);
    const busted = police.update(dt, player, audio);
    const ev = missions.update(dt, game);
    if (ev) { hud.showToast(ev.text); saveGame(); }
    if (missions.index !== lastMissionIndex) {
      lastMissionIndex = missions.index;
      const d = DIALOGS[missions.index];
      if (d) hud.showDialog(d[0], d[1], 5200, missions.index === 0 || missions.index === 11);
      missions.armCombatMission(game);
    }
    missions.stats.takedowns = combat.takedowns;
    if (player.health <= 0) gameOver('wasted');
    else if (busted) gameOver('busted');

    saveTimer += dt;
    if (saveTimer > 10) { saveTimer = 0; saveGame(); }
  }

  // Camera + engine sound follow the player or the car.
  const targetPos = player.inCar ? player.inCar.mesh.position : player.mesh.position;
  const targetAngle = player.inCar ? player.inCar.angle : player.angle;
  follow.update(dt, input, targetPos, targetAngle, !!player.inCar);
  audio.setEngine(player.inCar ? Math.abs(player.inCar.speed) / player.inCar.maxSpeed : 0, !!player.inCar);

  // Headlight spotlight: one light, only at night, only on the player's car.
  // Strong enough to throw a visible pool of light 30+ units down the road.
  if (player.inCar && weather.isNight) {
    const c = player.inCar;
    const fx = Math.sin(c.angle), fz = Math.cos(c.angle);
    carSpot.position.set(c.mesh.position.x + fx * 2, 1.5, c.mesh.position.z + fz * 2);
    carSpot.target.position.set(c.mesh.position.x + fx * 34, 0, c.mesh.position.z + fz * 34);
    carSpot.intensity = 18;
    c.setLights(true);
  } else {
    carSpot.intensity = 0;
    if (player.inCar) player.inCar.setLights(false);
  }

  hud.update(dt, game);
  renderer.render(scene, camera);
}
tick();
