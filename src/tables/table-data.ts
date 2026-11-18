import { poolEntryWeights } from "../model/type-weights.js";
import { RARITIES, type ItemKind, type LootboxModel, type Rarity, type TypeWeights, type Weighted } from "../model/types.js";
import type { PoolEntry } from "../pool/classify.js";
import type { LootboxResultFlag, LootboxTableFlag, TableRole } from "./flags.js";

/** Plain RollTable creation data (folder is filled in by the builder). */
export interface TableResultData {
  type: "text" | "document";
  name: string;
  img?: string;
  documentUuid?: string;
  weight: number;
  range: [number, number];
  flags: { "dnd4e-lootbox": { result: LootboxResultFlag } };
}

export interface RollTableData {
  name: string;
  description: string;
  formula: string;
  replacement: true;
  displayRoll: true;
  img?: string;
  flags: { "dnd4e-lootbox": { table: LootboxTableFlag } };
  results: TableResultData[];
}

const RARITY_LABEL: Readonly<Record<Rarity, string>> = { common: "Common", uncommon: "Uncommon", rare: "Rare" };
const KIND_LABEL: Readonly<Record<ItemKind, string>> = { permanent: "Permanent", consumable: "Consumable" };

export const TABLE_ICON = "icons/containers/chest/chest-reinforced-steel-red.webp";

export function rarityLabel(rarity: Rarity): string {
  return RARITY_LABEL[rarity];
}

export function kindLabel(kind: ItemKind): string {
  return KIND_LABEL[kind];
}

export function offsetLabel(offset: number): string {
  if (offset === 0) return "Box level";
  const sign = offset > 0 ? "+" : "−";
  const n = Math.abs(offset);
  return `${sign}${String(n)} level${n === 1 ? "" : "s"}`;
}

export function poolTableName(kind: ItemKind, rarity: Rarity, level: number): string {
  return `${KIND_LABEL[kind]} · L${String(level).padStart(2, "0")} · ${RARITY_LABEL[rarity]}`;
}

/** Assign consecutive integer ranges from weights: weights 6, 9 → [1,6], [7,15]. */
export function rangesFromWeights(weights: readonly number[]): [number, number][] {
  let next = 1;
  return weights.map((weight) => {
    const size = Math.max(1, Math.round(weight));
    const range: [number, number] = [next, next + size - 1];
    next += size;
    return range;
  });
}

function structuralTable<T extends number | string>(
  name: string,
  description: string,
  flag: LootboxTableFlag,
  weights: Weighted<T>,
  label: (value: T) => string
): RollTableData {
  const positive = weights.filter((entry) => entry.weight > 0);
  const ranges = rangesFromWeights(positive.map((entry) => entry.weight));
  const total = ranges.at(-1)?.[1] ?? 1;
  return {
    name,
    description,
    formula: `1d${String(total)}`,
    replacement: true,
    displayRoll: true,
    img: TABLE_ICON,
    flags: { "dnd4e-lootbox": { table: flag } },
    results: positive.map((entry, index) => ({
      type: "text",
      name: label(entry.value),
      weight: Math.round(entry.weight),
      range: ranges[index] ?? [1, 1],
      flags: { "dnd4e-lootbox": { result: { value: entry.value } } },
    })),
  };
}

/** The six structural tables: item count, extra item kind, rarity and one level offset table per rarity. */
export function structuralTablesData(model: LootboxModel): RollTableData[] {
  const tables: RollTableData[] = [
    structuralTable(
      "Lootbox · Item Count",
      "How many items a lootbox holds.",
      { role: "count" },
      model.count,
      (n) => `${String(n)} item${n === 1 ? "" : "s"}`
    ),
    structuralTable(
      "Lootbox · Extra Item Type",
      "Kind of every item after the first. The first item is always permanent.",
      { role: "extraKind" },
      model.extraKind,
      (kind) => KIND_LABEL[kind]
    ),
    structuralTable(
      "Lootbox · Rarity",
      "Rarity of each item. Sell ratios: common 20%, uncommon 50%, rare 100%.",
      { role: "rarity" },
      model.rarity,
      (rarity) => RARITY_LABEL[rarity]
    ),
  ];
  for (const rarity of RARITIES) {
    tables.push(
      structuralTable(
        `Lootbox · Level Offset · ${RARITY_LABEL[rarity]}`,
        `Item level relative to the box level for ${RARITY_LABEL[rarity].toLowerCase()} items.`,
        { role: "offset", rarity },
        model.levelOffset[rarity],
        offsetLabel
      )
    );
  }
  return tables;
}

/** Results of one pool table from its items and their roll weights; items with weight 0 are left out. */
export function poolResultsData(items: readonly PoolEntry[], weights: readonly number[]): TableResultData[] {
  const kept = items.flatMap((item, index) => {
    const weight = weights[index] ?? 0;
    return weight > 0 ? [{ item, weight }] : [];
  });
  const ranges = rangesFromWeights(kept.map(({ weight }) => weight));
  return kept.map(({ item, weight }, index) => ({
    type: "document" as const,
    name: item.name,
    ...(item.img ? { img: item.img } : {}),
    documentUuid: item.uuid,
    weight,
    range: ranges[index] ?? [1, 1],
    flags: {
      "dnd4e-lootbox": {
        result: { price: item.price, rarity: item.rarity, kind: item.kind, type: item.type, level: item.level },
      },
    },
  }));
}

/** Die formula that covers consecutive ranges, e.g. `1d40`. */
export function rangesFormula(ranges: readonly (readonly number[])[]): string {
  const top = ranges.reduce((max, range) => Math.max(max, range[1] ?? 0), 0);
  return `1d${String(Math.max(1, top))}`;
}

/**
 * One pool table per (kind, rarity, level) cell that keeps at least one item, items sorted by
 * name. Within a table each item type gets its weight's share, split evenly among its items.
 */
export function poolTablesData(entries: readonly PoolEntry[], typeWeights: TypeWeights): RollTableData[] {
  const cells = new Map<string, { kind: ItemKind; rarity: Rarity; level: number; items: PoolEntry[] }>();
  for (const entry of entries) {
    const key = `${entry.kind}|${entry.rarity}|${String(entry.level)}`;
    const cell = cells.get(key);
    if (cell) cell.items.push(entry);
    else cells.set(key, { kind: entry.kind, rarity: entry.rarity, level: entry.level, items: [entry] });
  }
  const kindOrder: readonly ItemKind[] = ["permanent", "consumable"];
  return [...cells.values()]
    .sort(
      (a, b) =>
        kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) ||
        a.level - b.level ||
        RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity)
    )
    .flatMap(({ kind, rarity, level, items }) => {
      const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
      const results = poolResultsData(
        sorted,
        poolEntryWeights(
          sorted.map((item) => item.type),
          typeWeights[kind]
        )
      );
      if (results.length === 0) return [];
      return [
        {
          name: poolTableName(kind, rarity, level),
          description: `${RARITY_LABEL[rarity]} ${KIND_LABEL[kind].toLowerCase()} items of level ${String(level)}, weighted by item type.`,
          formula: rangesFormula(results.map((result) => result.range)),
          replacement: true as const,
          displayRoll: true as const,
          img: TABLE_ICON,
          flags: { "dnd4e-lootbox": { table: { role: "pool" as TableRole, kind, rarity, level } } },
          results,
        },
      ];
    });
}

/** Probability weights of a table as rolled: each result's range span. */
export function weightsFromRanges<T>(
  results: readonly { value: T | undefined; range: readonly number[] }[]
): Weighted<T> {
  const totals = new Map<T, number>();
  for (const { value, range } of results) {
    if (value === undefined) continue;
    const [low, high] = range;
    if (low === undefined || high === undefined || high < low) continue;
    totals.set(value, (totals.get(value) ?? 0) + (high - low + 1));
  }
  return [...totals.entries()].map(([value, weight]) => ({ value, weight }));
}
