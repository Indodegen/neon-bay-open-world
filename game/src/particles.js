// Particles: exhaust puffs, kicked-up dust, and collision sparks — the
// small moving things that make the city feel like a place, not a diorama.
let puffTexture = null;

function getPuffTexture() {
  if (puffTexture) return puffTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  puffTexture = new THREE.CanvasTexture(canvas);
  return puffTexture;
}

export function createParticles(scene, max = 90) {
  const pool = [];
  for (let i = 0; i < max; i += 1) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getPuffTexture(), transparent: true, opacity: 0, depthWrite: false,
    }));
    sprite.visible = false;
    scene.add(sprite);
    pool.push({ sprite, life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0, grow: 1, start: 1 });
  }
  return { scene, pool, next: 0 };
}

function spawn(sys, x, y, z, opts) {
  const p = sys.pool[sys.next];
  sys.next = (sys.next + 1) % sys.pool.length;
  p.sprite.visible = true;
  p.sprite.position.set(x, y, z);
  p.sprite.material.color.setHex(opts.color || 0x888888);
  p.sprite.material.opacity = opts.opacity ?? 0.5;
  p.sprite.scale.set(opts.size || 1, opts.size || 1, 1);
  p.life = 0;
  p.maxLife = opts.life || 0.9;
  p.vx = opts.vx || 0;
  p.vy = opts.vy || 0.8;
  p.vz = opts.vz || 0;
  p.grow = opts.grow || 1.6;
  p.start = opts.size || 1;
}

export function exhaustPuff(sys, x, y, z, heading) {
  spawn(sys, x - Math.sin(heading) * 2, y + 0.4, z - Math.cos(heading) * 2, {
    color: 0x777777, size: 0.8, life: 0.8, opacity: 0.4,
    vx: -Math.sin(heading) * 1.5, vy: 0.9, vz: -Math.cos(heading) * 1.5, grow: 2.2,
  });
}

export function dustPuff(sys, x, y, z) {
  spawn(sys, x, y + 0.3, z, {
    color: 0xc9b18a, size: 1.1, life: 0.9, opacity: 0.45,
    vx: (Math.random() - 0.5) * 1.5, vy: 0.7, vz: (Math.random() - 0.5) * 1.5, grow: 2.4,
  });
}

export function sparkBurst(sys, x, y, z) {
  for (let i = 0; i < 5; i += 1) {
    spawn(sys, x, y + 0.6, z, {
      color: 0xffb02e, size: 0.45, life: 0.45, opacity: 0.9,
      vx: (Math.random() - 0.5) * 6, vy: 1 + Math.random() * 3, vz: (Math.random() - 0.5) * 6, grow: 0.4,
    });
  }
}

export function updateParticles(sys, dt) {
  for (const p of sys.pool) {
    if (!p.sprite.visible) continue;
    p.life += dt;
    if (p.life >= p.maxLife) {
      p.sprite.visible = false;
      p.sprite.material.opacity = 0;
      continue;
    }
    const k = p.life / p.maxLife;
    p.sprite.position.x += p.vx * dt;
    p.sprite.position.y += p.vy * dt;
    p.sprite.position.z += p.vz * dt;
    const s = p.start * (1 + k * p.grow);
    p.sprite.scale.set(s, s, 1);
    p.sprite.material.opacity = (1 - k) * 0.5;
  }
}
