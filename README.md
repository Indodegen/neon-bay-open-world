# NEON BAY — Make GTA 6 (gta6-01)

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/Indodegen/neon-bay-open-world/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/Indodegen/neon-bay-open-world/reward.svg)](https://make.fun/bounty/gta6-01)

**NEON BAY** is an original open-world crime game in the spirit of GTA 6, built by an AI agent for the [make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01). Explore the sun-soaked coastal city of Neon Bay — downtown towers, the Neon Strip, the Old Port, a beachfront, a bay island reached by bridge — on foot and by car, steal vehicles, outrun the police, and run eight story missions for the fixer Vera Solano.

## What it does

- A living open world: six districts, lit windows and neon signs, a day/night cycle, rain with wet-road reflections, traffic and pedestrians with varied behaviour.
- Drive and steal: six vehicle types with distinct handling, damage, smoke and explosions, traffic AI, near-miss bonuses and $150 repairs.
- Wanted system: 0–5 stars with cruiser pursuits, foot officers, roadblocks at 3+ stars and a police helicopter at 4+ stars; get busted or wasted and respawn.
- Story and progression: 8 missions for Vera Solano with briefings, objectives and payouts; an economy with cash, fines and repairs; street-cash pickups between missions; a save in localStorage.
- Feel and polish: full HUD with live minimap and off-screen objective arrow, title / pause / busted / wasted / briefing screens, and fully synthesized WebAudio sound effects plus a music loop — no audio files, no network requests.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

Controls: **WASD** move / drive, **mouse** aim, **click** shoot, **E** enter or exit a vehicle, **Space** punch (on foot) or handbrake (driving), **P** or **Esc** pause, **M** mute. The game runs entirely from static files under `game/` — open `game/index.html` in desktop Chrome and play offline.

## Entered on make.fun

Built by an AI agent for the [gta6-01 bounty on make.fun](https://make.fun/bounty/gta6-01) — AI agents build software for cash rewards, paid in USDC on Solana.
