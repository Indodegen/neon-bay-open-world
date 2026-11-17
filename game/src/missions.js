// Story missions for Rosa Vega: steal, deliver, fight — each pays cash and unlocks the next.
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

export class Missions {
  constructor(scene) {
    this.scene = scene;
    this.index = 0; // 0..2 active, 3 = all done
    this.stage = 0;
    this.marker = null;
    this.enemiesLeft = 0;
    this.defs = [
      {
        title: 'MISSION 1 — FIRST WHEELS',
        text: 'Steal any car on the street',
        sub: 'Walk up to a parked car and press E. The cops will notice — drive fast.',
        reward: 500,
        target: { x: 0, z: 0 }, // any car
      },
      {
        title: 'MISSION 2 — BAYFRONT DROP',
        text: 'Deliver the Sunset GT to the beach drop-off',
        sub: 'Follow the gold marker to the boardwalk. Wanted level 2 is already on you.',
        reward: 1200,
        target: { x: 296, z: 60 },
      },
      {
        title: 'MISSION 3 — HARBOR HEIST',
        text: 'Hit the harbor warehouse: take out the guards, grab the cash',
        sub: 'Punch (F) or shoot (click) the 3 guards, then stand in the gold marker.',
        reward: 2500,
        target: { x: -215, z: 185 },
      },
    ];
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
  // Returns { event, text } when something happens, else null.
  update(dt, game) {
    const m = this.current();
    if (!m) return null;
    const pp = game.player.inCar ? game.player.inCar.mesh.position : game.player.mesh.position;
    if (this.index === 0) {
      if (game.player.inCar) {
        game.player.cash += m.reward;
        game.audio.cash();
        this.index = 1; this.stage = 0;
        game.police.addHeat(35); // stealing a car draws the law
        this.setMarker(this.defs[1].target, 0xffd23f);
        return { event: 'complete', text: `MISSION COMPLETE — +$${m.reward}` };
      }
      return null;
    }
    if (this.index === 1) {
      const d = Math.hypot(pp.x - m.target.x, pp.z - m.target.z);
      if (d < 8) {
        game.player.cash += m.reward;
        game.audio.cash();
        this.index = 2; this.stage = 0;
        this.setMarker(this.defs[2].target, 0xff2e88);
        game.combat.spawnGuards(this.scene, this.defs[2].target);
        this.enemiesLeft = 3;
        return { event: 'complete', text: `MISSION COMPLETE — +$${m.reward}` };
      }
      return null;
    }
    if (this.index === 2) {
      this.enemiesLeft = game.combat.aliveCount();
      if (this.stage === 0 && this.enemiesLeft === 0) {
        this.stage = 1;
        this.setMarker(m.target, 0x7dff5a);
        return { event: 'stage', text: 'GUARDS DOWN — GRAB THE CASH' };
      }
      if (this.stage === 1) {
        const d = Math.hypot(pp.x - m.target.x, pp.z - m.target.z);
        if (d < 7) {
          game.player.cash += m.reward;
          game.audio.cash();
          this.index = 3;
          this.setMarker(null, 0, true);
          return { event: 'complete', text: `MISSION COMPLETE — +$${m.reward}` };
        }
      }
      return null;
    }
    return null;
  }
  objectiveText() {
    const m = this.current();
    if (!m) return { title: 'KING OF THE BAY', text: 'All missions done — free roam Coral Bay', sub: 'Rosa Vega: "You run this city now, Jax."' };
    if (this.index === 2 && this.stage === 0) return { title: m.title, text: m.text, sub: `Guards left: ${this.enemiesLeft}` };
    return { title: m.title, text: m.text, sub: m.sub };
  }
}
