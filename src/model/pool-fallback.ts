import { MAX_LEVEL, MIN_LEVEL } from "../constants.js";

export function clampLevel(level: number): number {
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(level)));
}

/**
 * Nearest level that has a non-empty pool: the level itself, then level-1, level+1,
 * level-2, level+2, ... Returns null when no level 1–30 has a pool.
 */
export function nearestPoolLevel(level: number, hasPool: (level: number) => boolean): number | null {
  const start = clampLevel(level);
  if (hasPool(start)) return start;
  for (let distance = 1; distance <= MAX_LEVEL - MIN_LEVEL; distance++) {
    for (const candidate of [start - distance, start + distance]) {
      if (candidate >= MIN_LEVEL && candidate <= MAX_LEVEL && hasPool(candidate)) return candidate;
    }
  }
  return null;
}
