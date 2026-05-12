import { seedState } from "./seed.js";

const STORAGE_KEY = "jaza-mosque-mvp-state";
const CURRENT_SCHEMA_VERSION = seedState.schemaVersion;

export function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(seedState);

  try {
    const stored = JSON.parse(raw);
    if (stored.schemaVersion !== CURRENT_SCHEMA_VERSION) {
      return structuredClone(seedState);
    }

    return {
      ...structuredClone(seedState),
      ...stored
    };
  } catch {
    return structuredClone(seedState);
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetState() {
  localStorage.removeItem(STORAGE_KEY);
  return structuredClone(seedState);
}
