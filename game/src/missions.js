// NEON BAY — missions.js
// Eight story missions for the fixer Vera Solano. Each mission is a chain of
// stages — drive to a marker, pick up a package, deliver it, lose the cops,
// ram a target — with a briefing, an objective line on the HUD, and a cash
// payout. Completing one unlocks the next, autosaves, and plays the jingle.
// Missions use the city's real landmarks so the minimap and the off-screen
// objective arrow always point somewhere the player can actually drive to.

export const MISSIONS = [
  {
    id: 1, title: 'First Fare', payout: 400,
    briefing: 'Vera Solano: "Kid, you want work in Neon Bay? Prove it. Pick up my package at Sunset Pier and bring it to the Neon Strip. No cops, no dents — my clients pay for clean."',
    stages: [
      { kind: 'goto', x: 3930, y: 2050, label: 'Pick up the package at Sunset Pier', landmark: 'pier' },
      { kind: 'deliver', x: 960, y: 1560, label: 'Deliver the package to the Neon Strip', landmark: 'strip' },
    ],
  },
  {
    id: 2, title: 'The Luna Job', payout: 650,
    briefing: 'Vera: "The Luna Casino skimmed my cut. Go to the casino, grab the cash bag from the back door, and drop it at my office. Fast feet, faster car."',
    stages: [
      { kind: 'goto', x: 960, y: 2360, label: 'Grab the cash bag at Luna Casino', landmark: 'casino' },
      { kind: 'deliver', x: 960, y: 1860, label: 'Drop the bag at Vera\'s Office', landmark: 'veraOffice' },
    ],
  },
  {
    id: 3, title: 'Hot Wheels', payout: 800,
    briefing: 'Vera: "A client wants a Vortex GT, no questions. Steal the sportscar parked by the Marina Dock and bring it to Rico\'s Garage. The cops will not like it. I do not care."',
    stages: [
      { kind: 'steal', x: 3360, y: 1560, label: 'Steal the Vortex GT at Marina Dock', landmark: 'marinaDock' },
      { kind: 'deliver', x: 2760, y: 1860, label: 'Deliver the Vortex GT to Rico\'s Garage', landmark: 'garage', needCar: 'sport' },
    ],
  },
  {
    id: 4, title: 'Bay Run', payout: 950,
    briefing: 'Vera: "The Isla Verde Resort needs a delivery and the bridge is the only way over. Take the package across the bridge to the island. Do not stop. Do not look down."',
    stages: [
      { kind: 'goto', x: 3360, y: 1560, label: 'Collect the resort package at Marina Dock', landmark: 'marinaDock' },
      { kind: 'deliver', x: 4340, y: 770, label: 'Cross the bridge — deliver to Isla Verde Resort', landmark: 'islandResort' },
    ],
  },
  {
    id: 5, title: 'Heat Wave', payout: 1200,
    briefing: 'Vera: "You made the NBPD list, kid. Lose a 2-star wanted level, then meet me at the pier. If you bring the heat with you, the deal is off."',
    stages: [
      { kind: 'escape', x: 3930, y: 2050, label: 'Lose the cops (drop to 0 stars), then reach Sunset Pier', landmark: 'pier', needStars: 0 },
    ],
  },
  {
    id: 6, title: 'The Informant', payout: 1500,
    briefing: 'Vera: "An informant is talking at Coral General. Shut him up — drive your car into his ride outside the hospital and make sure he remembers who runs this bay."',
    stages: [
      { kind: 'ram', x: 1560, y: 860, label: 'Ram the informant\'s car outside Coral General', landmark: 'hospital' },
      { kind: 'deliver', x: 960, y: 1860, label: 'Report back to Vera\'s Office', landmark: 'veraOffice' },
    ],
  },
  {
    id: 7, title: 'Airfield Run', payout: 2000,
    briefing: 'Vera: "A plane lands at Bay Airfield at midnight with my cargo. Pick it up and get it to the Old Port warehouse before the NBPD sets up roadblocks. This one pays real money."',
    stages: [
      { kind: 'goto', x: 960, y: 2860, label: 'Pick up the cargo at Bay Airfield', landmark: 'airport' },
      { kind: 'deliver', x: 960, y: 2560, label: 'Deliver the cargo to the Old Port', landmark: 'port' },
    ],
  },
  {
    id: 8, title: 'Queen of the Bay', payout: 2500,
    briefing: 'Vera: "Last job, kid. The whole city is watching. Take the tribute from the casino to the island resort, lose any tail, and Neon Bay is ours. Make me proud."',
    stages: [
      { kind: 'goto', x: 960, y: 2360, label: 'Collect the tribute at Luna Casino', landmark: 'casino' },
      { kind: 'deliver', x: 4340, y: 770, label: 'Deliver the tribute to Isla Verde Resort', landmark: 'islandResort' },
    ],
  },
];

export function missionByIndex(i) {
  return MISSIONS[Math.min(i, MISSIONS.length - 1)];
}

export function startMissionState(game, index) {
  const m = missionByIndex(index);
  game.mission = m;
  game.missionStage = 0;
  game.missionIndex = index;
  game.missionActive = true;
  game.missionTarget = null;
  game.showBriefing(m);
  return m;
}

export function currentStage(game) {
  if (!game.missionActive || !game.mission) return null;
  return game.mission.stages[game.missionStage] || null;
}

export function stageTarget(game) {
  const s = currentStage(game);
  if (!s) return null;
  return { x: s.x, y: s.y, label: s.label, kind: s.kind };
}

// Called every frame; returns 'complete' | 'stage' | null.
export function updateMission(game, dt) {
  const s = currentStage(game);
  if (!s) return null;
  const p = game.player;
  const d = Math.hypot(p.x - s.x, p.y - s.y);
  const inCar = !!game.playerCar;

  if (s.kind === 'steal') {
    // Complete when the player is driving any sportscar near the marker.
    if (inCar && game.playerCar.type === 'sport' && d < 220) return advanceStage(game);
    if (d < 120 && !inCar) {
      game.hint('Steal a Vortex GT nearby — press E next to a sportscar', 2);
    }
    return null;
  }
  if (s.kind === 'escape') {
    if (game.wantedStars === 0 && d < 130) return advanceStage(game);
    if (game.wantedStars > 0 && d < 130) {
      game.hint('Lose the cops first — wanted level must be 0 stars', 2);
    }
    return null;
  }
  if (s.kind === 'ram') {
    // The target car waits by the hospital; ramming it at speed completes.
    if (!game.missionTarget) {
      game.spawnMissionTarget(s.x, s.y);
    }
    const t = game.missionTarget;
    if (t && inCar && Math.abs(game.playerCar.speed) > 140 &&
        Math.hypot(game.playerCar.x - t.x, game.playerCar.y - t.y) < 60) {
      game.damageMissionTarget(120);
      return advanceStage(game);
    }
    return null;
  }
  // goto / deliver: reach the marker (deliver prefers a car, but on foot counts).
  const radius = s.kind === 'deliver' ? 110 : 120;
  if (d < radius) return advanceStage(game);
  return null;
}

export function advanceStage(game) {
  game.missionStage++;
  if (game.audio) game.audio.pickup();
  if (game.missionStage >= game.mission.stages.length) {
    completeMission(game);
    return 'complete';
  }
  const next = currentStage(game);
  game.flashMessage('OBJECTIVE: ' + next.label, '#ffe600');
  return 'stage';
}

export function completeMission(game) {
  const m = game.mission;
  game.money += m.payout;
  game.totalEarned += m.payout;
  game.completedMissions.push(m.id);
  game.missionActive = false;
  game.mission = null;
  game.missionStage = 0;
  game.missionTarget = null;
  if (game.audio) game.audio.missionJingle();
  game.flashMessage('MISSION COMPLETE — ' + m.title + '  +' + '$' + m.payout, '#7cff00');
  game.showMissionComplete(m);
  game.autosave();
  // Next mission unlocks; the player starts it from the pause menu or by
  // driving to Vera's office marker.
  if (game.missionIndex < MISSIONS.length - 1) {
    game.missionIndex++;
  }
}
