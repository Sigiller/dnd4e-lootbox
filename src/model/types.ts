export type Rarity = "common" | "uncommon" | "rare";
export type ItemKind = "permanent" | "consumable";

export const RARITIES: readonly Rarity[] = ["common", "uncommon", "rare"];
export const ITEM_KINDS: readonly ItemKind[] = ["permanent", "consumable"];

/** Item slot of a permanent item, or the type of a consumable. */
export type PermanentType = "head" | "neck" | "arms" | "hands" | "waist" | "feet" | "ring" | "wondrous";
export type ConsumableType = "potion" | "elixir" | "alchemical" | "reagent" | "whetstone" | "soulfang" | "otherConsumable";
export type ItemType = PermanentType | ConsumableType;

export const ITEM_TYPES: Readonly<{ permanent: readonly PermanentType[]; consumable: readonly ConsumableType[] }> = {
  permanent: ["head", "neck", "arms", "hands", "waist", "feet", "ring", "wondrous"],
  consumable: ["potion", "elixir", "alchemical", "reagent", "whetstone", "soulfang", "otherConsumable"],
};

/** Weights of the item types within each kind. A pool table picks a type by these weights, then an item. */
export type TypeWeights = Readonly<Record<ItemKind, Weighted<ItemType>>>;

/** Fraction of the market price a character gets when selling an item, per rarity. */
export type SellRatios = Readonly<Record<Rarity, number>>;

export const DEFAULT_SELL_RATIO: SellRatios = {
  common: 0.2,
  uncommon: 0.5,
  rare: 1,
};

/** Odds every box level should meet (fractions, value ratio as a multiple of the price). */
export interface Targets {
  lossMin: number;
  lossMax: number;
  sellProfitMin: number;
  sellProfitMax: number;
  minValueRatio: number;
}

export interface WeightedValue<T> {
  value: T;
  weight: number;
}

export type Weighted<T> = readonly WeightedValue<T>[];

/** Weights of the structural roll tables. Only ratios matter. */
export interface LootboxModel {
  count: Weighted<number>;
  extraKind: Weighted<ItemKind>;
  rarity: Weighted<Rarity>;
  levelOffset: Readonly<Record<Rarity, Weighted<number>>>;
}

/** Weighted price lists of the item pools (value = price in gp), one list per (kind, rarity, level) cell. */
export interface PoolPrices {
  prices(kind: ItemKind, rarity: Rarity, level: number): Weighted<number> | undefined;
}

export function poolCellKey(kind: ItemKind, rarity: Rarity, level: number): string {
  return `${kind}|${rarity}|${String(level)}`;
}

/** One pool item as far as the odds care: its price and type. */
export interface PoolCellEntry {
  price: number;
  type: ItemType;
}

/** Pool items per cell key (see `poolCellKey`), before type weights are applied. */
export type PoolCells = Readonly<Record<string, readonly PoolCellEntry[]>>;
