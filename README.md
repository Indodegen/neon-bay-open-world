# NEON BAY — Coral Bay Open World

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Indodegen/neon-bay-open-world/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Indodegen/neon-bay-open-world/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

A complete 3D open-world crime game for the make.fun **gta6-01 "Make GTA 6"**
bounty. An original sun-soaked coastal city, "Coral Bay": no GTA assets,
names or story — everything here is original work.

## Play

```sh
node serve.ts        # http://localhost:8080
```

**Controls:** WASD drive / walk · Shift run · F enter/exit car · E interact ·
LMB shoot / punch · Q switch weapon · R reload · Space brake · M map ·
P pause · J side jobs · 1–4 radio · C camera · V weather.

## What's inside

- **World:** avenue/street grid city, lit-window facades + flickering neon
  signs, beach + animated bay, bridge to an island, docks + pier, park with a
  rotating ferris wheel, market stalls, streetlights, traffic signs,
  street-name blades, cruising boats, bird flocks, palms, clouds, fog.
- **Time & weather:** full day/night cycle (golden hour → neon night →
  morning), rain + storm + lightning, wet roads, fog that closes in with rain.
- **Vehicles:** 6 types (sedan, sports, truck, bike, boat, police cruiser)
  with distinct handling, body roll + pitch, damage, smoke, crash damage and
  car-vs-car shove.
- **Police 0–5 stars:** named units (Unit 7 "Falcon"…) with PURSUIT / RAMMING /
  BOXING IN / SEARCHLIGHT / ROADBLOCK statuses, foot cops (arrest on foot),
  roadblocks + spike strips at 3★+, helicopter with searchlight at 4★+,
  marine unit in boats, heat decay on clean driving.
- **Missions:** 12 story missions for fixer Vera Solano ($400–$5,000) with
  varied stage types, plus taxi / courier / street-race / stunt side jobs,
  8 neon stashes, 3 properties, street-cash pickups, near-miss bonuses.
- **Combat:** punch + pistol (tracers, muzzle flash, ammo/reload),
  explosions with chain damage.
- **HUD:** round minimap with blips, wanted stars, cash, weapon + ammo,
  mission panel, clock + weather, named radio stations, police-unit list,
  dialog with procedural portraits, notifications, speedo + vehicle condition,
  HP + armor bars.
- **Screens:** cinematic title, mission briefing, pause (stats), busted /
  wasted, mission complete, jobs, full map (story list, stats, legend,
  % complete), garage (upgrades + respray), gun shop, safehouse, 3 save slots
  (localStorage), synthesized WebAudio SFX + synthwave radio.

## Tech

- three.js r186, vendored under `game/vendor/three.min.js` (no network).
- Plain ES modules, no build step. Deterministic screenshots via
  `?shot=cover|night|garage|map` (see `shots.json`). The night shot is
  staged with the player parked inside a car: at 3★ a foot cop arrests an
  on-foot player within seconds, which would put the BUSTED screen over it.
  Screenshots are 1280×800 JPEGs, ≤256 KiB each.
- `main.ts` packages `game/` + `screenshots/` into a dossier for the judge.

## License

MIT — see `LICENSE`. three.js is vendored under its own MIT license.
