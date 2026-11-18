import {
  ITEM_KINDS,
  RARITIES,
  poolCellKey,
  type ItemKind,
  type LootboxModel,
  type PoolCellEntry,
  type PoolCells,
  type PoolPrices,
  type Rarity,
} from "../model/types.js";
import { isItemType } from "../model/type-weights.js";
import type { DrawnItem, LootboxDrawer } from "../open/resolve.js";
import { pickWeighted } from "../open/weighted-drawer.js";
import { readResultFlag, readTableFlag } from "./flags.js";
import { weightsFromRanges } from "./table-data.js";

type Table = RollTable.Implementation;
type Result = TableResult.Implementation;

export interface LootboxTables {
  count: Table;
  extraKind: Table;
  rarity: Table;
  offset: Record<Rarity, Table>;
  pools: Map<string, Table>;
}

export function allLootboxTables(): Table[] {
  return (game.tables?.contents ?? []).filter((table) => readTableFlag(table) !== undefined);
}

/** The module's tables in this world, or null when any structural table is missing. */
export function findLootboxTables(): LootboxTables | null {
  let count: Table | undefined;
  let extraKind: Table | undefined;
  let rarity: Table | undefined;
  const offset: Partial<Record<Rarity, Table>> = {};
  const pools = new Map<string, Table>();
  for (const table of allLootboxTables()) {
    const flag = readTableFlag(table);
    if (!flag) continue;
    if (flag.role === "count") count = table;
    else if (flag.role === "extraKind") extraKind = table;
    else if (flag.role === "rarity") rarity = table;
    else if (flag.role === "offset" && flag.rarity) offset[flag.rarity] = table;
    else if (flag.role === "pool" && flag.kind && flag.rarity && flag.level !== undefined) {
      pools.set(poolCellKey(flag.kind, flag.rarity, flag.level), table);
    }
  }
  const { common, uncommon, rare } = offset;
  if (!count || !extraKind || !rarity || !common || !uncommon || !rare || pools.size === 0) return null;
  return { count, extraKind, rarity, offset: { common, uncommon, rare }, pools };
}

function results(table: Table): Result[] {
  return [...table.results.values()];
}

function valued<T>(table: Table, accept: (value: unknown) => value is T) {
  return results(table).map((result) => {
    const value = readResultFlag(result)?.value;
    return { value: accept(value) ? value : undefined, range: result.range };
  });
}

const isNumber = (value: unknown): value is number => typeof value === "number";
const isRarity = (value: unknown): value is Rarity => RARITIES.includes(value as Rarity);
const isKind = (value: unknown): value is ItemKind => ITEM_KINDS.includes(value as ItemKind);

/** The model as the world's tables currently roll it (GM edits included). */
export function modelFromTables(tables: LootboxTables): LootboxModel {
  return {
    count: weightsFromRanges(valued(tables.count, isNumber)),
    extraKind: weightsFromRanges(valued(tables.extraKind, isKind)),
    rarity: weightsFromRanges(valued(tables.rarity, isRarity)),
    levelOffset: {
      common: weightsFromRanges(valued(tables.offset.common, isNumber)),
      uncommon: weightsFromRanges(valued(tables.offset.uncommon, isNumber)),
      rare: weightsFromRanges(valued(tables.offset.rare, isNumber)),
    },
  };
}

/** Weighted prices of the pool tables as they roll now: each result weighs its range span. */
export function poolPricesFromTables(tables: LootboxTables): PoolPrices {
  const cache = new Map<string, { value: number; weight: number }[]>();
  for (const [key, table] of tables.pools) {
    const byPrice = new Map<number, number>();
    for (const result of results(table)) {
      const price = readResultFlag(result)?.price;
      const [low, high] = result.range;
      if (typeof price !== "number" || low === undefined || high === undefined || high < low) continue;
      byPrice.set(price, (byPrice.get(price) ?? 0) + (high - low + 1));
    }
    if (byPrice.size > 0) cache.set(key, [...byPrice].map(([value, weight]) => ({ value, weight })));
  }
  return { prices: (kind, rarity, level) => cache.get(poolCellKey(kind, rarity, level)) };
}

/**
 * Items of the pool tables with their prices and types, before any weighting, or null when some
 * result has no type (tables built before item type weights existed: rebuild them).
 */
export function poolCellsFromTables(tables: LootboxTables): PoolCells | null {
  const cells: Record<string, PoolCellEntry[]> = {};
  for (const [key, table] of tables.pools) {
    const entries: PoolCellEntry[] = [];
    for (const result of results(table)) {
      const flag = readResultFlag(result);
      if (!isItemType(flag?.type)) return null;
      if (typeof flag.price === "number") entries.push({ price: flag.price, type: flag.type });
    }
    if (entries.length > 0) cells[key] = entries;
  }
  return cells;
}

function drawnItemFrom(result: Result, kind: ItemKind, rarity: Rarity, level: number): DrawnItem | null {
  if (!result.documentUuid) return null;
  const flag = readResultFlag(result);
  return {
    uuid: result.documentUuid,
    name: result.name,
    img: result.img ?? null,
    kind: flag?.kind ?? kind,
    rarity: flag?.rarity ?? rarity,
    level: flag?.level ?? level,
    price: flag?.price ?? 0,
  };
}

/**
 * Draw from a pool table as if rolling it, but never the item `excludeUuid`: each other result keeps
 * its range span as weight. Returns null when the table holds no other item.
 */
export function drawPoolItemExcept(
  tables: LootboxTables,
  kind: ItemKind,
  rarity: Rarity,
  level: number,
  excludeUuid: string,
  random: () => number = Math.random
): DrawnItem | null {
  const table = tables.pools.get(poolCellKey(kind, rarity, level));
  if (!table) return null;
  const candidates = results(table).flatMap((result) => {
    const [low, high] = result.range;
    if (result.documentUuid === excludeUuid || low === undefined || high === undefined || high < low) return [];
    return [{ value: result, weight: high - low + 1 }];
  });
  if (candidates.length === 0) return null;
  return drawnItemFrom(pickWeighted(candidates, random), kind, rarity, level);
}

async function rollOne(table: Table): Promise<Result | undefined> {
  const { results: drawn } = await table.roll();
  return drawn[0];
}

async function rollValue<T>(table: Table, accept: (value: unknown) => value is T, fallback: T): Promise<T> {
  const result = await rollOne(table);
  const value = result ? readResultFlag(result)?.value : undefined;
  return accept(value) ? value : fallback;
}

/** Drawer that rolls the world's lootbox tables. */
export function createTableDrawer(tables: LootboxTables): LootboxDrawer {
  return {
    drawCount: () => rollValue(tables.count, isNumber, 1),
    drawExtraKind: () => rollValue(tables.extraKind, isKind, "permanent"),
    drawRarity: () => rollValue(tables.rarity, isRarity, "uncommon"),
    drawOffset: (rarity) => rollValue(tables.offset[rarity], isNumber, 0),
    hasPool: (kind, rarity, level) => (tables.pools.get(poolCellKey(kind, rarity, level))?.results.size ?? 0) > 0,
    drawItem: async (kind, rarity, level): Promise<DrawnItem | null> => {
      const table = tables.pools.get(poolCellKey(kind, rarity, level));
      if (!table) return null;
      const result = await rollOne(table);
      return result ? drawnItemFrom(result, kind, rarity, level) : null;
    },
  };
}
