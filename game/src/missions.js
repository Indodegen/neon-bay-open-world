// missions.js — The story of NEON BAY: five jobs for Vera Solano, each one
// a different kind of driving. Every mission is a list of steps; the manager
// watches the player, advances the steps, and pays out at the end.
import { WORLD } from './config.js';

// Step kinds:
//   steal      — get into any car
//   goto       — reach a point (optionally in a car)
//   timed      — reach a point before the clock runs out
//   hold       — stand in a zone for a few seconds
//   loseWanted — get the wanted level back to zero
function missionList(city) {
  const L = city.landmarks;
  return [
    {
      id: 'first-wheels',
      title: '1 · FIRST WHEELS',
      name: 'First Wheels',
      reward: 400,
      briefing: 'Vera Solano runs this town\'s jobs, and she needs a driver. "Borrow" any car on the street and bring it to Sunset Garage. Try not to let the cops see you take it.',
      steps: [
        { kind: 'steal', text: 'Steal any car (walk up and press E)' },
        { kind: 'goto', x: L.garage.x, y: L.garage.y, radius: 90, requireCar: true, text: 'Drive the car to Sunset Garage' },
      ],
    },
    {
      id: 'sunset-courier',
      title: '2 · SUNSET COURIER',
      name: 'Sunset Courier',
      reward: 650,
      briefing: 'A package for the island. The bridge is the only way across Coral Bay, and the client pays extra if you beat the sunset — 90 seconds, wheels up.',
      steps: [
        { kind: 'goto', x: L.market.x, y: L.market.y, radius: 80, requireCar: true, text: 'Pick up the package at the Night Market' },
        { kind: 'timed', x: L.safehouse.x, y: L.safehouse.y, radius: 110, requireCar: true, timeLimit: 90, text: 'Deliver across the Coral Bridge — beat the clock!' },
      ],
    },
    {
      id: 'night-shift',
      title: '3 · NIGHT SHIFT',
      name: 'Night Shift',
      reward: 950,
      briefing: 'The club crowd pays in cash and tips in gossip. Three fares, three corners of the city. Keep the meter running and the paint un-scratched.',
      steps: [
        { kind: 'goto', x: 900, y: 700, radius: 70, requireCar: true, text: 'Pick up fare 1/3 — Marlin & 2nd' },
        { kind: 'goto', x: 2800, y: 700, radius: 70, requireCar: true, text: 'Drop off fare 1/3 — East Gate' },
        { kind: 'goto', x: 2400, y: 1900, radius: 70, requireCar: true, text: 'Pick up fare 2/3 — Market Row' },
        { kind: 'goto', x: 800, y: 1900, radius: 70, requireCar: true, text: 'Drop off fare 2/3 — Beachfront' },
        { kind: 'goto', x: 1200, y: 1500, radius: 70, requireCar: true, text: 'Pick up fare 3/3 — Downtown' },
        { kind: 'goto', x: 2000, y: 300, radius: 70, requireCar: true, text: 'Drop off fare 3/3 — North Pier Road' },
      ],
    },
    {
      id: 'heat-run',
      title: '4 · HEAT RUN',
      name: 'Heat Run',
      reward: 1200,
      briefing: 'Somebody talked. The NBPD has your plate and your face. Lose the tail — stay out of sight until the heat dies — then slip home to the safehouse on Coral Isle.',
      steps: [
        { kind: 'loseWanted', text: 'Lose the cops — stay out of sight until the stars fade' },
        { kind: 'goto', x: L.safehouse.x, y: L.safehouse.y, radius: 110, text: 'Reach the safehouse on Coral Isle' },
      ],
    },
    {
      id: 'coral-heist',
      title: '5 · THE CORAL HEIST',
      name: 'The Coral Heist',
      reward: 3000,
      briefing: 'The big one. Coral Bank keeps its cash behind a vault door that takes six seconds to crack. Walk in on foot, crack it, grab the money — then outrun a four-star response to the island. This is the job that makes you a legend of Neon Bay.',
      steps: [
        { kind: 'goto', x: L.bank.x, y: L.bank.y, radius: 80, requireCar: false, onFoot: true, text: 'Reach Coral Bank — on foot, no car' },
        { kind: 'hold', x: L.bank.x, y: L.bank.y, radius: 60, holdSeconds: 6, onFoot: true, text: 'Crack the vault — stay inside the bank!' },
        { kind: 'goto', x: L.safehouse.x, y: L.safehouse.y, radius: 110, text: 'Escape to the safehouse — the whole city is after you!' },
      ],
    },
  ];
}

export class Missions {
  constructor(city) {
    this.city = city;
    this.list = missionList(city);
    this.index = 0; // next mission to play
    this.active = null;
    this.stepIndex = 0;
    this.stepTimer = 0;
    this.holdTimer = 0;
    this.completedCount = 0;
    this.storyDone = false;
  }

  get current() {
    return this.active;
  }

  get currentStep() {
    if (!this.active) return null;
    return this.active.steps[this.stepIndex] || null;
  }

  get nextMission() {
    return this.list[this.index] || null;
  }

  start(index, game) {
    const mission = this.list[index];
    if (!mission) return null;
    this.active = mission;
    this.stepIndex = 0;
    this.stepTimer = 0;
    this.holdTimer = 0;
    this.applyStepSetup(mission.steps[0], game);
    return mission;
  }

  applyStepSetup(step, game) {
    if (!step || !game) return;
    if (step.kind === 'loseWanted') {
      game.police.setWanted(2);
    }
    if (this.active && this.active.id === 'coral-heist' && step.kind === 'goto' && this.stepIndex === 2) {
      game.police.setWanted(4);
    }
    this.stepTimer = step.timeLimit || 0;
    this.holdTimer = 0;
  }

  fail() {
    const mission = this.active;
    this.active = null;
    this.stepIndex = 0;
    return mission;
  }

  // Returns an event object when something notable happens, else null.
  update(dt, game) {
    if (!this.active) return null;
    const step = this.currentStep;
    if (!step) return null;
    const player = game.player;

    if (step.kind === 'steal') {
      if (player.inCar) return this.advance(game);
      return null;
    }

    if (step.kind === 'loseWanted') {
      if (game.police.wanted === 0) return this.advance(game);
      return null;
    }

    if (step.kind === 'timed') {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) return { event: 'fail', reason: 'Out of time — the client walked.' };
    }

    if (step.kind === 'hold') {
      const d = Math.hypot(player.x - step.x, player.y - step.y);
      const inZone = d < step.radius && (!step.onFoot || !player.inCar);
      if (inZone) {
        this.holdTimer += dt;
        if (this.holdTimer >= step.holdSeconds) return this.advance(game);
      } else {
        this.holdTimer = Math.max(0, this.holdTimer - dt * 2);
      }
      return null;
    }

    // goto / timed arrival.
    const d = Math.hypot(player.x - step.x, player.y - step.y);
    const modeOk = step.onFoot ? !player.inCar : step.requireCar ? player.inCar : true;
    if (d < step.radius && modeOk) {
      return this.advance(game);
    }
    return null;
  }

  advance(game) {
    this.stepIndex++;
    this.holdTimer = 0;
    if (this.stepIndex >= this.active.steps.length) {
      const done = this.active;
      this.active = null;
      this.completedCount++;
      this.index++;
      if (this.index >= this.list.length) this.storyDone = true;
      return { event: 'complete', mission: done };
    }
    const step = this.currentStep;
    this.applyStepSetup(step, game);
    return { event: 'step', mission: this.active, step };
  }

  objectiveText() {
    if (!this.active) {
      if (this.storyDone) return 'Story complete — Neon Bay is yours. Free roam!';
      const next = this.nextMission;
      return next ? `Next job: ${next.title} — drive to the yellow marker to start` : 'Free roam — explore Neon Bay';
    }
    const step = this.currentStep;
    if (!step) return this.active.title;
    let text = `${this.active.title}: ${step.text}`;
    if (step.kind === 'timed') text += ` — ${Math.max(0, Math.ceil(this.stepTimer))}s`;
    if (step.kind === 'hold' && this.holdTimer > 0) {
      text += ` — ${Math.max(0, step.holdSeconds - this.holdTimer).toFixed(1)}s`;
    }
    return text;
  }

  // Where the player should drive: the active step, or the next job's start.
  target() {
    if (this.active && this.currentStep) {
      const step = this.currentStep;
      if (step.x !== undefined) return { x: step.x, y: step.y, label: 'MISSION' };
    }
    if (!this.active && this.nextMission) {
      const first = this.nextMission.steps[0];
      if (first.kind === 'steal') return { x: this.city.landmarks.garage.x, y: this.city.landmarks.garage.y, label: 'NEXT JOB' };
      if (first.x !== undefined) return { x: first.x, y: first.y, label: 'NEXT JOB' };
    }
    return null;
  }

  // The pulsing beacon over the current objective, drawn in world space.
  drawMarker(ctx, time) {
    const target = this.target();
    if (!target) return;
    const pulse = 1 + Math.sin(time * 4) * 0.15;
    ctx.save();
    ctx.translate(target.x, target.y);
    ctx.strokeStyle = 'rgba(255, 211, 25, 0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 34 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 211, 25, 0.35)';
    ctx.beginPath();
    ctx.arc(0, 0, 52 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    // Downward arrow beacon.
    const bob = Math.sin(time * 3) * 6;
    ctx.fillStyle = '#ffd319';
    ctx.beginPath();
    ctx.moveTo(0, -66 + bob);
    ctx.lineTo(-11, -84 + bob);
    ctx.lineTo(11, -84 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.font = 'bold 13px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd319';
    ctx.fillText(target.label, 0, -92 + bob);
    ctx.restore();
  }
}

export { WORLD };
