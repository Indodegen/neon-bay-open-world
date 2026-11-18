// The on-foot hero: a simple articulated figure (jacket, cap, jeans) with a
// walk/run cycle, plus the third-person follow camera with mouse orbit.
import { clamp, damp, angleDelta, resolveCircleBox } from './utils.js';

export const WALK_SPEED = 5.2;
export const RUN_SPEED = 9.5;

export function createPlayer(scene) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const jacket = new THREE.MeshLambertMaterial({ color: 0x1f6fb2 });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x2a3242 });
  const cap = new THREE.MeshLambertMaterial({ color: 0xe23b3b });
  const shoe = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.85, 0.42), jacket);
  torso.position.y = 1.18;
  torso.castShadow = true;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), skin);
  head.position.y = 1.86;
  head.castShadow = true;
  group.add(head);
  const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.32, 0.12, 12), cap);
  capTop.position.y = 2.06;
  group.add(capTop);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.3), cap);
  brim.position.set(0, 2.0, 0.3);
  group.add(brim);

  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.78, 0.2), jacket);
  armL.position.set(-0.48, 1.22, 0);
  armL.castShadow = true;
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.48;
  group.add(armR);

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.82, 0.26), jeans);
  legL.position.set(-0.19, 0.42, 0);
  legL.castShadow = true;
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.19;
  group.add(legR);

  const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.5), shoe);
  shoeL.position.set(-0.19, 0.06, 0.08);
  group.add(shoeL);
  const shoeR = shoeL.clone();
  shoeR.position.x = 0.19;
  group.add(shoeR);

  // A pistol held in the right hand when armed.
  const gun = new THREE.Group();
  const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.42),
    new THREE.MeshLambertMaterial({ color: 0x222222 }));
  gun.add(gunBody);
  gun.position.set(0.48, 0.95, 0.25);
  gun.visible = false;
  group.add(gun);

  scene.add(group);
  return {
    group, armL, armR, legL, legR, shoeL, shoeR, torso, gun,
    x: 0, z: 10, heading: 0, speed: 0, walkPhase: 0,
    health: 100, maxHealth: 100, armed: false, ammo: 12, reserveAmmo: 48,
    radius: 0.55, moving: false, punching: 0, shootCooldown: 0,
    cameraYaw: 0, cameraPitch: 0.32, cameraDist: 8.5,
  };
}

/** Move the hero on foot. `input` carries the pressed-key set and camera yaw. */
export function updatePlayerOnFoot(player, input, dt, world, others) {
  const forward = (input.has('KeyW') || input.has('ArrowUp') ? 1 : 0)
    - (input.has('KeyS') || input.has('ArrowDown') ? 1 : 0);
  const strafe = (input.has('KeyD') || input.has('ArrowRight') ? 1 : 0)
    - (input.has('KeyA') || input.has('ArrowLeft') ? 1 : 0);
  const running = input.has('ShiftLeft') || input.has('ShiftRight');
  const targetSpeed = (forward !== 0 || strafe !== 0)
    ? (running ? RUN_SPEED : WALK_SPEED) : 0;
  player.speed = damp(player.speed, targetSpeed, 10, dt);
  player.moving = player.speed > 0.4;

  if (player.moving) {
    const yaw = player.cameraYaw;
    // Heading faces the movement direction; camera yaw drives it.
    const desired = Math.atan2(
      Math.sin(yaw) * forward + Math.cos(yaw) * strafe,
      Math.cos(yaw) * forward - Math.sin(yaw) * strafe,
    );
    player.heading += angleDelta(player.heading, desired) * Math.min(1, dt * 12);
    const step = player.speed * dt;
    player.x += Math.sin(player.heading) * step;
    player.z += Math.cos(player.heading) * step;
    player.walkPhase += dt * player.speed * 1.55;
  }

  // Building collisions + world bounds.
  for (const box of world.colliders) {
    if (box.island) continue;
    const push = resolveCircleBox(player.x, player.z, player.radius, box);
    if (push) { player.x += push.x; player.z += push.z; }
  }
  player.x = clamp(player.x, -272, 512);
  player.z = clamp(player.z, -272, 212);

  // Soft push from cars and pedestrians so bodies never overlap.
  for (const other of others) {
    if (!other || other.dead) continue;
    const dx = player.x - other.x;
    const dz = player.z - other.z;
    const d = Math.hypot(dx, dz);
    const min = player.radius + (other.radius || 0.55);
    if (d > 0.001 && d < min) {
      player.x += (dx / d) * (min - d);
      player.z += (dz / d) * (min - d);
    }
  }

  // Walk-cycle animation.
  const swing = player.moving ? Math.sin(player.walkPhase) * (running ? 0.85 : 0.55) : 0;
  player.legL.rotation.x = swing;
  player.legR.rotation.x = -swing;
  player.armL.rotation.x = -swing * 0.8;
  player.armR.rotation.x = player.armed ? -1.1 : swing * 0.8;
  player.shoeL.position.y = 0.06 + Math.max(0, Math.sin(player.walkPhase)) * 0.12;
  player.shoeR.position.y = 0.06 + Math.max(0, -Math.sin(player.walkPhase)) * 0.12;
  const bob = player.moving ? Math.abs(Math.sin(player.walkPhase)) * 0.07 : 0;
  player.group.position.set(player.x, bob, player.z);
  player.group.rotation.y = player.heading;
  player.gun.visible = player.armed;
  // Note: punching / shoot cooldowns tick in main.js's step(), not here,
  // so they also count down while the player is driving.
}

/** Third-person camera: follows the hero or the driven car, orbit by mouse drag. */
export function updateCamera(camera, player, car, dt, world) {
  const focus = car
    ? { x: car.x, z: car.z, heading: car.heading, height: 1.6 }
    : { x: player.x, z: player.z, heading: player.heading, height: 1.7 };
  const dist = car ? 12.5 : player.cameraDist;
  const pitch = car ? 0.30 : player.cameraPitch;
  const yaw = car ? car.cameraYaw : player.cameraYaw;
  const backX = focus.x - Math.sin(yaw) * Math.cos(pitch) * dist;
  const backZ = focus.z - Math.cos(yaw) * Math.cos(pitch) * dist;
  const backY = focus.height + Math.sin(pitch) * dist + (car ? 2.2 : 1.2);
  const eye = { x: backX, y: backY, z: backZ };
  if (world) liftCameraEye(eye, world);
  const k = 1 - Math.exp(-dt * 7);
  camera.position.x += (eye.x - camera.position.x) * k;
  camera.position.y += (eye.y - camera.position.y) * k;
  camera.position.z += (eye.z - camera.position.z) * k;
  camera.lookAt(focus.x, focus.height + 0.6, focus.z);
}

/** Cinematic camera for staged shots: fixed offset from a focus point. */
export function setCinematicCamera(camera, focusX, focusY, focusZ, eyeX, eyeY, eyeZ, world) {
  let y = eyeY;
  if (world) {
    for (const b of world.buildings) {
      if (Math.abs(eyeX - b.x) < b.w / 2 + 1 && Math.abs(eyeZ - b.z) < b.d / 2 + 1) {
        y = Math.max(y, b.h + 4);
      }
    }
  }
  camera.position.set(eyeX, y, eyeZ);
  camera.lookAt(focusX, focusY, focusZ);
}

/** Keep a follow-camera eye out of building volumes: lift it above the roof. */
export function liftCameraEye(eye, world) {
  for (const b of world.buildings) {
    if (Math.abs(eye.x - b.x) < b.w / 2 + 1.2 && Math.abs(eye.z - b.z) < b.d / 2 + 1.2) {
      eye.y = Math.max(eye.y, b.h + 3.5);
    }
  }
  return eye;
}
