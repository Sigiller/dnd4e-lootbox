import { DEFAULT_TYPE_WEIGHTS } from "../model/defaults.js";
import { poolEntryWeights } from "../model/type-weights.js";
import type { LootboxModel, TypeWeights, Weighted } from "../model/types.js";
import { poolCellKey } from "../model/types.js";
import type { PoolEntry } from "../pool/classify.js";
import type { DrawnItem, LootboxDrawer } from "./resolve.js";

export type Rng = () => number;

export function pickWeighted<T>(weights: Weighted<T>, rng: Rng): T {
  const total = weights.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  if (total <= 0) throw new Error("No positive weights to pick from");
  let roll = rng() * total;
  for (const entry of weights) {
    if (entry.weight <= 0) continue;
    roll -= entry.weight;
    if (roll < 0) return entry.value;
  }
  const last = [...weights].reverse().find((entry) => entry.weight > 0);
  if (!last) throw new Error("No positive weights to pick from");
  return last.value;
}

/** Deterministic seeded RNG (mulberry32) for tests and simulations. */
export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Drawer that samples the model's weights and a pool list directly, without roll tables. Items
 * inside a cell are weighted by type exactly as the pool tables weight them.
 */
export function createWeightedDrawer(
  model: LootboxModel,
  entries: readonly PoolEntry[],
  rng: Rng,
  typeWeights: TypeWeights = DEFAULT_TYPE_WEIGHTS
): LootboxDrawer {
  const grouped = new Map<string, PoolEntry[]>();
  for (const entry of entries) {
    const key = poolCellKey(entry.kind, entry.rarity, entry.level);
    const list = grouped.get(key);
    if (list) list.push(entry);
    else grouped.set(key, [entry]);
  }
  const cells = new Map<string, Weighted<PoolEntry>>();
  for (const [key, list] of grouped) {
    const kind = list[0]?.kind ?? "permanent";
    const weights = poolEntryWeights(
      list.map((entry) => entry.type),
      typeWeights[kind]
    );
    const weighted = list
      .map((value, index) => ({ value, weight: weights[index] ?? 0 }))
      .filter((entry) => entry.weight > 0);
    if (weighted.length > 0) cells.set(key, weighted);
  }
  return {
    drawCount: async () => pickWeighted(model.count, rng),
    drawExtraKind: async () => pickWeighted(model.extraKind, rng),
    drawRarity: async () => pickWeighted(model.rarity, rng),
    drawOffset: async (rarity) => pickWeighted(model.levelOffset[rarity], rng),
    hasPool: (kind, rarity, level) => (cells.get(poolCellKey(kind, rarity, level))?.length ?? 0) > 0,
    drawItem: async (kind, rarity, level): Promise<DrawnItem | null> => {
      const list = cells.get(poolCellKey(kind, rarity, level));
      if (!list?.length) return null;
      return { ...pickWeighted(list, rng) };
    },
  };
}
