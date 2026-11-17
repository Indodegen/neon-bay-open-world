// NEON BAY — shots.js
// Screenshot staging: ?shot=cover|onfoot|chase|mission (plus &seed=) puts the
// live game into a composed, readable scene — the same systems the player
// sees, staged at their best: dusk neon for the cover, the beach on foot,
// a rainy 4-star chase, and a mission in progress. The game is never paused
// for a shot; it keeps running, so every screenshot is a real render.

import { missionByIndex } from './missions.js';

export function applyShotPreset(game, search) {
  const params = new URLSearchParams(search || '');
  const shot = params.get('shot');
  if (!shot) return false;
  const seed = Number(params.get('seed') || 7);
  game.shotMode = shot;
  game.state = 'playing';
  game.started = true;
  game.timeOfDay = 17.4;
  game.rain = 0;
  game.heat = 0;
  game.wantedStars = 0;

  if (shot === 'cover') {
    // Dusk neon downtown: the player in a Vortex GT, 2-star chase behind,
    // mission 1 live, traffic and pedestrians everywhere.
    game.timeOfDay = 18.7;
    game.rain = 0.35;
    game.placePlayerInCar('sport', 1500, 1300, 0);
    game.setWanted(2);
    game.spawnCruiserBehind(2);
    game.startMissionIndex(0, 0);
    game.cameraSnap();
  } else if (shot === 'onfoot') {
    // Bright midday on the beachfront: on foot by Sunset Pier, mission 1's
    // pickup marker right ahead, palms, beach and bay in frame.
    game.timeOfDay = 11.2;
    game.rain = 0;
    game.placePlayerOnFoot(3840, 1900, Math.PI / 2);
    game.startMissionIndex(0, 0);
    game.cameraSnap();
  } else if (shot === 'chase') {
    // Rainy night on the Neon Strip: 4 stars, cruisers, roadblock ahead and
    // the helicopter's searchlight — wet-road neon reflections everywhere.
    game.timeOfDay = 21.6;
    game.rain = 0.9;
    game.placePlayerInCar('sport', 1500, 1800, 0);
    game.setWanted(4);
    game.spawnCruiserBehind(3);
    game.spawnRoadblockAhead();
    game.startMissionIndex(3, 1);
    game.cameraSnap();
  } else if (shot === 'mission') {
    // Golden hour: mission 2 in progress at Luna Casino, player in a Surf
    // Van, cash bag marker on the minimap and the objective arrow on screen.
    game.timeOfDay = 16.4;
    game.rain = 0;
    game.placePlayerInCar('van', 900, 2140, Math.PI / 2);
    game.startMissionIndex(1, 0);
    game.cameraSnap();
  } else {
    return false;
  }
  // Pin the staged weather so the scene cannot drift before the shutter.
  game.shotRain = game.rain;
  game.shotTime = game.timeOfDay;
  return true;
}

export function shotList() {
  return [
    { name: '1-cover.jpg', query: '?shot=cover&seed=7' },
    { name: '2-on-foot.jpg', query: '?shot=onfoot&seed=7' },
    { name: '3-chase.jpg', query: '?shot=chase&seed=7' },
    { name: '4-mission.jpg', query: '?shot=mission&seed=7' },
  ];
}
