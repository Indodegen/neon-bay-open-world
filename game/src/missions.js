// Story missions for Rosa Vega + side jobs + collectibles + gangs.
// Missions 1–3 are BYTE-IDENTICAL in behaviour to round 6 (same titles, text,
// rewards, targets, completion rules). Missions 4–12 extend the same types.
// Types: steal | deliver | reach | combat | collect | chase.
import * as THREE from 'three';

function markerMesh(color) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 30, 16, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = 15; g.add(beam);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.2, 24),
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.1; g.add(ring);
  return g;
}

export const GANGS = {
  Vipers: { color: 0x2ed573, turf: 'Harbor', shirt: 0x1a5a2a },
  'Sol Kings': { color: 0x00e5ff, turf: 'Boardwalk', shirt: 0x0a3a4a },
  Cortez: { color: 0xff2e88, turf: 'Downtown', shirt: 0x4a0a22 },
};

// Neon Tape collectible spots — fixed coords so staging is deterministic.
export const TAPE_SPOTS = [
  [52, -52], [-52, 52], [104, -104], [-104, 104], [156, 52], [-156, -52],
  [208, -52], [-208, 52], [52, 156], [-52, -156], [104, 208], [-104, -208],
  [260, 60], [290, -120], [290, 180], [-230, 185], [-190, 220], [0, 208],
  [156, -156], [-156, 156], [208, 156], [-208, -156], [60, -208], [-60, 208],
];

export class Missions {
  constructor(scene) {
    this.scene = scene;
    this.index = 0; // 0..11 active, 12 = all done
    this.stage = 0;
    this.armed = false; // combat mission guards already spawned for this mission
    this.marker = null;
    this.enemiesLeft = 0;
    this.tapesCollected = 0;
    this.tapes = [];
    this.sideJob = null; // { kind, stage, target, reward, fare }
    this.stats = { fares: 0, deliveries: 0, races: 0, takedowns: 0 };
    this.defs = [
      {
        title: 'MISSION 1 — FIRST WHEELS', type: 'steal',
        text: 'Steal any car on the street',
        sub: 'Walk up to a parked car and press E. The cops will notice — drive fast.',
        reward: 500, target: { x: 0, z: 0 },
      },
      {
        title: 'MISSION 2 — BAYFRONT DROP', type: 'deliver',
        text: 'Deliver the Sunset GT to the beach drop-off',
        sub: 'Follow the gold marker to the boardwalk. Wanted level 2 is already on you.',
        reward: 1200, target: { x: 296, z: 60 },
      },
      {
        title: 'MISSION 3 — HARBOR HEIST', type: 'combat',
        text: 'Hit the harbor warehouse: take out the guards, grab the cash',
        sub: 'Punch (F) or shoot (click) the 3 guards, then stand in the gold marker.',
        reward: 2500, target: { x: -215, z: 185 }, guards: 3, gang: 'Vipers',
      },
      {
        title: 'MISSION 4 — FERRY LIGHTS', type: 'reach',
        text: 'Meet Lucia at the pier — the Sol Kings are watching',
        sub: 'On foot or by car, get to the pier at the end of the boardwalk.',
        reward: 1500, target: { x: 340, z: 120 }, gang: 'Sol Kings',
      },
      {
        title: 'MISSION 5 — GHOST RIDE', type: 'steal',
        text: 'Steal the Sunset GT from the downtown tower',
        sub: 'Take any car near Coral Tower — 3 stars the second you touch it.',
        reward: 2000, target: { x: -104, z: -104 }, heatOnComplete: 50,
      },
      {
        title: 'MISSION 6 — BAY AUTO DROP', type: 'deliver',
        text: 'Deliver the GT to Dex at Bay Auto — no scratches',
        sub: 'Follow the gold marker to the garage. Dex pays for a clean car.',
        reward: 2200, target: { x: -156, z: -156 },
      },
      {
        title: 'MISSION 7 — VIPER NEST', type: 'combat',
        text: 'Clear the Viper warehouse at the harbor',
        sub: '4 Viper gunmen guard the stash. Take them out, then grab the cash.',
        reward: 3000, target: { x: -225, z: 150 }, guards: 4, gang: 'Vipers',
      },
      {
        title: 'MISSION 8 — NEON TAPES', type: 'collect',
        text: 'Rosa stashed 6 neon tapes around the city — grab them',
        sub: 'Drive or walk over the glowing gold tapes. 6 tapes to finish.',
        reward: 1800, target: { x: 52, z: -52 }, collectNeed: 6,
      },
      {
        title: 'MISSION 9 — HEAT WAVE', type: 'chase',
        text: 'Reach the boardwalk with the heat still on you',
        sub: 'Get to the beach with 2+ stars for a $500 bonus. No heat, no bonus.',
        reward: 2600, target: { x: 296, z: -60 }, bonus: 500,
      },
      {
        title: 'MISSION 10 — CORTEZ STANDOFF', type: 'combat',
        text: 'The Cortez crew owns the downtown plaza — take it back',
        sub: '5 Cortez gunmen in the plaza. Rosa wants the corner back tonight.',
        reward: 3500, target: { x: 104, z: 104 }, guards: 5, gang: 'Cortez',
      },
      {
        title: 'MISSION 11 — LAST FERRY', type: 'deliver',
        text: 'The money boat leaves at dawn — get the case to the pier',
        sub: 'One last run. The whole crew is counting on this case.',
        reward: 4000, target: { x: 340, z: 120 },
      },
      {
        title: 'MISSION 12 — KING OF THE BAY', type: 'reach',
        text: 'Take the case to the top of Coral Tower',
        sub: 'Walk into the tower plaza. The city is yours after this.',
        reward: 5000, target: { x: -104, z: -104 },
      },
    ];
    // Neon Tapes: glowing gold pickups scattered over the city.
    const tapeMat = new THREE.MeshBasicMaterial({ color: 0xffd23f });
    for (const [x, z] of TAPE_SPOTS) {
      const tape = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.15, 0.6), tapeMat);
      tape.position.set(x, 1.1, z);
      tape.rotation.y = 0.6;
      scene.add(tape);
      this.tapes.push({ mesh: tape, taken: false, x, z });
    }
    this.setMarker(this.defs[0].target, 0xffd23f, true);
  }
  current() { return this.defs[this.index] ?? null; }
  setMarker(pos, color, hidden = false) {
    if (this.marker) { this.scene.remove(this.marker); this.marker = null; }
    if (hidden) return;
    this.marker = markerMesh(color);
    this.marker.position.set(pos.x, 0, pos.z);
    this.scene.add(this.marker);
  }
  _complete(game, m, bonus = 0) {
    const pay = m.reward + bonus;
    game.player.cash += pay;
    game.audio.cash();
    this.index += 1; this.stage = 0; this.armed = false;
    const next = this.current();
    if (next) this.setMarker(next.target, next.type === 'combat' ? 0xff2e88 : 0xffd23f);
    else this.setMarker(null, 0, true);
    return { event: 'complete', text: `MISSION COMPLETE — +$${pay.toLocaleString('en-US')}` };
  }
  // Side jobs: taxi fare, taco delivery, street race. Started from the map
  // screen or by driving onto a side-job marker; all pay cash.
  startSideJob(kind, game) {
    const p = game.player.inCar ? game.player.inCar.mesh.position : game.player.mesh.position;
    if (kind === 'taxi') {
      // Three pickup points — the fare never starts from the same corner twice.
      const spots = [{ x: 296, z: -120 }, { x: -208, z: 104 }, { x: 104, z: -208 }];
      const target = spots[Math.floor(Math.random() * spots.length)];
      this.sideJob = { kind, stage: 0, target, reward: 250 };
      this.setMarker(this.sideJob.target, 0x00e5ff);
      return 'TAXI FARE — pick up the passenger at the blue marker';
    }
    if (kind === 'delivery') {
      this.sideJob = { kind, stage: 0, target: { x: 52, z: 208 }, reward: 180 };
      this.setMarker(this.sideJob.target, 0xff9f1c);
      return 'TACO DELIVERY — hot food to the south plaza, fast';
    }
    if (kind === 'race') {
      this.sideJob = { kind, stage: 0, target: { x: -208, z: -208 }, reward: 400 };
      this.setMarker(this.sideJob.target, 0x7dff5a);
      return 'STREET RACE — first to the north-west corner wins $400';
    }
    return null;
  }
  // Returns { event, text } when something happens, else null.
  update(dt, game) {
    // Neon Tape pickups work in any mission.
    const pp = game.player.inCar ? game.player.inCar.mesh.position : game.player.mesh.position;
    for (const t of this.tapes) {
      if (t.taken) continue;
      t.mesh.rotation.y += dt * 1.5;
      t.mesh.position.y = 1.1 + Math.sin(performance.now() / 400 + t.x) * 0.15;
      if (Math.hypot(pp.x - t.x, pp.z - t.z) < 3.5) {
        t.taken = true; t.mesh.visible = false;
        this.tapesCollected += 1;
        game.player.cash += 25; game.audio.pickup();
        return { event: 'pickup', text: `NEON TAPE ${this.tapesCollected}/24 — +$25` };
      }
    }
    // Side job progress.
    if (this.sideJob) {
      const sj = this.sideJob;
      if (Math.hypot(pp.x - sj.target.x, pp.z - sj.target.z) < 8) {
        game.player.cash += sj.reward; game.audio.cash();
        if (sj.kind === 'taxi') this.stats.fares += 1;
        if (sj.kind === 'delivery') this.stats.deliveries += 1;
        if (sj.kind === 'race') this.stats.races += 1;
        this.sideJob = null;
        const next = this.current();
        if (next) this.setMarker(next.target, next.type === 'combat' ? 0xff2e88 : 0xffd23f);
        return { event: 'sidejob', text: `SIDE JOB DONE — +$${sj.reward}` };
      }
    }
    const m = this.current();
    if (!m) return null;
    if (m.type === 'steal') {
      if (game.player.inCar) {
        if (m.heatOnComplete) game.police.addHeat(m.heatOnComplete);
        return this._complete(game, m);
      }
      return null;
    }
    if (m.type === 'deliver' || m.type === 'reach') {
      const d = Math.hypot(pp.x - m.target.x, pp.z - m.target.z);
      if (d < 8) return this._complete(game, m);
      return null;
    }
    if (m.type === 'chase') {
      const d = Math.hypot(pp.x - m.target.x, pp.z - m.target.z);
      if (d < 8) {
        const bonus = game.police.wanted >= 2 ? (m.bonus || 0) : 0;
        return this._complete(game, m, bonus);
      }
      return null;
    }
    if (m.type === 'collect') {
      if (this.tapesCollected >= (m.collectNeed || 6)) return this._complete(game, m);
      return null;
    }
    if (m.type === 'combat') {
      if (!this.armed) this.armCombatMission(game);
      this.enemiesLeft = game.combat.aliveCount();
      if (this.stage === 0 && this.enemiesLeft === 0) {
        this.stage = 1;
        this.setMarker(m.target, 0x7dff5a);
        return { event: 'stage', text: 'GUARDS DOWN — GRAB THE CASH' };
      }
      if (this.stage === 1) {
        const d = Math.hypot(pp.x - m.target.x, pp.z - m.target.z);
        if (d < 7) return this._complete(game, m);
      }
      return null;
    }
    return null;
  }
  // Called by main when a combat mission starts so guards exist before update.
  // Self-healing: never double-spawns, and auto-arms if a save loads mid-mission.
  armCombatMission(game) {
    const m = this.current();
    if (!m || m.type !== 'combat') return;
    if (this.armed || game.combat.aliveCount() > 0) return;
    const gang = m.gang ? GANGS[m.gang] : null;
    game.combat.spawnGuards(this.scene, m.target, gang ? gang.shirt : 0x1a1a22, m.guards || 3);
    this.enemiesLeft = m.guards || 3;
    this.armed = true;
  }
  objectiveText() {
    const m = this.current();
    if (!m) return { title: 'KING OF THE BAY', text: 'All missions done — free roam Coral Bay', sub: 'Rosa Vega: "You run this city now, Jax."' };
    if (m.type === 'combat' && this.stage === 0) return { title: m.title, text: m.text, sub: `Guards left: ${this.enemiesLeft}` };
    if (m.type === 'collect') return { title: m.title, text: m.text, sub: `Tapes: ${this.tapesCollected}/${m.collectNeed || 6} (24 in the city)` };
    if (this.sideJob) return { title: m.title, text: m.text, sub: `Side job: ${this.sideJob.kind.toUpperCase()} — $${this.sideJob.reward}` };
    return { title: m.title, text: m.text, sub: m.sub };
  }
}
