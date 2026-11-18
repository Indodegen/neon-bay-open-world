// Vera Solano's jobs: twelve story missions with briefings, waypoint beacons,
// objectives and payouts, plus repeatable side jobs (taxi, courier, race,
// stunt), street-cash pickups, neon stashes and properties.
import { distance2D, formatCash, makeRng } from './utils.js';
import { PLACES, makeBeacon, pulseBeacon } from './world.js';
import { playMissionStart, playMissionComplete, playCash, playPickup } from './audio.js';

export const MISSIONS = [
  {
    id: 'errand', title: 'First Errand', giver: 'Vera Solano', payout: 400,
    briefing: 'A package is waiting at Pier 9 Docks. Bring it to Club Lumen, no questions. Drive fast, drive clean.',
    stages: [
      { type: 'goto', label: 'Pick up the package at Pier 9 Docks', x: PLACES.docks.x, z: PLACES.docks.z - 14, radius: 6 },
      { type: 'goto', label: 'Deliver the package to Club Lumen', x: PLACES.club.x, z: PLACES.club.z + 16, radius: 7 },
    ],
  },
  {
    id: 'hotwheels', title: 'Hot Wheels', giver: 'Vera Solano', payout: 900,
    briefing: 'A red Comet Sports is parked by the casino. It is not theirs anymore. Bring it to Mako Garage in one piece.',
    stages: [
      { type: 'steal', label: 'Steal the red Comet Sports by the casino', x: 150, z: -127.5, radius: 8 },
      { type: 'goto', label: 'Deliver the Comet to Mako Garage', x: PLACES.garage.x, z: PLACES.garage.z + 14, radius: 8 },
    ],
  },
  {
    id: 'payday', title: 'Payday Run', giver: 'Vera Solano', payout: 1200,
    briefing: 'Three drops, one bag each, all over town. The clock is running — 150 seconds. Miss one and the deal is off.',
    timeLimit: 150,
    stages: [
      { type: 'collect', label: 'Collect the cash drops (0/3)', x: 120, z: 120, radius: 7, drops: [{ x: 120, z: 120 }, { x: -150, z: -150 }, { x: 60, z: -180 }] },
    ],
  },
  {
    id: 'heatwave', title: 'Heat Wave', giver: 'Vera Solano', payout: 1800,
    briefing: 'Vera\'s rivals tipped off the CBPD — you are at 3 stars before you even start. Stay free for 60 seconds, then meet her at the club.',
    stages: [
      { type: 'survive', label: 'Stay free for 60 seconds', duration: 60, wanted: 3 },
      { type: 'goto', label: 'Meet Vera at Club Lumen', x: PLACES.club.x, z: PLACES.club.z + 16, radius: 7 },
    ],
  },
  {
    id: 'bigscore', title: 'The Big Score', giver: 'Vera Solano', payout: 2500,
    briefing: 'The vault at Coral Bay Bank. Hold the vault room for 10 seconds while the alarm screams, then run — across the bridge to Coral Cay Resort.',
    stages: [
      { type: 'goto', label: 'Reach Coral Bay Bank', x: PLACES.bank.x, z: PLACES.bank.z + 14, radius: 7 },
      { type: 'hold', label: 'Crack the vault — hold position', x: PLACES.bank.x, z: PLACES.bank.z + 14, radius: 6, duration: 10, wanted: 3 },
      { type: 'goto', label: 'Escape across the bridge to Coral Cay', x: PLACES.island.x, z: PLACES.island.z, radius: 26 },
    ],
  },
  {
    id: 'getaway', title: 'Getaway Driver', giver: 'Rico', payout: 1400,
    briefing: 'Rico is hot — the CBPD is already on him at the casino. Pick him up, lose the tail, and get him to the docks in 120 seconds.',
    timeLimit: 120,
    stages: [
      { type: 'goto', label: 'Pick up Rico at Casino Del Mar', x: PLACES.casino.x, z: PLACES.casino.z + 18, radius: 7, wanted: 2 },
      { type: 'goto', label: 'Get Rico to Pier 9 Docks', x: PLACES.docks.x, z: PLACES.docks.z - 14, radius: 8 },
    ],
  },
  {
    id: 'smuggler', title: "Smuggler's Run", giver: 'Vera Solano', payout: 1600,
    briefing: 'The boat at Sunset Pier is loaded. Take the Wave Runner across the bay to Coral Cay — 150 seconds, and the coast guard is watching.',
    timeLimit: 150,
    stages: [
      { type: 'goto', label: 'Reach the Wave Runner at Sunset Pier', x: PLACES.pier.x, z: PLACES.pier.z, radius: 8 },
      { type: 'goto', label: 'Deliver the cargo to Coral Cay Resort', x: PLACES.island.x, z: PLACES.island.z, radius: 26 },
    ],
  },
  {
    id: 'payback', title: 'Payback', giver: 'Rico', payout: 2000,
    briefing: 'Three of Maro\'s boys are holding Palmetto Park and they owe Vera. Settle it — all three, no witnesses left standing.',
    stages: [
      { type: 'eliminate', label: 'Take out Maro\'s crew in Palmetto Park (0/3)', x: PLACES.park.x, z: PLACES.park.z, radius: 30, count: 3 },
    ],
  },
  {
    id: 'longway', title: 'The Long Way Home', giver: 'Vera Solano', payout: 1700,
    briefing: 'A street race across the whole city — four checkpoints, 180 seconds. Win it and the Coral Bay crown is yours for the night.',
    timeLimit: 180,
    stages: [
      { type: 'race', label: 'Race the checkpoints', points: [{ x: -180, z: -180 }, { x: 180, z: -120 }, { x: 180, z: 120 }, { x: -60, z: 180 }], radius: 9 },
    ],
  },
  {
    id: 'nightshift', title: 'Night Shift', giver: 'Vera Solano', payout: 1500,
    briefing: 'Four drops, all after dark. The city is quieter at night — and so are the witnesses. 180 seconds.',
    timeLimit: 180, setTime: 23.0,
    stages: [
      { type: 'collect', label: 'Collect the night drops (0/4)', x: -120, z: 60, radius: 7, drops: [{ x: -120, z: 60 }, { x: 60, z: -60 }, { x: 210, z: 90 }, { x: -210, z: -120 }] },
    ],
  },
  {
    id: 'kingcay', title: 'King of the Cay', giver: 'Vera Solano', payout: 3000,
    briefing: 'The resort is Vera\'s now — but the CBPD wants it back. Hold Coral Cay for 45 seconds at 4 stars, then come home to the club.',
    stages: [
      { type: 'hold', label: 'Hold Coral Cay Resort', x: PLACES.island.x, z: PLACES.island.z, radius: 26, duration: 45, wanted: 4 },
      { type: 'goto', label: 'Meet Vera at Club Lumen', x: PLACES.club.x, z: PLACES.club.z + 16, radius: 7 },
    ],
  },
  {
    id: 'coralcrown', title: 'Coral Crown', giver: 'Vera Solano', payout: 5000,
    briefing: 'The last job. The bank vault, 15 seconds, five stars screaming behind you — then the bridge, the island, and the whole city is yours.',
    stages: [
      { type: 'goto', label: 'Reach Coral Bay Bank', x: PLACES.bank.x, z: PLACES.bank.z + 14, radius: 7 },
      { type: 'hold', label: 'Crack the vault — hold position', x: PLACES.bank.x, z: PLACES.bank.z + 14, radius: 6, duration: 15, wanted: 5 },
      { type: 'goto', label: 'Escape to Coral Cay — the crown is yours', x: PLACES.island.x, z: PLACES.island.z, radius: 26 },
    ],
  },
];

export const SIDE_JOBS = [
  { id: 'taxi', title: 'Taxi Fare', payout: 250, briefing: 'A fare is waiting. Pick them up and drop them off before the meter runs out.' },
  { id: 'courier', title: 'Courier Run', payout: 200, briefing: 'Three parcels, three stops. No questions, no delays.' },
  { id: 'streetrace', title: 'Street Race', payout: 400, briefing: 'Three checkpoints, 150 seconds. Beat the clock, beat the street.' },
  { id: 'stunt', title: 'Stunt Run', payout: 250, briefing: 'Three near-misses in 40 seconds. Thread the traffic like you own it.' },
];

export const STASH_SPOTS = [
  { x: -240, z: -240 }, { x: 240, z: -180 }, { x: -180, z: 180 },
  { x: 210, z: 150 }, { x: 60, z: -240 }, { x: -60, z: 120 },
  { x: 390, z: -100 }, { x: -240, z: 60 },
];

export const PROPERTIES = [
  { id: 'garage', name: 'Mako Garage', x: PLACES.garage.x, z: PLACES.garage.z, price: 4000, perk: 'Free repairs, forever.' },
  { id: 'clubroom', name: 'Club Lumen Back Room', x: PLACES.club.x, z: PLACES.club.z, price: 8000, perk: '+$100 on every job payout.' },
  { id: 'apartment', name: 'Sunset Apartment', x: -60, z: 150, price: 2500, perk: 'Safehouse: heal up and save.' },
];

export function createMissionState() {
  return {
    active: null,
    completed: [],
    nextIndex: 0,
    cashPickups: [],
    stashesFound: 0,
    propertiesOwned: [],
    sideJobsDone: 0,
  };
}

export function nextMissionDef(state) {
  if (state.nextIndex >= MISSIONS.length) return null;
  return MISSIONS[state.nextIndex];
}

export function startMission(state, scene, def, onEvent) {
  const mission = {
    def, stageIndex: 0, timer: def.timeLimit || 0,
    holdTimer: 0, collected: 0, beacon: null, drops: [],
    raceIndex: 0, stuntCount: 0, side: !!def.side,
  };
  state.active = mission;
  if (def.setTime) onEvent({ type: 'setTime', hours: def.setTime });
  advanceStage(state, scene, mission, onEvent);
  playMissionStart();
  onEvent({ type: 'toast', text: def.title + ' — ' + def.briefing });
  onEvent({ type: 'dialog', who: def.giver === 'Rico' ? 'rico' : 'vera', name: def.giver, text: def.briefing });
  return mission;
}

function clearBeacon(state, scene) {
  const m = state.active;
  if (m && m.beacon) { scene.remove(m.beacon); m.beacon = null; }
  if (m) {
    for (const d of m.drops) if (d.mesh) scene.remove(d.mesh);
    m.drops = [];
  }
}

function makeDropMesh(scene, x, z, gold = false) {
  const group = new THREE.Group();
  const bag = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.7),
    new THREE.MeshLambertMaterial({ color: gold ? 0xb8860b : 0x1f7a3a }));
  bag.position.y = 0.9;
  bag.castShadow = true;
  group.add(bag);
  const band = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.2, 0.74),
    new THREE.MeshBasicMaterial({ color: gold ? 0xffd23e : 0x7CFC00 }));
  band.position.y = 0.9;
  group.add(band);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeCashGlowTexture(), color: gold ? 0xffd23e : 0x7CFC00,
    transparent: true, opacity: 0.5, depthWrite: false,
  }));
  glow.scale.set(5, 5, 1);
  glow.position.y = 1.2;
  group.add(glow);
  group.position.set(x, 0, z);
  scene.add(group);
  return group;
}

let cashGlowTex = null;
function makeCashGlowTexture() {
  if (cashGlowTex) return cashGlowTex;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  cashGlowTex = new THREE.CanvasTexture(canvas);
  return cashGlowTex;
}

function advanceStage(state, scene, mission, onEvent) {
  clearBeacon(state, scene);
  const stage = mission.def.stages[mission.stageIndex];
  if (!stage) { completeMission(state, scene, onEvent); return; }
  mission.stage = stage;
  mission.holdTimer = 0;
  if (stage.wanted) onEvent({ type: 'setWanted', level: stage.wanted });
  if (stage.type === 'collect') {
    mission.drops = stage.drops.map((d) => ({
      x: d.x, z: d.z, taken: false, mesh: makeDropMesh(scene, d.x, d.z),
    }));
    mission.beacon = makeBeacon(scene, 0x7CFC00);
    mission.beacon.position.set(stage.drops[0].x, 0, stage.drops[0].z);
  } else if (stage.type === 'survive') {
    mission.beacon = null;
    mission.timer = stage.duration;
  } else if (stage.type === 'eliminate') {
    mission.beacon = makeBeacon(scene, 0xff5e5e);
    mission.beacon.position.set(stage.x, 0, stage.z);
    onEvent({ type: 'spawnRivals', x: stage.x, z: stage.z, count: stage.count });
  } else if (stage.type === 'race') {
    mission.raceIndex = 0;
    mission.beacon = makeBeacon(scene, 0x37e0ff);
    mission.beacon.position.set(stage.points[0].x, 0, stage.points[0].z);
  } else if (stage.type === 'stunt') {
    mission.stuntCount = 0;
    mission.timer = stage.duration || 40;
    mission.beacon = null;
  } else {
    mission.beacon = makeBeacon(scene, stage.type === 'hold' ? 0xff5e5e : 0xffd23e);
    mission.beacon.position.set(stage.x, 0, stage.z);
  }
  onEvent({ type: 'objective', text: stage.label });
}

export function completeMission(state, scene, onEvent) {
  const mission = state.active;
  if (!mission) return;
  clearBeacon(state, scene);
  const wasSide = mission.side;
  if (!wasSide) {
    state.completed.push(mission.def.id);
    state.nextIndex = Math.max(state.nextIndex, MISSIONS.findIndex((m) => m.id === mission.def.id) + 1);
  } else {
    state.sideJobsDone += 1;
  }
  state.active = null;
  playMissionComplete();
  onEvent({ type: 'missionComplete', def: mission.def, side: wasSide });
}

export function failMission(state, scene, reason, onEvent) {
  const mission = state.active;
  if (!mission) return;
  clearBeacon(state, scene);
  state.active = null;
  onEvent({ type: 'missionFailed', def: mission.def, reason });
}

/** Called by the game when the player scores a near-miss (stunt jobs). */
export function notifyNearMiss(state) {
  const m = state.active;
  if (m && m.stage && m.stage.type === 'stunt') m.stuntCount += 1;
}

/** Per-frame mission logic. `pos` is the player's (or car) position. */
export function updateMission(state, scene, dt, elapsed, pos, inCar, carType, onEvent, ctx = {}) {
  const mission = state.active;
  if (!mission) return;
  const stage = mission.stage;
  if (!stage) return;
  if (mission.beacon) pulseBeacon(mission.beacon, elapsed);

  if (stage.type === 'goto' || stage.type === 'steal') {
    const d = distance2D(pos.x, pos.z, stage.x, stage.z);
    if (d < stage.radius) {
      if (stage.type === 'steal') {
        onEvent({ type: 'toast', text: 'That is the Comet. Get in and drive it to Mako Garage.' });
        mission.stageIndex += 1;
        advanceStage(state, scene, mission, onEvent);
      } else {
        playPickup();
        mission.stageIndex += 1;
        advanceStage(state, scene, mission, onEvent);
      }
    }
  } else if (stage.type === 'collect') {
    for (const drop of mission.drops) {
      if (drop.taken) continue;
      drop.mesh.rotation.y += dt * 2;
      drop.mesh.position.y = Math.sin(elapsed * 2.5 + drop.x) * 0.15;
      if (distance2D(pos.x, pos.z, drop.x, drop.z) < 4.5) {
        drop.taken = true;
        scene.remove(drop.mesh);
        mission.collected += 1;
        playCash();
        onEvent({ type: 'cash', amount: 150 });
        onEvent({ type: 'toast', text: 'Drop collected (' + mission.collected + '/' + stage.drops.length + ') — +$150' });
        const next = mission.drops.find((d) => !d.taken);
        if (mission.beacon) {
          if (next) mission.beacon.position.set(next.x, 0, next.z);
          else { scene.remove(mission.beacon); mission.beacon = null; }
        }
        if (mission.collected >= stage.drops.length) {
          mission.stageIndex += 1;
          advanceStage(state, scene, mission, onEvent);
        }
      }
    }
  } else if (stage.type === 'survive') {
    mission.timer -= dt;
    if (mission.timer <= 0) {
      mission.stageIndex += 1;
      advanceStage(state, scene, mission, onEvent);
    }
  } else if (stage.type === 'hold') {
    const d = distance2D(pos.x, pos.z, stage.x, stage.z);
    if (d < stage.radius) {
      mission.holdTimer += dt;
      if (Math.floor(mission.holdTimer) !== Math.floor(mission.holdTimer - dt)) playPickup();
      if (mission.holdTimer >= stage.duration) {
        onEvent({ type: 'cash', amount: 500 });
        mission.stageIndex += 1;
        advanceStage(state, scene, mission, onEvent);
      }
    } else {
      mission.holdTimer = Math.max(0, mission.holdTimer - dt * 2);
    }
  } else if (stage.type === 'eliminate') {
    const rivals = ctx.rivals || [];
    const left = rivals.filter((r) => !r.dead).length;
    if (left === 0 && rivals.length > 0) {
      mission.stageIndex += 1;
      advanceStage(state, scene, mission, onEvent);
    }
  } else if (stage.type === 'race') {
    const point = stage.points[mission.raceIndex];
    if (point && distance2D(pos.x, pos.z, point.x, point.z) < stage.radius) {
      playPickup();
      mission.raceIndex += 1;
      if (mission.raceIndex >= stage.points.length) {
        mission.stageIndex += 1;
        advanceStage(state, scene, mission, onEvent);
      } else {
        const next = stage.points[mission.raceIndex];
        if (mission.beacon) mission.beacon.position.set(next.x, 0, next.z);
        onEvent({ type: 'toast', text: 'Checkpoint ' + mission.raceIndex + '/' + stage.points.length });
      }
    }
  } else if (stage.type === 'stunt') {
    if (mission.stuntCount >= 3) {
      mission.stageIndex += 1;
      advanceStage(state, scene, mission, onEvent);
    }
  }
  // Global mission timer.
  if (mission.def.timeLimit && mission.stage.type !== 'survive') {
    mission.timer -= dt;
    if (mission.timer <= 0) failMission(state, scene, 'Out of time.', onEvent);
  }
}

export function missionObjectiveText(state) {
  const m = state.active;
  if (!m || !m.stage) return null;
  let text = m.stage.label;
  if (m.stage.type === 'collect') text = 'Collect the cash drops (' + m.collected + '/' + m.stage.drops.length + ')';
  if (m.stage.type === 'survive') text = 'Stay free — ' + Math.ceil(m.timer) + 's left';
  if (m.stage.type === 'hold') text = 'Hold position (' + Math.ceil(m.holdTimer) + '/' + m.stage.duration + 's)';
  if (m.stage.type === 'eliminate') text = 'Take out Maro\'s crew';
  if (m.stage.type === 'race') text = 'Race the checkpoints (' + m.raceIndex + '/' + m.stage.points.length + ')';
  if (m.stage.type === 'stunt') text = 'Near-misses: ' + m.stuntCount + '/3';
  return { title: m.def.title, text, payout: m.def.payout };
}

export function missionTarget(state) {
  const m = state.active;
  if (!m || !m.stage) return null;
  if (m.stage.type === 'collect') {
    const next = m.drops.find((d) => !d.taken);
    return next ? { x: next.x, z: next.z } : null;
  }
  if (m.stage.type === 'survive' || m.stage.type === 'stunt') return null;
  if (m.stage.type === 'race') {
    const point = m.stage.points[m.raceIndex];
    return point ? { x: point.x, z: point.z } : null;
  }
  return { x: m.stage.x, z: m.stage.z };
}

/** Build a one-off side-job definition from a template id. */
export function makeSideJob(id, rng) {
  const spots = [
    { x: 120, z: 120 }, { x: -150, z: -150 }, { x: 60, z: -180 },
    { x: -120, z: 60 }, { x: 210, z: 90 }, { x: -210, z: -120 },
    { x: 0, z: 180 }, { x: 180, z: 0 }, { x: -60, z: -60 },
  ];
  const pick = () => spots[Math.floor(rng.next() * spots.length)];
  const base = SIDE_JOBS.find((j) => j.id === id);
  if (id === 'taxi') {
    const from = pick();
    const to = pick();
    return {
      id: 'taxi-' + Date.now(), title: 'Taxi Fare', giver: 'Vera Solano',
      payout: 250, side: true, timeLimit: 90,
      briefing: 'A fare is waiting. Pick them up and drop them off before the meter runs out.',
      stages: [
        { type: 'goto', label: 'Pick up the fare', x: from.x, z: from.z, radius: 7 },
        { type: 'goto', label: 'Drop the fare off', x: to.x, z: to.z, radius: 7 },
      ],
    };
  }
  if (id === 'courier') {
    const a = pick(); const b = pick(); const c = pick();
    return {
      id: 'courier-' + Date.now(), title: 'Courier Run', giver: 'Vera Solano',
      payout: 200, side: true, timeLimit: 150,
      briefing: 'Three parcels, three stops. No questions, no delays.',
      stages: [
        { type: 'goto', label: 'Parcel 1 of 3', x: a.x, z: a.z, radius: 7 },
        { type: 'goto', label: 'Parcel 2 of 3', x: b.x, z: b.z, radius: 7 },
        { type: 'goto', label: 'Parcel 3 of 3', x: c.x, z: c.z, radius: 7 },
      ],
    };
  }
  if (id === 'streetrace') {
    return {
      id: 'streetrace-' + Date.now(), title: 'Street Race', giver: 'Rico',
      payout: 400, side: true, timeLimit: 150,
      briefing: 'Three checkpoints, 150 seconds. Beat the clock, beat the street.',
      stages: [
        { type: 'race', label: 'Race the checkpoints', points: [pick(), pick(), pick()], radius: 9 },
      ],
    };
  }
  return {
    id: 'stunt-' + Date.now(), title: 'Stunt Run', giver: 'Rico',
    payout: 250, side: true,
    briefing: 'Three near-misses in 40 seconds. Thread the traffic like you own it.',
    stages: [{ type: 'stunt', label: 'Near-misses (0/3)', duration: 40 }],
  };
}

/** Street cash: a glowing pickup that pays when walked or driven over. */
export function spawnCashPickup(scene, x, z, value = 100, gold = false) {
  const mesh = makeDropMesh(scene, x, z, gold);
  return { x, z, mesh, taken: false, value, gold };
}

export function updateCashPickups(pickups, scene, pos, dt, elapsed, onEvent) {
  for (const p of pickups) {
    if (p.taken) continue;
    p.mesh.rotation.y += dt * 2;
    p.mesh.position.y = Math.sin(elapsed * 2.5 + p.x) * 0.15;
    if (distance2D(pos.x, pos.z, p.x, p.z) < 4) {
      p.taken = true;
      scene.remove(p.mesh);
      playCash();
      onEvent({ type: 'cash', amount: p.value });
      onEvent({ type: 'toast', text: (p.gold ? 'Neon stash found! +$' : 'Street cash +$') + p.value });
      if (p.gold) onEvent({ type: 'stash' });
    }
  }
  return pickups.filter((p) => !p.taken);
}

export function repairCost(vehicle) {
  const missing = (vehicle.maxHealth || 100) - vehicle.health;
  return Math.max(0, Math.round(missing * 2));
}
