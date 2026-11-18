// NEON BAY — missions.js
// The 12-mission story chain for fixer Vera Solano plus side jobs, neon
// stashes, street-cash pickups and near-miss bonuses. Stage machine rules:
//  - goto arrival radius (6 m driving / 4 m on foot) is SMALLER than the
//    stage trigger radius, so a parked car can never sit in a dead band.
//  - drive legs always re-route through grid waypoints from the CURRENT
//    position (never a straight diagonal across building blocks).

import { MISSIONS, SIDE_JOBS, STASHES } from './config.js';
import { dist2d, gridRoute, clamp } from './util.js';

export function createMissions() {
  return {
    list: MISSIONS,
    current: null,      // {def, stageIdx, stage, timer, progress, route, routeIdx, targets[]}
    completed: [],      // mission ids
    stashFound: new Set(),
    job: null,          // active side job {def, stage, timer, ...}
    nearMissT: 0,
    cashPickups: [],    // {x,z,mesh,amount,taken}
  };
}

export function startMission(M, id, game) {
  const def = MISSIONS.find(m => m.id === id);
  if (!def) return false;
  M.current = { def, stageIdx: 0, stage: null, timer: 0, progress: 0, route: null, routeIdx: 0, targets: [] };
  enterStage(M, game);
  game.hud.notify(`MISSION START — ${def.name}`, def.blurb);
  game.audio.mission();
  return true;
}

function enterStage(M, game) {
  const cur = M.current;
  const st = cur.def.stages[cur.stageIdx];
  if (!st) { completeMission(M, game); return; }
  cur.stage = { ...st };
  cur.timer = 0; cur.progress = 0; cur.route = null; cur.routeIdx = 0;
  // Spawn stage targets (collect/eliminate markers). Each target is nudged
  // to the nearest open ground so a marker can never land inside a building
  // where the player could not reach it.
  clearTargets(game);
  if (st.type === 'collect' || st.type === 'eliminate') {
    for (let i = 0; i < (st.n || 1); i++) {
      const a = (i / Math.max(1, st.n || 1)) * Math.PI * 2;
      const pt = nearestOpen(game, st.x + Math.cos(a) * (8 + i * 4), st.z + Math.sin(a) * (8 + i * 4));
      const mesh = game.spawnMarker(pt.x, pt.z, st.type === 'eliminate' ? 0xff3322 : 0xffd166);
      cur.targets.push({ x: pt.x, z: pt.z, mesh, done: false });
    }
  }
  if (st.type === 'steal') {
    const pt = nearestOpen(game, st.x, st.z);
    game.spawnMissionVehicle(st.vehicle || 'sports', pt.x, pt.z);
  }
  if (st.type === 'race') {
    // Mission 5 "Bridge Run": one lap down the bay bridge. (The side-job
    // street race uses startStreetRace instead.)
    game.startBridgeRace();
  }
  game.hud.setObjective(cur.stage.label);
  game.hud.notify('OBJECTIVE', cur.stage.label);
}

// Nearest point to (x, z) the player can actually stand on: spiral out in
// 4 m steps (up to ~28 m) until world.blocked() clears.
function nearestOpen(game, x, z) {
  if (!game.world.blocked(x, z, 1)) return { x, z };
  for (let r = 4; r <= 28; r += 4) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const nx = x + Math.cos(a) * r, nz = z + Math.sin(a) * r;
      if (!game.world.blocked(nx, nz, 1)) return { x: nx, z: nz };
    }
  }
  return { x, z };
}

export function clearTargets(game) {
  const cur = game.M.current;
  if (!cur) return;
  for (const t of cur.targets || []) if (t.mesh) game.scene.remove(t.mesh);
  cur.targets = [];
}

function completeMission(M, game) {
  const cur = M.current;
  clearTargets(game);
  M.completed.push(cur.def.id);
  game.state.cash += cur.def.pay;
  game.state.stats.missionsDone++;
  game.hud.showMissionComplete(cur.def.name, cur.def.pay);
  game.audio.cash();
  game.hud.notify('MISSION PASSED', `${cur.def.name} — ${'$' + cur.def.pay.toLocaleString('en-US')}`);
  M.current = null;
  game.hud.setObjective('Visit Vera Solano for the next job');
  // Unlocks.
  if (cur.def.id === 3) game.hud.notify('UNLOCKED', 'Garage upgrades available at Neon Garage');
  if (cur.def.id === 6) game.hud.notify('UNLOCKED', 'Side job: Street Race');
  if (cur.def.id === 9) game.hud.notify('UNLOCKED', 'Boat handling improved');
  if (cur.def.id === 12) game.hud.notify('STORY COMPLETE', 'Coral Bay is yours, boss.');
}

function nextStage(M, game) {
  const cur = M.current;
  cur.stageIdx++;
  if (cur.stageIdx >= cur.def.stages.length) completeMission(M, game);
  else enterStage(M, game);
}

// Called every frame from the main step(). Handles ALL stage types.
// `pos` is the player's CURRENT position (car position when driving —
// never a stale on-foot position), which is what fixes the old nav bug.
export function stepMissions(M, game, dt, pos) {
  const cur = M.current;
  if (!cur || !cur.stage) return;
  const st = cur.stage;
  const px = pos.x, pz = pos.z;
  const driving = !!game.player.vehicle;
  const arriveR = driving ? 6 : 4;   // smaller than trigger radius below
  const triggerR = 11;

  if (st.type === 'goto') {
    // Route via grid waypoints from the current position; recompute if the
    // player re-routes (new car, new position) — never a straight diagonal.
    if (!cur.route || cur.routeStale) {
      cur.route = gridRoute(px, pz, st.x, st.z);
      cur.routeIdx = 0; cur.routeStale = false;
    }
    const wp = cur.route[Math.min(cur.routeIdx, cur.route.length - 1)];
    const dWp = dist2d(px, pz, wp.x, wp.z);
    if (dWp < 7 && cur.routeIdx < cur.route.length - 1) cur.routeIdx++;
    const d = dist2d(px, pz, st.x, st.z);
    game.hud.setDistance(d);
    if (d < arriveR) nextStage(M, game);
    else if (d < triggerR && !driving) nextStage(M, game);
  } else if (st.type === 'collect') {
    let remaining = 0;
    for (const t of cur.targets) {
      if (!t.done && dist2d(px, pz, t.x, t.z) < 3.2) {
        t.done = true;
        game.scene.remove(t.mesh);
        game.audio.pickup();
        game.state.cash += 50;
        game.hud.notify('PICKUP', '+$50 street cash');
      }
      if (!t.done) remaining++;
    }
    game.hud.setProgress(cur.targets.length - remaining, cur.targets.length);
    if (remaining === 0) nextStage(M, game);
  } else if (st.type === 'eliminate') {
    let remaining = 0;
    for (const t of cur.targets) {
      if (!t.done && dist2d(px, pz, t.x, t.z) < 26 && game.player.lastShotHit) {
        t.done = true; game.scene.remove(t.mesh);
        game.audio.explosion();
      }
      if (!t.done) remaining++;
    }
    // Enemies also count when shot near them (combat module marks hits).
    game.hud.setProgress(cur.targets.length - remaining, cur.targets.length);
    if (remaining === 0) nextStage(M, game);
  } else if (st.type === 'hold') {
    const d = dist2d(px, pz, st.x, st.z);
    if (d < 22) {
      cur.timer += dt;
      game.hud.setProgress(cur.timer, st.secs);
      if (cur.timer >= st.secs) nextStage(M, game);
    } else {
      game.hud.setObjective(`Return to the hold point — ${st.label}`);
    }
  } else if (st.type === 'survive') {
    cur.timer += dt;
    game.hud.setProgress(cur.timer, st.secs);
    // Survive = stay alive; wanted level is the pressure. Timer runs in
    // every mode, driving or on foot.
    if (cur.timer >= st.secs) {
      // Clean slate: cops lose the trail.
      game.police.heat = Math.min(game.police.heat, 25);
      nextStage(M, game);
    }
  } else if (st.type === 'steal') {
    if (game.player.vehicle && game.player.vehicle.missionCar) {
      game.hud.notify('VEHICLE SECURED', 'Get it to the drop-off');
      nextStage(M, game);
    }
  } else if (st.type === 'race') {
    // stepRace keeps a finished mission race in place for this branch to
    // consume (it runs before stepRace each tick); clear it once read.
    if (game.race && game.race.finished) {
      const won = game.race.won;
      game.race = null;
      if (won) nextStage(M, game);
      else { game.hud.notify('RACE LOST', 'Kai beat you — retry the mission'); failMission(M, game, 'You lost the race.'); }
    }
  }
}

export function failMission(M, game, reason) {
  clearTargets(game);
  game.audio.fail();
  game.hud.notify('MISSION FAILED', reason);
  M.current = null;
  game.hud.setObjective('Visit Vera Solano to retry');
}

// --- side jobs ---------------------------------------------------------------
export function startJob(M, game, jobId) {
  const def = SIDE_JOBS.find(j => j.id === jobId);
  if (!def || M.job) return false;
  M.job = { def, timer: 0, stage: 0, targets: [] };
  if (jobId === 'taxi') {
    M.job.pickup = { x: game.player.x + 60, z: game.player.z - 40 };
    M.job.drop = { x: game.player.x - 120, z: game.player.z + 80 };
    game.hud.setObjective('Taxi: pick up the fare (yellow blip)');
  } else if (jobId === 'courier') {
    M.job.timer = 150;
    M.job.drops = [
      { x: game.player.x + 90, z: game.player.z + 30 },
      { x: game.player.x - 70, z: game.player.z - 90 },
      { x: game.player.x + 40, z: game.player.z + 120 },
    ];
    game.hud.setObjective('Courier: deliver 3 parcels before the timer runs out');
  } else if (jobId === 'race') {
    game.startStreetRace();
    game.hud.setObjective('Street Race: 3 laps around the bay circuit');
  } else if (jobId === 'stunt') {
    game.hud.setObjective('Stunt: hit the ramp by the beach at full speed');
  }
  game.hud.notify('SIDE JOB', `${def.name} — ${def.desc}`);
  return true;
}

export function stepJob(M, game, dt, pos) {
  const j = M.job;
  if (!j) return;
  if (j.def.id === 'taxi') {
    const tgt = j.stage === 0 ? j.pickup : j.drop;
    if (dist2d(pos.x, pos.z, tgt.x, tgt.z) < 7) {
      j.stage++;
      if (j.stage === 1) game.hud.setObjective('Taxi: drop the fare off (green blip)');
      else { finishJob(M, game, j.def.pay + (game.player.vehicle && Math.abs(game.player.vehicle.speed) > 25 ? 40 : 0)); }
    }
  } else if (j.def.id === 'courier') {
    j.timer -= dt;
    game.hud.setProgress(Math.max(0, j.timer), 150);
    const tgt = j.drops[j.stage];
    if (tgt && dist2d(pos.x, pos.z, tgt.x, tgt.z) < 7) {
      j.stage++;
      game.audio.pickup();
      if (j.stage >= j.drops.length) finishJob(M, game, j.def.pay);
    }
    if (j.timer <= 0) { game.hud.notify('JOB FAILED', 'Courier timer ran out'); M.job = null; }
  } else if (j.def.id === 'stunt') {
    if (game.player.vehicle && Math.abs(game.player.vehicle.speed) > 34 && game.player.airborne) {
      finishJob(M, game, j.def.pay);
    }
  }
}

function finishJob(M, game, pay) {
  game.state.cash += pay;
  game.state.stats.jobsDone++;
  game.hud.notify('JOB DONE', `+$${pay} — ${M.job.def.name}`);
  game.audio.cash();
  M.job = null;
  game.hud.setObjective(game.M.current ? game.M.current.stage.label : 'Visit Vera Solano for the next job');
}

// --- stashes & street cash ----------------------------------------------------
export function checkStashes(M, game, pos) {
  for (const s of STASHES) {
    if (M.stashFound.has(s.x + ',' + s.z)) continue;
    if (dist2d(pos.x, pos.z, s.x, s.z) < 3.5) {
      M.stashFound.add(s.x + ',' + s.z);
      game.state.cash += 250;
      game.state.stats.stashes++;
      game.audio.cash();
      game.hud.notify('NEON STASH', `${s.note} — +$250`);
    }
  }
}

export function checkNearMiss(M, game, dt) {
  // Driving fast past a traffic car within 2.5 m = near miss bonus.
  const v = game.player.vehicle;
  if (!v || Math.abs(v.speed) < 18) return;
  M.nearMissT -= dt;
  for (const t of game.traffic) {
    if (t.dead) continue;
    const d = dist2d(v.x, v.z, t.x, t.z);
    if (d < 3.2 && d > 1.8 && M.nearMissT <= 0) {
      M.nearMissT = 2.5;
      game.state.cash += 25;
      game.hud.notify('NEAR MISS', '+$25 — that was close');
      game.audio.pickup();
      break;
    }
  }
}

export function nextMissionId(M) {
  for (const m of MISSIONS) if (!M.completed.includes(m.id)) return m.id;
  return null;
}
