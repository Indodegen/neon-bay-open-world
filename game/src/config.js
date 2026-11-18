// NEON BAY — config.js
// All tuning, world layout constants, vehicle defs, mission data, radio and
// character roster. Plain data + tiny helpers; no three.js dependency here so
// the HUD and the playtest harness can import it cheaply.

export const WORLD = {
  // City grid: avenues run north-south, streets east-west. Block pitch 46 m.
  half: 460,            // playable half-extent in metres (920 x 920 city)
  block: 46,
  roadW: 12,            // road width
  seaLevel: 0,
  beachX: 300,          // shoreline: x > beachX is sand, then bay water
  waterX: 330,
  islandX: 560,         // island centre x (bridge crosses the bay)
  islandZ: -60,
};

export const TIME = {
  startHour: 17.4,      // golden hour start — warm sunset light on load
  dayLength: 420,       // seconds for a full 24 h cycle
  goldenHour: [16.8, 18.6],
  night: [19.2, 5.8],
};

export const PLAYER = {
  walkSpeed: 5.2,
  runSpeed: 9.4,
  hpMax: 100,
  armorMax: 100,
  punchDamage: 12,
  pistolDamage: 34,
  pistolMag: 12,
  pistolReserveMax: 240,
  punchRange: 2.1,
  pistolRange: 90,
  shootCooldown: 0.22,
  interactRadius: 3.4,
};

export const VEHICLES = {
  sedan:   { name: 'Meridian',   label: 'Sedan',   top: 34, accel: 16, brake: 30, grip: 7.5, turn: 1.9, hp: 100, color: 0x8a94a6, seats: 4, price: 0 },
  sports:  { name: 'Vortex GT',  label: 'Sports',  top: 52, accel: 26, brake: 36, grip: 9.5, turn: 2.5, hp: 80,  color: 0xc22430, seats: 2, price: 0 },
  truck:   { name: 'Hauler',     label: 'Truck',   top: 26, accel: 11, brake: 24, grip: 6.0, turn: 1.4, hp: 160, color: 0x4d6b54, seats: 2, price: 0 },
  bike:    { name: 'Reaper',     label: 'Bike',    top: 46, accel: 30, brake: 30, grip: 8.0, turn: 3.1, hp: 50,  color: 0x1d1d22, seats: 2, price: 0 },
  boat:    { name: 'WaveRunner', label: 'Boat',    top: 38, accel: 18, brake: 18, grip: 5.0, turn: 1.7, hp: 120, color: 0xe8e8e8, seats: 4, price: 0 },
  police:  { name: 'Interceptor',label: 'Police',  top: 44, accel: 22, brake: 34, grip: 9.0, turn: 2.3, hp: 140, color: 0x101418, seats: 4, price: 0 },
};

export const POLICE_NAMES = [
  'Unit 7 "Falcon"', 'Unit 12 "Viper"', 'Unit 3 "Hawk"', 'Unit 21 "Raptor"',
  'Unit 9 "Cobra"', 'Unit 15 "Ghost"', 'Unit 4 "Sable"', 'Unit 30 "Titan"',
];
export const HELI_NAME = 'Air-1 "Sentinel"';
export const BOAT_NAME = 'Marine-2 "Tide"';

// Wanted thresholds: crimes add heat; stars = f(heat). Decay while clean.
export const WANTED = {
  heatPerKill: 55,
  heatPerCarjack: 18,
  heatPerCrash: 4,
  heatPerSpeeding: 0.4,
  decayPerSec: 2.2,      // clean driving decays heat
  starAt: [0, 30, 80, 160, 260, 400], // heat needed for stars 0..5
  maxUnits: [0, 2, 3, 4, 5, 6],
  roadblockAt: 3,
  heliAt: 4,
  spikeAt: 3,
};

export const RADIO = [
  { id: 'neon', name: 'NEON FM 88.4', desc: 'Synthwave nights', color: '#ff2e88' },
  { id: 'bay',  name: 'BAY 101.2',    desc: 'Coastal rock',     color: '#ffb347' },
  { id: 'talk', name: 'TALK 640 AM',  desc: 'Coral Bay news',   color: '#7fd4ff' },
  { id: 'bass', name: 'BASS 97.9',    desc: 'Club & bass',      color: '#b26bff' },
];

export const CHARACTERS = {
  vera:  { name: 'Vera Solano', role: 'Fixer', skin: '#c98d64', hair: '#1a1210', hairStyle: 'bob',  accent: '#ff2e88', desc: 'The fixer who runs Coral Bay from a glass office above the marina.' },
  marcus:{ name: 'Marcus Hale', role: 'Wheelman', skin: '#8a5a3b', hair: '#0d0d0d', hairStyle: 'fade', accent: '#ffb347', desc: 'Ex-racer. Drives anything, asks nothing.' },
  lena:  { name: 'Lena Cross',  role: 'Hacker', skin: '#e8b48f', hair: '#3a2a1a', hairStyle: 'pony', accent: '#7fd4ff', desc: 'Keeps the cameras blind and the alarms asleep.' },
  diego: { name: 'Diego Ramos', role: 'Enforcer', skin: '#a06a42', hair: '#111111', hairStyle: 'buzz', accent: '#ff5a3c', desc: 'Quiet. Carries the heavy bag. Never misses a meeting.' },
  sarge: { name: 'Sgt. Cole Reyes', role: 'CBPD', skin: '#d9a077', hair: '#2b2b2b', hairStyle: 'flat', accent: '#4d7dff', desc: 'Coral Bay PD. Knows every face in the city — especially yours.' },
  kai:   { name: 'Kai Tanaka',  role: 'Rival', skin: '#e0aa7e', hair: '#0a0a0a', hairStyle: 'spike', accent: '#b26bff', desc: 'Street-race king of the bay bridge. Fast, loud, beatable.' },
};

// 12 story missions for fixer Vera Solano. Stage types:
// goto | collect | hold | survive | steal | eliminate | race | stunt
export const MISSIONS = [
  { id: 1,  name: 'First Light',      pay: 400,  giver: 'vera',   blurb: 'Vera needs a driver. Pick up the package at the marina and bring it to the safehouse — no police, no questions.',
    stages: [ { type: 'goto', x: 356, z: 120, label: 'Pick up the package at the marina' },
              { type: 'goto', x: -32, z: 180, label: 'Deliver the package to the safehouse', drive: true } ] },
  { id: 2,  name: 'Neon Debt',        pay: 650,  giver: 'vera',   blurb: 'A club owner owes Vera. Collect the cash from the Neon District — quietly, or loudly. Your call.',
    stages: [ { type: 'goto', x: 120, z: -140, label: 'Reach the Neon District club', drive: true },
              { type: 'collect', x: 120, z: -140, n: 3, label: 'Collect the cash (3 stashes)' },
              { type: 'goto', x: -32, z: 180, label: 'Bring the cash to Vera', drive: true } ] },
  { id: 3,  name: 'Hot Wheels',       pay: 900,  giver: 'marcus', blurb: 'Marcus found a Vortex GT parked by the beach. Steal it — then lose the cops before the handoff.',
    stages: [ { type: 'steal', x: 250, z: 60, label: 'Steal the Vortex GT', vehicle: 'sports' },
              { type: 'survive', secs: 25, label: 'Lose the cops — stay out of sight for 25 s' },
              { type: 'goto', x: -180, z: -66, label: 'Deliver the car to the garage', drive: true } ] },
  { id: 4,  name: 'Static',           pay: 1200, giver: 'lena',   blurb: 'Lena needs the police cameras down for one night. Hit the three relay boxes in the park district.',
    stages: [ { type: 'collect', x: -120, z: 60, n: 3, label: 'Sabotage the 3 relay boxes in the park' },
              { type: 'goto', x: -32, z: 180, label: 'Get back to the safehouse', drive: true } ] },
  { id: 5,  name: 'Bridge Run',       pay: 1500, giver: 'kai',    blurb: 'Kai challenged you to a bridge race at dusk. Beat him across the bay — first past the island checkpoint wins.',
    stages: [ { type: 'goto', x: 300, z: -60, label: 'Reach the bridge start line', drive: true },
              { type: 'race', x: 300, z: -60, label: 'Race Kai across the bay bridge', rival: true },
              { type: 'goto', x: 560, z: -60, label: 'Cross the island checkpoint', drive: true } ] },
  { id: 6,  name: 'Heavy Lifting',    pay: 1800, giver: 'diego',  blurb: 'Diego\'s truck is loaded and the docks are crawling with rivals. Clear the dock and drive the Hauler out.',
    stages: [ { type: 'eliminate', x: 330, z: 220, n: 4, label: 'Clear the dock rivals (4)' },
              { type: 'steal', x: 330, z: 220, label: 'Take the Hauler truck', vehicle: 'truck' },
              { type: 'goto', x: -180, z: -66, label: 'Drive the Hauler to the garage', drive: true } ] },
  { id: 7,  name: 'Rain Check',       pay: 2200, giver: 'vera',   blurb: 'A storm is coming and so is a shipment. Hold the pier warehouse until Lena cracks the manifest.',
    stages: [ { type: 'goto', x: 345, z: 220, label: 'Reach the pier warehouse', drive: true },
              { type: 'hold', secs: 40, x: 345, z: 220, label: 'Hold the warehouse for 40 s' },
              { type: 'collect', x: 345, z: 220, n: 2, label: 'Grab the manifest crates (2)' } ] },
  { id: 8,  name: 'Air Support',      pay: 2600, giver: 'lena',   blurb: 'The heli is on you and the streets are boxed in. Reach the tunnel under the highway and wait it out.',
    stages: [ { type: 'goto', x: 60, z: 240, label: 'Reach the highway tunnel', drive: true },
              { type: 'survive', secs: 30, label: 'Stay hidden in the tunnel for 30 s' },
              { type: 'goto', x: -32, z: 180, label: 'Slip back to the safehouse', drive: true } ] },
  { id: 9,  name: 'High Tide',        pay: 3000, giver: 'marcus', blurb: 'A WaveRunner full of cargo is docked at the island. Take it, outrun the marine unit, beach it at the south cove.',
    stages: [ { type: 'steal', x: 560, z: -20, label: 'Take the WaveRunner at the island dock', vehicle: 'boat' },
              { type: 'goto', x: 340, z: 260, label: 'Outrun the marine unit to the south cove', drive: true } ] },
  { id: 10, name: 'Ferris Fall',      pay: 3500, giver: 'vera',   blurb: 'The ferris wheel is the drop point tonight. Climb the park, grab the case, and get out before the crew arrives.',
    stages: [ { type: 'goto', x: -120, z: 60, label: 'Reach the ferris wheel', drive: true },
              { type: 'collect', x: -120, z: 60, n: 1, label: 'Grab the case at the ferris wheel' },
              { type: 'eliminate', x: -120, z: 60, n: 3, label: 'The crew arrived — clear them (3)' },
              { type: 'goto', x: -32, z: 180, label: 'Deliver the case to Vera', drive: true } ] },
  { id: 11, name: 'Night Shift',      pay: 4200, giver: 'diego',  blurb: 'Three warehouses, one night, no alarms. Hit all three in the industrial district — fast and quiet.',
    stages: [ { type: 'goto', x: -260, z: -200, label: 'Warehouse 1 — industrial district', drive: true },
              { type: 'collect', x: -260, z: -200, n: 1, label: 'Empty warehouse 1' },
              { type: 'goto', x: -260, z: 120, label: 'Warehouse 2', drive: true },
              { type: 'collect', x: -260, z: 120, n: 1, label: 'Empty warehouse 2' },
              { type: 'goto', x: 120, z: 220, label: 'Warehouse 3', drive: true },
              { type: 'collect', x: 120, z: 220, n: 1, label: 'Empty warehouse 3' } ] },
  { id: 12, name: 'Golden Hour',      pay: 5000, giver: 'vera',   blurb: 'The final job. A convoy crosses the bridge at sunset — take the lead car, lose the whole city, and Coral Bay is yours.',
    stages: [ { type: 'steal', x: 300, z: -60, label: 'Intercept the convoy on the bridge', vehicle: 'sports' },
              { type: 'survive', secs: 45, label: 'Lose the full 5-star pursuit for 45 s' },
              { type: 'goto', x: -32, z: 180, label: 'Bring it home to the safehouse', drive: true } ] },
];

export const SIDE_JOBS = [
  { id: 'taxi',    name: 'Taxi Fare',     pay: 120, desc: 'Pick up a fare and drop them off fast. Tip for speed.' },
  { id: 'courier', name: 'Courier Run',   pay: 160, desc: 'Three parcels, one timer. Deliver them all.' },
  { id: 'race',    name: 'Street Race',   pay: 400, desc: 'Three laps around the bay circuit. Beat the rivals.' },
  { id: 'stunt',   name: 'Stunt Jump',    pay: 200, desc: 'Hit the ramp at speed and land it clean.' },
];

export const STASHES = [
  { x: 210, z: -180, note: 'Rooftop stash, Neon District' },
  { x: -200, z: 200, note: 'Park bench stash' },
  { x: 340, z: 40,  note: 'Pier crate stash' },
  { x: 560, z: -110, note: 'Island palm stash' },
  { x: -60, z: -260, note: 'Alley stash, north end' },
  { x: 60, z: 260,  note: 'Tunnel stash' },
  { x: -254, z: -40, note: 'Industrial stash' },
  { x: 154, z: 140,  note: 'Market stall stash' },
];

export const PROPERTIES = [
  { id: 'safehouse', name: 'Safehouse', x: -32, z: 180, price: 0, owned: true, income: 0 },
  { id: 'garage',    name: 'Neon Garage', x: -180, z: -66, price: 15000, owned: false, income: 0 },
  { id: 'marina',    name: 'Marina Loft', x: 356, z: 120, price: 40000, owned: false, income: 0 },
];

export const GARAGE_UPGRADES = [
  { id: 'engine', name: 'Engine Tuning',   levels: [0, 1200, 3000, 6500], desc: '+top speed & acceleration' },
  { id: 'armor',  name: 'Armor Plating',   levels: [0, 1500, 3500, 7000], desc: '+vehicle durability' },
  { id: 'brakes', name: 'Race Brakes',     levels: [0, 900, 2200, 4800],  desc: '+braking & grip' },
  { id: 'respray',name: 'Respray',         levels: [0, 500, 500, 500],     desc: 'New paint — pick a colour' },
];

export const WEATHER_NAMES = ['Clear', 'Cloudy', 'Rain', 'Storm'];
export const STREETS = [
  'Neon Ave', 'Coral Blvd', 'Sunset Dr', 'Harbor St', 'Palm Row', 'Bayview Ln',
  'Marina Way', 'Ocean Pkwy', 'Juniper St', 'Crescent Ave', 'Lighthouse Rd', 'Tide St',
];
