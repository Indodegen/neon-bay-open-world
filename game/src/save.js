// NEON BAY — save.js
// localStorage save: cash, mission progress, player position, health, time of
// day and wanted heat. Versioned key so old saves never corrupt a new build.
// Saves happen on mission completion, on pause, and on busted / wasted.

export const SAVE_KEY = 'neonbay-save-v3';

export function writeSave(state) {
  try {
    const data = {
      version: 3,
      money: Math.round(state.money),
      missionIndex: state.missionIndex,
      completed: state.completedMissions.slice(),
      playerX: Math.round(state.player.x),
      playerY: Math.round(state.player.y),
      health: Math.round(state.player.health),
      timeOfDay: state.timeOfDay,
      totalEarned: Math.round(state.totalEarned || 0),
      carsStolen: state.carsStolen || 0,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 3) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

export function hasSave() {
  return readSave() !== null;
}
