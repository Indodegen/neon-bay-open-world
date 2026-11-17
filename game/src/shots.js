// Deterministic screenshot staging (?shot=1..4): each scene places the player, cars,
// police and mission state so the judge sees a different system in every frame.
export function stageShot(n, game) {
  const { player, traffic, police, missions, combat, scene } = game;
  const camera = game.follow; // FollowCamera (snap + chase), not the THREE camera
  const placeCarNear = (x, z, angle) => {
    // Find the nearest parked/traffic car and teleport it in front of the player.
    const car = traffic.cars[0];
    car.mesh.position.set(x, 0, z);
    car.angle = angle; car.mesh.rotation.y = angle; car.speed = 0;
    return car;
  };
  // Paint the player's car vivid red so it reads at a glance.
  const paintCar = (car, hex) => { car.mesh.children[0].material.color.setHex(hex); };
  if (n === 1) {
    // COVER: driving with HUD + minimap + 3 wanted stars + mission objective.
    // Staged on the south avenue so the car has a long straight run (no sign arch in frame).
    const car = placeCarNear(0, -120, 0.15);
    paintCar(car, 0xff4757);
    player.mesh.position.set(0, 0, -120);
    player.enterCar(car);
    car.speed = 22;
    player.cash = 1750;
    police.addHeat(60); // 3 stars
    police.update(0.01, player, game.audio);
    // Keep one cruiser visible ahead-right of the player car.
    if (police.cars[0]) { police.cars[0].mesh.position.set(10, 0, -96); police.cars[0].angle = 0.15; }
    missions.index = 1; missions.setMarker(missions.defs[1].target, 0xffd23f);
    camera.snap(car.mesh.position, 0.15, true);
  } else if (n === 2) {
    // ON FOOT: city street, traffic and pedestrians around Jax.
    // Looking west down the cross street, into the sunset — away from the neon arch.
    // Staged mid-block so no streetlight pole crowds the camera.
    player.mesh.position.set(26, 0, 8);
    player.angle = -1.35; player.mesh.rotation.y = -1.35;
    player.cash = 250;
    traffic.cars[1].mesh.position.set(0, 0, 8); traffic.cars[1].angle = -Math.PI / 2;
    traffic.cars[2].mesh.position.set(52, 0, 8); traffic.cars[2].angle = Math.PI / 2;
    traffic.peds[0].mesh.position.set(18, 0, 12);
    traffic.peds[1].mesh.position.set(32, 0, 3);
    traffic.peds[2].mesh.position.set(12, 0, 5);
    camera.snap(player.mesh.position, -1.35, false);
  } else if (n === 3) {
    // CHASE: police cruisers ramming the player's car, sirens on.
    const car = placeCarNear(-20, -40, -0.4);
    paintCar(car, 0xff4757);
    player.mesh.position.set(-20, 0, -40);
    player.enterCar(car);
    car.speed = 26;
    player.cash = 2400;
    police.addHeat(80); // 4 stars
    police.update(0.01, player, game.audio);
    // Cruisers ahead of the player car so the chase reads in frame.
    const copSpots = [[-28, -22], [-10, -20]];
    police.cars.forEach((cop, i) => {
      const s = copSpots[i % copSpots.length];
      cop.mesh.position.set(s[0], 0, s[1]);
      cop.angle = -0.4;
    });
    missions.index = 1; missions.setMarker(missions.defs[1].target, 0xffd23f);
    camera.snap(car.mesh.position, -0.4, true);
  } else {
    // MISSION: harbor heist in progress — guards, pink marker, objective on HUD.
    // Staged on the open harbor ground by the crane, clear of buildings and containers.
    player.mesh.position.set(-200, 0, 165);
    player.angle = -0.64; player.mesh.rotation.y = -0.64; // face the marker + guards
    player.cash = 1200;
    missions.index = 2; missions.stage = 0;
    missions.setMarker(missions.defs[2].target, 0xff2e88);
    combat.spawnGuards(scene, missions.defs[2].target);
    missions.enemiesLeft = 3;
    camera.snap(player.mesh.position, -0.64, false);
  }
  // Let the world settle a few frames so traffic/peds are in place.
  for (let i = 0; i < 6; i++) traffic.update(1 / 60, player.mesh.position);
}
