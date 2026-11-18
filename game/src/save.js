// Local saves: three slots in localStorage, so a reloaded page can continue
// the same day from any of them. Each slot holds cash, completed jobs,
// stashes, properties, skills, stats and play time.
const SAVE_PREFIX = 'neonbay-save-v';

export function loadSave(slot = 1) {
  try {
    const raw = localStorage.getItem(SAVE_PREFIX + slot);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.cash !== 'number') return null;
    return {
      cash: data.cash,
      cashEarned: data.cashEarned || 0,
      completed: Array.isArray(data.completed) ? data.completed : [],
      nextIndex: typeof data.nextIndex === 'number' ? data.nextIndex : 0,
      stashesFound: data.stashesFound || 0,
      propertiesOwned: Array.isArray(data.propertiesOwned) ? data.propertiesOwned : [],
      sideJobsDone: data.sideJobsDone || 0,
      playSeconds: typeof data.playSeconds === 'number' ? data.playSeconds : 0,
      bestWanted: typeof data.bestWanted === 'number' ? data.bestWanted : 0,
      skills: data.skills || null,
      skillXp: data.skillXp || null,
      savedAt: data.savedAt || 0,
    };
  } catch (err) {
    return null;
  }
}

export function writeSave(state, slot = 1) {
  try {
    localStorage.setItem(SAVE_PREFIX + slot, JSON.stringify({
      cash: state.cash,
      cashEarned: state.cashEarned,
      completed: state.missions.completed,
      nextIndex: state.missions.nextIndex,
      stashesFound: state.missions.stashesFound,
      propertiesOwned: state.missions.propertiesOwned,
      sideJobsDone: state.missions.sideJobsDone,
      playSeconds: state.playSeconds,
      bestWanted: state.bestWanted,
      skills: state.skills,
      skillXp: state.skillXp,
      savedAt: Date.now(),
    }));
    return true;
  } catch (err) {
    return false;
  }
}

/** Summary of each slot for the title screen (null when empty). */
export function listSlots() {
  const out = {};
  for (let slot = 1; slot <= 3; slot += 1) {
    const save = loadSave(slot);
    out[slot] = save ? {
      cash: save.cash,
      jobsDone: save.completed.length,
      savedAt: save.savedAt,
    } : null;
  }
  return out;
}

export function clearSave(slot = 1) {
  try { localStorage.removeItem(SAVE_PREFIX + slot); } catch (err) {}
}
