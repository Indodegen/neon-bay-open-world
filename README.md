# NEON BAY — Open World Crime

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Indodegen/neon-bay-open-world/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Indodegen/neon-bay-open-world/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![license](https://img.shields.io/badge/license-MIT-7dff9b)](./LICENSE)

**NEON BAY** is an original open-world crime game set in Coral Bay, a sun-soaked coastal city of neon, palm trees and bad decisions. You are **Jax Marlow**, a wheelman fresh out of lockup, working for fixer **Rosa Vega**: steal fast cars, outrun the Coral Bay PD, and climb from street hustler to king of the bay.

## What is in the game

- **Open city** — a road-grid city with lit buildings, a neon avenue, Coral Tower, a harbor with cranes and containers, a beach boardwalk and the ocean, all under a sunset sky.
- **On foot + driving** — run and sprint through the streets, or steal any parked car and drive it with arcade handling.
- **Traffic & pedestrians** — cars cruise the grid, pedestrians stroll the sidewalks and flee when you speed past.
- **Wanted level** — stealing cars and speeding raise your heat; Coral Bay PD cruisers chase, ram and try to bust you. Stay clean and the heat fades.
- **3 story missions** — *First Wheels* (steal a car), *Bayfront Drop* (deliver to the beach while wanted), *Harbor Heist* (fight the guards, grab the cash). Each pays out and unlocks the next.
- **Combat** — punch up close (F) or shoot with the mouse; harbor guards fight back.
- **HUD + minimap** — health, cash, wanted stars, speed, mission objective, and a live 2D minimap with traffic, police and the mission marker.
- **Menus & save** — start screen, pause, game-over screen, and progress saved to localStorage.
- **Sound** — fully synthesized WebAudio: engine hum, two-tone police sirens, pickup chimes, gunshots. No audio files.
- **Tech** — three.js (vendored as `game/vendor/three.module.min.js`), static files only, no build step, no network requests at runtime.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move on foot / drive |
| Shift | Sprint |
| E | Steal car / exit car |
| Mouse drag | Orbit camera |
| Click | Shoot |
| F | Punch |
| Space | Handbrake |
| P | Pause |
| M | Mute |

## Play

Serve `game/` with any static server (e.g. `node serve.ts`) and open `http://localhost:8080`.

Screenshots are staged deterministically with `?shot=1` (cover: driving + HUD + minimap + wanted stars + objective), `?shot=2` (on foot), `?shot=3` (police chase), `?shot=4` (harbor heist mission).

## License

MIT — see [LICENSE](./LICENSE). All city, character, vehicle, story, art and sound names are original; nothing is taken from any commercial game.
