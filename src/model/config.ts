import { MAX_LEVEL, MIN_LEVEL } from "../constants.js";
import { DEFAULT_MAX_CONSUMABLE_PRICE_FACTOR, DEFAULT_MODEL, DEFAULT_TARGETS, DEFAULT_TYPE_WEIGHTS } from "./defaults.js";
import { DEFAULT_BOX_PRICES } from "./prices.js";
import {
  DEFAULT_SELL_RATIO,
  ITEM_KINDS,
  ITEM_TYPES,
  RARITIES,
  type ItemKind,
  type ItemType,
  type LootboxModel,
  type Rarity,
  type SellRatios,
  type Targets,
  type TypeWeights,
  type Weighted,
} from "./types.js";

export const COUNT_VALUES: readonly number[] = [1, 2, 3, 4];
export const OFFSET_VALUES: readonly number[] = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
export const MAX_WEIGHT = 1000;
export const MAX_VALUE_RATIO = 10;
export const MAX_CONSUMABLE_PRICE_FACTOR_LIMIT = 1000;

/** Every number the module uses, as stored in the world setting. */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- fvtt-types only accepts index-signature-compatible types (a type alias, not an interface) for `type: Object` settings.
export type LootboxConfig = {
  model: LootboxModel;
  sellRatio: SellRatios;
  targets: Targets;
  /** Box price in gp per level, index 0 = level 1. */
  prices: readonly number[];
  maxConsumablePriceFactor: number;
  /** Weight of each permanent slot and consumable type inside the pool tables. */
  typeWeights: TypeWeights;
};

/** Expand weights to one row per allowed value (missing values get weight 0). */
function rows<T>(values: readonly T[], weights: Weighted<T>): Weighted<T> {
  return values.map((value) => ({ value, weight: weights.find((entry) => entry.value === value)?.weight ?? 0 }));
}

function fullModel(model: LootboxModel): LootboxModel {
  return {
    count: rows(COUNT_VALUES, model.count),
    extraKind: rows(ITEM_KINDS, model.extraKind),
    rarity: rows(RARITIES, model.rarity),
    levelOffset: {
      common: rows(OFFSET_VALUES, model.levelOffset.common),
      uncommon: rows(OFFSET_VALUES, model.levelOffset.uncommon),
      rare: rows(OFFSET_VALUES, model.levelOffset.rare),
    },
  };
}

export const DEFAULT_CONFIG: LootboxConfig = {
  model: fullModel(DEFAULT_MODEL),
  sellRatio: { ...DEFAULT_SELL_RATIO },
  targets: { ...DEFAULT_TARGETS },
  prices: [...DEFAULT_BOX_PRICES],
  maxConsumablePriceFactor: DEFAULT_MAX_CONSUMABLE_PRICE_FACTOR,
  typeWeights: {
    permanent: rows<ItemType>(ITEM_TYPES.permanent, DEFAULT_TYPE_WEIGHTS.permanent),
    consumable: rows<ItemType>(ITEM_TYPES.consumable, DEFAULT_TYPE_WEIGHTS.consumable),
  },
};

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function inRange(value: unknown, min: number, max: number): number | undefined {
  const n = finite(value);
  return n !== undefined && n >= min && n <= max ? n : undefined;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Stored rows → one row per allowed value; falls back to the defaults when unusable or all zero. */
function normalizeWeights<T>(raw: unknown, values: readonly T[], fallback: Weighted<T>): Weighted<T> {
  if (!Array.isArray(raw)) return fallback;
  const normalized = values.map((value) => {
    const entry = (raw as unknown[]).map(record).find((candidate) => candidate.value === value);
    const weight = inRange(entry?.weight, 0, MAX_WEIGHT);
    return { value, weight: weight === undefined ? 0 : Math.round(weight) };
  });
  return normalized.some((entry) => entry.weight > 0) ? normalized : fallback;
}

/** Clean a stored config: anything missing or invalid takes its default. */
export function normalizeConfig(raw: unknown): LootboxConfig {
  const source = record(raw);
  const model = record(source.model);
  const offsets = record(model.levelOffset);
  const sell = record(source.sellRatio);
  const targets = record(source.targets);
  const types = record(source.typeWeights);
  const d = DEFAULT_CONFIG;

  const sellRatio = Object.fromEntries(
    RARITIES.map((rarity) => [rarity, inRange(sell[rarity], 0, 1) ?? d.sellRatio[rarity]])
  ) as Record<Rarity, number>;

  const pair = (minKey: "lossMin" | "sellProfitMin", maxKey: "lossMax" | "sellProfitMax") => {
    const min = inRange(targets[minKey], 0, 1);
    const max = inRange(targets[maxKey], 0, 1);
    return min !== undefined && max !== undefined && min <= max
      ? { [minKey]: min, [maxKey]: max }
      : { [minKey]: d.targets[minKey], [maxKey]: d.targets[maxKey] };
  };

  const rawPrices = Array.isArray(source.prices) ? (source.prices as unknown[]) : [];
  const prices = d.prices.map((fallback, index) => {
    const price = inRange(rawPrices[index], 1, Number.MAX_SAFE_INTEGER);
    return price === undefined ? fallback : Math.round(price);
  });

  return {
    model: {
      count: normalizeWeights(model.count, COUNT_VALUES, d.model.count),
      extraKind: normalizeWeights<ItemKind>(model.extraKind, ITEM_KINDS, d.model.extraKind),
      rarity: normalizeWeights<Rarity>(model.rarity, RARITIES, d.model.rarity),
      levelOffset: {
        common: normalizeWeights(offsets.common, OFFSET_VALUES, d.model.levelOffset.common),
        uncommon: normalizeWeights(offsets.uncommon, OFFSET_VALUES, d.model.levelOffset.uncommon),
        rare: normalizeWeights(offsets.rare, OFFSET_VALUES, d.model.levelOffset.rare),
      },
    },
    sellRatio,
    targets: {
      ...(pair("lossMin", "lossMax") as Pick<Targets, "lossMin" | "lossMax">),
      ...(pair("sellProfitMin", "sellProfitMax") as Pick<Targets, "sellProfitMin" | "sellProfitMax">),
      minValueRatio: inRange(targets.minValueRatio, 0, MAX_VALUE_RATIO) ?? d.targets.minValueRatio,
    },
    prices,
    maxConsumablePriceFactor:
      inRange(source.maxConsumablePriceFactor, 1, MAX_CONSUMABLE_PRICE_FACTOR_LIMIT) ?? d.maxConsumablePriceFactor,
    typeWeights: {
      permanent: normalizeWeights<ItemType>(types.permanent, ITEM_TYPES.permanent, d.typeWeights.permanent),
      consumable: normalizeWeights<ItemType>(types.consumable, ITEM_TYPES.consumable, d.typeWeights.consumable),
    },
  };
}

/** Problems that block saving an edited config (i18n keys under `errors.config.*`). */
export type ConfigProblem =
  | "countWeights"
  | "extraKindWeights"
  | "rarityWeights"
  | "offsetWeights"
  | "typeWeights"
  | "weightRange"
  | "sellRatio"
  | "lossRange"
  | "sellProfitRange"
  | "valueRatio"
  | "prices"
  | "priceFactor";

function weightsOk<T>(weights: Weighted<T>): boolean {
  return weights.some((entry) => entry.weight > 0);
}

function weightsInRange<T>(weights: Weighted<T>): boolean {
  return weights.every((entry) => Number.isInteger(entry.weight) && entry.weight >= 0 && entry.weight <= MAX_WEIGHT);
}

const fraction = (n: number) => Number.isFinite(n) && n >= 0 && n <= 1;

export function validateConfig(config: LootboxConfig): ConfigProblem[] {
  const problems: ConfigProblem[] = [];
  const { model, sellRatio, targets } = config;
  if (!weightsOk(model.count)) problems.push("countWeights");
  if (!weightsOk(model.extraKind)) problems.push("extraKindWeights");
  if (!weightsOk(model.rarity)) problems.push("rarityWeights");
  if (!RARITIES.every((rarity) => weightsOk(model.levelOffset[rarity]))) problems.push("offsetWeights");
  if (!ITEM_KINDS.every((kind) => weightsOk(config.typeWeights[kind]))) problems.push("typeWeights");
  const allWeights = [
    model.count,
    model.extraKind,
    model.rarity,
    ...RARITIES.map((r) => model.levelOffset[r]),
    ...ITEM_KINDS.map((kind) => config.typeWeights[kind]),
  ];
  if (!allWeights.every((weights) => weightsInRange(weights as Weighted<unknown>))) problems.push("weightRange");
  if (!RARITIES.every((rarity) => fraction(sellRatio[rarity]))) problems.push("sellRatio");
  if (!(fraction(targets.lossMin) && fraction(targets.lossMax) && targets.lossMin <= targets.lossMax)) {
    problems.push("lossRange");
  }
  if (
    !(fraction(targets.sellProfitMin) && fraction(targets.sellProfitMax) && targets.sellProfitMin <= targets.sellProfitMax)
  ) {
    problems.push("sellProfitRange");
  }
  if (!(Number.isFinite(targets.minValueRatio) && targets.minValueRatio >= 0 && targets.minValueRatio <= MAX_VALUE_RATIO)) {
    problems.push("valueRatio");
  }
  const levels = MAX_LEVEL - MIN_LEVEL + 1;
  if (config.prices.length !== levels || !config.prices.every((p) => Number.isInteger(p) && p > 0)) {
    problems.push("prices");
  }
  const factor = config.maxConsumablePriceFactor;
  if (!(Number.isFinite(factor) && factor >= 1 && factor <= MAX_CONSUMABLE_PRICE_FACTOR_LIMIT)) problems.push("priceFactor");
  return problems;
}

/** Box price in gp for a level under this config. */
export function priceFor(config: LootboxConfig, level: number): number {
  const index = Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(level))) - MIN_LEVEL;
  return config.prices[index] ?? DEFAULT_BOX_PRICES[index] ?? 1;
}

/** Share of each weight in its table, e.g. 6/20 → 0.3. */
export function weightShare<T>(weights: Weighted<T>, value: T): number {
  const total = weights.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  const weight = weights.find((entry) => entry.value === value)?.weight ?? 0;
  return total > 0 ? Math.max(0, weight) / total : 0;
}

/** Types whose weight went from 0 to above 0: their items were left out of the pools and need a rebuild. */
export function typesToRestore(before: TypeWeights, after: TypeWeights): ItemType[] {
  return ITEM_KINDS.flatMap((kind) =>
    after[kind]
      .filter(({ value, weight }) => weight > 0 && (before[kind].find((e) => e.value === value)?.weight ?? 0) <= 0)
      .map(({ value }) => value)
  );
}
