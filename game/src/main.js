// NEON BAY — main.js
// Boot: renderer, camera, game instance, the frame loop and the ?shot=
// deterministic staging hook. Everything else lives in the other modules.

import { createGame } from './game.js';

const params = new URLSearchParams(location.search);
const shot = params.get('shot');
const seed = Number(params.get('seed') || 1);

function boot() {
  const canvasHost = document.getElementById('app');
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  canvasHost.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1600);
  camera.position.set(-30, 8, 130);

  const game = createGame();
  game.init(renderer, camera);
  window.__NB = game.debug;
  window.__game = game;

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Deterministic shot staging: ?shot=cover|night|garage|map
  let staged = false;
  let stagedAt = 0;
  window.__wd = { fires: 0, runs: 0, steps: 0, lastGap: 0 };
  let last = performance.now();
  let lastFrame = performance.now();
  let frames = 0;
  function tick(now, render = true, dtOverride) {
    const dt = dtOverride !== undefined ? dtOverride : Math.min(0.1, (now - last) / 1000 || 0.016);
    last = now; lastFrame = now;
    try {
      game.step(dt);
    } catch (err) {
      console.error('NEON BAY step error:', err);
      window.__stepError = String(err && err.stack || err);
    }
    if (render) renderer.render(game.scene, camera);
    frames++;
    if (shot && !staged && frames > 45) {
      staged = true;
      stagedAt = performance.now();
      try {
        game.stageShot(shot);
        window.__shotStaged = shot;
      } catch (err) {
        console.error('shot staging error:', err);
        window.__shotError = String(err);
      }
      // Let the staged scene settle (dialog, rain, HUD) before screenshots.
      setTimeout(() => { window.__shotReady = true; }, shot === 'map' ? 1200 : 2500);
    }
    if (frames >= 30 && !window.__booted) window.__booted = true;
  }
  function loop(now) { tick(now); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
  // Watchdog: headless Chrome sometimes starves requestAnimationFrame
  // (BeginFrame production ~0.4 Hz with no visible surface). If no frame
  // has run for 400 ms, drive the loop from a timer until rAF resumes.
  // Measured 2026-11-18: the 100 ms timer itself is throttled to ~1 Hz
  // AND its fires line up right after rAF ticks, so "time since last
  // frame" is almost always < 400 ms when the timer runs and a gap-based
  // watchdog never fires. So this watches the real deficit instead:
  // wall-clock time since boot minus game time accumulated in step().
  // Each fire closes the whole deficit with fixed 0.1 s steps and a
  // single render. On a healthy machine rAF keeps game time current, the
  // deficit stays ~0 and this never fires, so normal play is untouched.
  const wallStart = performance.now();
  setInterval(() => {
    const now = performance.now();
    window.__wd.fires++;
    const deficit = (now - wallStart) / 1000 - game.time;
    window.__wd.lastGap = Math.round(deficit * 1000);
    if (deficit > 0.4) {
      // Timer wakeups arrive in bursts separated by long silences, so one
      // fire must close the whole deficit, not a fixed slice of it: up to
      // 200 fixed 0.1 s steps (20 s of game time). Cost is ~0.3-3 ms a
      // step and only lands on wakeups that would otherwise idle.
      const steps = Math.max(1, Math.min(200, Math.ceil(deficit / 0.1)));
      window.__wd.runs++;
      window.__wd.steps += steps;
      for (let i = 0; i < steps; i++) tick(now, false, 0.1);
      tick(now, true);
      lastFrame = now;
    }
    if (staged && !window.__shotReady && performance.now() - stagedAt > 2500) window.__shotReady = true;
  }, 100);

  // Expose a tiny error surface for the lab harness.
  window.addEventListener('error', (e) => { window.__pageError = String(e.message); });
  window.addEventListener('unhandledrejection', (e) => { window.__pageError = String(e.reason); });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
