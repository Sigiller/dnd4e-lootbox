import { clampLevel } from "../model/pool-fallback.js";
import { nearestPoolLevel } from "../model/pool-fallback.js";
import { DEFAULT_SELL_RATIO, type ItemKind, type Rarity, type SellRatios } from "../model/types.js";

export interface DrawnItem {
  uuid: string;
  name: string;
  img: string | null;
  kind: ItemKind;
  rarity: Rarity;
  level: number;
  price: number;
}

/** Source of every random choice when opening a box (roll tables in Foundry, an RNG in tests). */
export interface LootboxDrawer {
  drawCount(): Promise<number>;
  drawExtraKind(): Promise<ItemKind>;
  drawRarity(): Promise<Rarity>;
  drawOffset(rarity: Rarity): Promise<number>;
  hasPool(kind: ItemKind, rarity: Rarity, level: number): boolean;
  drawItem(kind: ItemKind, rarity: Rarity, level: number): Promise<DrawnItem | null>;
}

export interface BoxSlot {
  kind: ItemKind;
  rarity: Rarity;
  offset: number;
  /** Box level + offset, clamped to 1–30. */
  targetLevel: number;
  /** Pool level actually used (nearest non-empty pool), or null when none exists. */
  poolLevel: number | null;
  item: DrawnItem | null;
}

export const MAX_ITEMS = 4;

/**
 * Roll one slot of a box: kind (the first slot is always permanent), rarity, level offset, then the
 * item from the pool table for that kind, rarity and level (or the nearest level with a pool).
 */
export async function resolveSlot(boxLevel: number, index: number, drawer: LootboxDrawer): Promise<BoxSlot> {
  const kind: ItemKind = index === 0 ? "permanent" : await drawer.drawExtraKind();
  const rarity = await drawer.drawRarity();
  const offset = await drawer.drawOffset(rarity);
  const targetLevel = clampLevel(boxLevel + offset);
  const poolLevel = nearestPoolLevel(targetLevel, (level) => drawer.hasPool(kind, rarity, level));
  const item = poolLevel === null ? null : await drawer.drawItem(kind, rarity, poolLevel);
  return { kind, rarity, offset, targetLevel, poolLevel, item };
}

/** Open one box: item count, then each slot (see `resolveSlot`). */
export async function resolveBox(boxLevel: number, drawer: LootboxDrawer): Promise<BoxSlot[]> {
  const count = Math.min(MAX_ITEMS, Math.max(1, Math.round(await drawer.drawCount())));
  const slots: BoxSlot[] = [];
  for (let index = 0; index < count; index++) slots.push(await resolveSlot(boxLevel, index, drawer));
  return slots;
}

export type BoxVerdict = "loss" | "marketProfit" | "sellProfit";

export interface BoxSummary {
  price: number;
  items: DrawnItem[];
  marketValue: number;
  sellValue: number;
  verdict: BoxVerdict;
}

export function sellValue(
  item: Pick<DrawnItem, "price" | "rarity">,
  sellRatio: SellRatios = DEFAULT_SELL_RATIO
): number {
  return item.price * sellRatio[item.rarity];
}

export function verdictFor(price: number, marketValue: number, sellTotal: number): BoxVerdict {
  if (sellTotal >= price) return "sellProfit";
  if (marketValue < price) return "loss";
  return "marketProfit";
}

export function summarizeBox(
  price: number,
  slots: readonly BoxSlot[],
  sellRatio: SellRatios = DEFAULT_SELL_RATIO
): BoxSummary {
  return summarizeItems(
    price,
    slots.flatMap((slot) => (slot.item ? [slot.item] : [])),
    sellRatio
  );
}

/** Totals and verdict of a box holding these items. */
export function summarizeItems(
  price: number,
  items: readonly DrawnItem[],
  sellRatio: SellRatios = DEFAULT_SELL_RATIO
): BoxSummary {
  const marketValue = items.reduce((sum, item) => sum + item.price, 0);
  const sellTotal = items.reduce((sum, item) => sum + sellValue(item, sellRatio), 0);
  return {
    price,
    items: [...items],
    marketValue,
    sellValue: sellTotal,
    verdict: verdictFor(price, marketValue, sellTotal),
  };
}

/** The box after swapping the item at `index`: same price, new totals and verdict. */
export function replaceItem(
  summary: BoxSummary,
  index: number,
  item: DrawnItem,
  sellRatio: SellRatios = DEFAULT_SELL_RATIO
): BoxSummary {
  if (index < 0 || index >= summary.items.length) throw new RangeError(`No item ${String(index)} in this box`);
  return summarizeItems(
    summary.price,
    summary.items.map((current, i) => (i === index ? item : current)),
    sellRatio
  );
}
