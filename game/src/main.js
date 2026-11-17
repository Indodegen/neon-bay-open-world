// NEON BAY — bootstrap, game loop, state machine, save, enter/exit, shooting, pause.
import * as THREE from 'three';
import { makeRng, pick, range } from './random.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { buildCity } from './city.js';
import { Player } from './player.js';
import { Car, CAR_COLORS } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { Combat } from './combat.js';
import { Hud } from './hud.js';
import { FollowCamera } from './camera.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(location.search);
const shotNum = Number(params.get('shot') || 0);
const rng = makeRng(shotNum > 0 ? 1000 + shotNum : 20261117);

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2000);

buildCity(scene, rng);
const input = new Input(canvas);
const audio = new AudioEngine();
const player = new Player(scene);
const traffic = new Traffic(scene, rng);
const police = new Police(scene, rng);
const missions = new Missions(scene);
const combat = new Combat(scene, rng);
const hud = new Hud();
const follow = new FollowCamera(camera);

// Parked cars along the avenues — the ones Jax can steal.
const parked = [];
const parkSpots = [[8, -40], [8, 60], [-8, 120], [60, 8], [-60, -8], [120, -8], [-120, 8], [8, -160], [172, 8], [-172, -8]];
for (const [x, z] of parkSpots) {
  const c = new Car(scene, x, z, (rng() < 0.5 ? 0 : Math.PI / 2) + range(rng, -0.1, 0.1), pick(rng, CAR_COLORS));
  parked.push(c);
}
function allCars() { return [...parked, ...traffic.cars]; }

const game = { player, traffic, police, missions, combat, audio, scene, camera, follow };

let state = 'menu'; // menu | playing | paused | over
let saveTimer = 0;

function saveGame() {
  try {
    localStorage.setItem('neonbay-save', JSON.stringify({
      cash: player.cash, mission: missions.index,
      x: player.mesh.position.x, z: player.mesh.position.z, health: player.health,
    }));
  } catch { /* storage unavailable */ }
}
function loadGame() {
  try {
    const s = JSON.parse(localStorage.getItem('neonbay-save') || 'null');
    if (!s) return false;
    player.cash = s.cash || 0; missions.index = s.mission || 0; player.health = s.health || 100;
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

document.getElementById('play-btn').addEventListener('click', () => { loadGame(); startGame(); });
document.getElementById('resume-btn').addEventListener('click', () => { state = 'playing'; document.getElementById('pause').style.display = 'none'; });
document.getElementById('retry-btn').addEventListener('click', () => {
  player.health = 100; police.clear();
  player.mesh.position.set(0, 0, 8);
  if (player.inCar) { player.inCar.speed = 0; player.exitCar(); }
  startGame();
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Screenshot staging: skip the menu, drop straight into a live scene.
if (shotNum >= 1 && shotNum <= 4) {
  document.getElementById('menu').classList.add('hidden');
  hud.show();
  state = 'playing';
  stageShot(shotNum, game);
}

const clock = new THREE.Clock();
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
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
  // Pause / mute keys.
  if (input.pressed('KeyP')) {
    state = 'paused';
    document.getElementById('pause-stats').textContent =
      `Cash $${player.cash.toLocaleString('en-US')} · Mission ${Math.min(missions.index + 1, 3)} of 3 · Wanted ${'★'.repeat(police.wanted) || 'clean'}`;
    document.getElementById('pause').style.display = 'flex';
  }
  if (input.pressed('KeyM')) audio.toggleMute();
  if (input.pressed('KeyE')) {
    if (player.inCar) { player.exitCar(); audio.blip(440, 0.08); }
    else {
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

  // Shooting: click fires from the player toward where the camera looks.
  if (input.consumeClick() && !player.inCar) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
    const origin = player.mesh.position.clone(); origin.y = 1.4;
    combat.shoot(origin, dir, player, audio);
  }

  // Update the world.
  if (player.inCar) {
    player.inCar.update(dt, input);
    if (Math.abs(player.inCar.speed) > 8) police.addHeat(dt * 1.5); // speeding adds heat
  } else {
    player.update(dt, input, follow.yaw);
  }
  traffic.update(dt, player.mesh.position);
  combat.update(dt, player, audio);
  const busted = police.update(dt, player, audio);
  const ev = missions.update(dt, game);
  if (ev) { hud.showToast(ev.text); saveGame(); }
  if (player.health <= 0) gameOver('wasted');
  else if (busted) gameOver('busted');

  // Camera + engine sound follow the player or the car.
  const targetPos = player.inCar ? player.inCar.mesh.position : player.mesh.position;
  const targetAngle = player.inCar ? player.inCar.angle : player.angle;
  follow.update(dt, input, targetPos, targetAngle, !!player.inCar);
  audio.setEngine(player.inCar ? Math.abs(player.inCar.speed) / player.inCar.maxSpeed : 0, !!player.inCar);

  saveTimer += dt;
  if (saveTimer > 10) { saveTimer = 0; saveGame(); }
  hud.update(dt, game);
  renderer.render(scene, camera);
}
tick();
