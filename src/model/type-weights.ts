import {
  ITEM_TYPES,
  poolCellKey,
  type ItemKind,
  type ItemType,
  type PoolCellEntry,
  type PoolCells,
  type PoolPrices,
  type TypeWeights,
  type Weighted,
} from "./types.js";

/** Largest common multiple of the per-type item counts for which pool weights stay exact. */
const MAX_EXACT_SCALE = 1_000_000;

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y > 0) [x, y] = [y, x % y];
  return x;
}

function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b;
}

const ALL_TYPES: ReadonlySet<string> = new Set<string>([...ITEM_TYPES.permanent, ...ITEM_TYPES.consumable]);

export function isItemType(value: unknown): value is ItemType {
  return typeof value === "string" && ALL_TYPES.has(value);
}

export function kindOfType(type: ItemType): ItemKind {
  return (ITEM_TYPES.permanent as readonly string[]).includes(type) ? "permanent" : "consumable";
}

/** A type's weight, 0 when missing or not positive. */
export function typeWeight(weights: Weighted<ItemType>, type: ItemType): number {
  const weight = weights.find((entry) => entry.value === type)?.weight ?? 0;
  return Number.isFinite(weight) && weight > 0 ? weight : 0;
}

/**
 * Integer roll-table weights for the items of one pool cell, in input order. Each type present in
 * the cell gets its type weight's share of the cell, split evenly among that type's items; types
 * missing from the cell drop out and the rest share their part. Weight 0 means the item is left out.
 * Exact while the least common multiple of the per-type item counts is at most 1,000,000, and
 * within a relative error of about 10⁻⁴ beyond that.
 */
export function poolEntryWeights(types: readonly ItemType[], weights: Weighted<ItemType>): number[] {
  const counts = new Map<ItemType, number>();
  for (const type of types) {
    if (typeWeight(weights, type) > 0) counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  if (counts.size === 0) return types.map(() => 0);
  let scale = 1;
  for (const count of counts.values()) {
    scale = lcm(scale, count);
    if (scale > MAX_EXACT_SCALE) {
      scale = MAX_EXACT_SCALE;
      break;
    }
  }
  const raw = types.map((type) => {
    const weight = typeWeight(weights, type);
    const count = counts.get(type);
    return weight > 0 && count ? Math.max(1, Math.round((weight * scale) / count)) : 0;
  });
  const divisor = raw.reduce((g, weight) => (weight > 0 ? gcd(g, weight) : g), 0);
  return divisor > 1 ? raw.map((weight) => weight / divisor) : raw;
}

function kindOfCell(key: string): ItemKind {
  return key.startsWith("consumable|") ? "consumable" : "permanent";
}

/** Weighted prices of every cell after applying the type weights (what the pool tables roll). */
export function poolPricesFromCells(cells: PoolCells, typeWeights: TypeWeights): PoolPrices {
  const cache = new Map<string, Weighted<number>>();
  for (const [key, entries] of Object.entries(cells)) {
    const weights = poolEntryWeights(
      entries.map((entry) => entry.type),
      typeWeights[kindOfCell(key)]
    );
    const byPrice = new Map<number, number>();
    entries.forEach((entry, index) => {
      const weight = weights[index] ?? 0;
      if (weight > 0) byPrice.set(entry.price, (byPrice.get(entry.price) ?? 0) + weight);
    });
    if (byPrice.size > 0) cache.set(key, [...byPrice].map(([value, weight]) => ({ value, weight })));
  }
  return { prices: (kind, rarity, level) => cache.get(poolCellKey(kind, rarity, level)) };
}

/** Cells from the fixture format `{ "<kind>|<rarity>|<level>": [[price, type], ...] }`; bad rows are skipped. */
export function poolCellsFromRecord(record: Readonly<Record<string, unknown>>): PoolCells {
  const cells: Record<string, PoolCellEntry[]> = {};
  for (const [key, rows] of Object.entries(record)) {
    if (!Array.isArray(rows)) continue;
    const entries: PoolCellEntry[] = [];
    for (const row of rows as unknown[]) {
      if (!Array.isArray(row)) continue;
      const [price, type] = row as unknown[];
      if (typeof price === "number" && price > 0 && isItemType(type)) entries.push({ price, type });
    }
    if (entries.length > 0) cells[key] = entries;
  }
  return cells;
}
