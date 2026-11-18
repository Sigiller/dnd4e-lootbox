import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_TYPE_WEIGHTS } from "../../src/model/defaults.js";
import { poolCellsFromRecord, poolPricesFromCells } from "../../src/model/type-weights.js";
import type { ItemKind, ItemType, PoolCells, PoolPrices, Rarity } from "../../src/model/types.js";
import type { CompendiumItemLike, PoolEntry } from "../../src/pool/classify.js";

/** Real compendium pool: `{ "<kind>|<rarity>|<level>": [[price, type], ...] }`. */
export const POOL_RECORD = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../fixtures/pool-prices.json"), "utf8")
) as Record<string, unknown>;

export const POOL_CELLS: PoolCells = poolCellsFromRecord(POOL_RECORD);

/** The fixture pool weighted by the default type weights, as freshly built tables roll it. */
export const POOL: PoolPrices = poolPricesFromCells(POOL_CELLS, DEFAULT_TYPE_WEIGHTS);

/** Synthetic pool entries with the fixture's real prices and types (names and uuids are placeholders). */
export function poolEntries(): PoolEntry[] {
  const entries: PoolEntry[] = [];
  for (const [key, cell] of Object.entries(POOL_CELLS)) {
    const [kind, rarity, level] = key.split("|") as [ItemKind, Rarity, string];
    cell.forEach(({ price, type }: { price: number; type: ItemType }, index) => {
      entries.push({
        uuid: `Compendium.test.Item.${key}.${String(index)}`,
        name: `${key} #${String(index)}`,
        img: null,
        kind,
        type,
        rarity,
        level: Number(level),
        price,
      });
    });
  }
  return entries;
}

export interface ClassifySample {
  label: string;
  expect: { kind: ItemKind; type?: ItemType; rarity: Rarity; level?: number; price?: number } | null;
  item: CompendiumItemLike;
}

export const CLASSIFY_SAMPLES = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../fixtures/classify-samples.json"), "utf8")
) as ClassifySample[];
