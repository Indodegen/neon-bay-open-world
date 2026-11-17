// config.js — Every tuning number and colour of NEON BAY in one place.
// Change the feel of the game here: speeds, wanted rules, payouts, palette.
export const WORLD = {
  width: 3600,
  height: 2600,
  roadWidth: 96,
  sidewalk: 16,
  // West edge: the sea and the sand.
  seaEdge: 150,
  beachEdge: 300,
  // South edge: Coral Bay, crossed by one bridge on Marlin Avenue.
  bayTop: 2380,
  bridgeX: 1600,
  bridgeHalfWidth: 46,
};

export const PALETTE = {
  skyTop: '#2b1055',
  skyMid: '#7597de',
  sunset: '#ff7e5f',
  neonPink: '#ff2e88',
  neonCyan: '#22e6ff',
  neonYellow: '#ffd319',
  neonPurple: '#b967ff',
  neonGreen: '#39ff88',
  asphalt: '#232030',
  asphaltEdge: '#17141f',
  roadLine: '#ffd319',
  sidewalk: '#3a3550',
  sand: '#e8c07a',
  seaDeep: '#0b2a4a',
  seaShallow: '#14608f',
  grass: '#2b4034',
  hudBg: 'rgba(12, 8, 28, 0.72)',
  hudBorder: 'rgba(255, 46, 136, 0.55)',
  text: '#fff6ec',
  textDim: '#c9b8e8',
};

export const PLAYER = {
  walkSpeed: 175,
  sprintSpeed: 285,
  radius: 13,
  maxHealth: 100,
  maxArmor: 100,
  punchDamage: 25,
  punchRange: 34,
  punchCooldown: 0.38,
  pistolDamage: 34,
  pistolAmmo: 24,
  pistolCooldown: 0.22,
  reloadTime: 1.1,
  bulletSpeed: 950,
};

// One entry per drivable body style. Handling is what makes them feel different.
export const CAR_TYPES = {
  sedan: { name: 'Sedan', topSpeed: 430, accel: 260, brake: 520, grip: 3.4, hp: 100, length: 52, width: 26, price: 0 },
  taxi: { name: 'Taxi', topSpeed: 410, accel: 250, brake: 520, grip: 3.4, hp: 100, length: 52, width: 26, price: 0 },
  sports: { name: 'Sunset GT', topSpeed: 560, accel: 360, brake: 560, grip: 4.6, hp: 90, length: 54, width: 26, price: 0 },
  truck: { name: 'Hauler', topSpeed: 330, accel: 170, brake: 420, grip: 2.6, hp: 160, length: 66, width: 28, price: 0 },
  van: { name: 'Van', topSpeed: 360, accel: 190, brake: 440, grip: 2.8, hp: 140, length: 60, width: 28, price: 0 },
  police: { name: 'Interceptor', topSpeed: 520, accel: 330, brake: 600, grip: 4.4, hp: 150, length: 54, width: 26, price: 0 },
};

export const CAR_COLORS = [
  '#ff2e88', '#22e6ff', '#ffd319', '#ff7e5f', '#b967ff', '#39ff88',
  '#e8e8f0', '#3a3f5c', '#ff4757', '#2ed573', '#ffa502', '#70a1ff',
];

export const WANTED = {
  maxStars: 5,
  decayDelay: 12, // seconds with no police nearby before stars start falling
  decayInterval: 8, // seconds per star lost while hidden
  stealCar: 1,
  killPedestrian: 1,
  shootNearPolice: 1,
  hitPoliceCar: 1,
  killOfficer: 2,
  // How many cruisers chase at each star level (index = stars).
  cruisersForStars: [0, 2, 3, 4, 5, 6],
  heliFromStars: 4,
  roadblockFromStars: 3,
};

export const ECONOMY = {
  repairCost: 150,
  bustedFine: 0.1, // fraction of cash lost when busted
  wastedFine: 0.1,
  nearMissBonus: 25,
  startCash: 250,
};

export const SAVE_KEY = 'neonbay-save-v1';
