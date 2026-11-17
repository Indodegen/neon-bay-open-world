// main.ts — NEON BAY's entrypoint for make.fun (competition gta6-01).
// It copies the finished game and its screenshots into the output directory
// and writes the dossier the kit's library builds from them.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

const gameSource = join(repoRoot, 'game');
const shotsSource = join(repoRoot, 'screenshots');

mkdirSync(outputDir, { recursive: true });

const gameTarget = join(outputDir, 'game');
const shotsTarget = join(outputDir, 'screenshots');
if (existsSync(gameTarget)) rmSync(gameTarget, { recursive: true, force: true });
if (existsSync(shotsTarget)) rmSync(shotsTarget, { recursive: true, force: true });

cpSync(gameSource, gameTarget, { recursive: true });
if (existsSync(shotsSource)) cpSync(shotsSource, shotsTarget, { recursive: true });

const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
