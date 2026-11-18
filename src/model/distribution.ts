import { nearestPoolLevel, clampLevel } from "./pool-fallback.js";
import {
  DEFAULT_SELL_RATIO,
  RARITIES,
  type ItemKind,
  type LootboxModel,
  type PoolPrices,
  type Rarity,
  type SellRatios,
  type Weighted,
} from "./types.js";

export interface DistributionOptions {
  /** Merge every value at or above the cap into the cap (enough for odds at one price). */
  cap?: number;
  sellRatio?: SellRatios;
}

/** Discrete distribution: value in gp → probability. */
export type Dist = Map<number, number>;

export interface ValueDistributions {
  market: Dist;
  sell: Dist;
}

export interface BoxDistribution extends ValueDistributions {
  expectedMarket: number;
}

export interface BoxOdds {
  /** P(market value < price) */
  pLoss: number;
  /** P(sell value ≥ price) */
  pSellProfit: number;
  /** E[market value] / price */
  valueRatio: number;
  expectedMarket: number;
}

/** Values are merged at copper precision so float noise does not split equal sums. */
function roundGp(value: number): number {
  return Math.round(value * 100) / 100;
}

function addMass(dist: Dist, value: number, mass: number): void {
  if (mass <= 0) return;
  const key = roundGp(value);
  dist.set(key, (dist.get(key) ?? 0) + mass);
}

function capped(value: number, cap: number | undefined): number {
  return cap === undefined ? value : Math.min(value, cap);
}

export function probabilities<T>(weights: Weighted<T>): { value: T; p: number }[] {
  const positive = weights.filter((entry) => entry.weight > 0);
  const total = positive.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) return [];
  return positive.map((entry) => ({ value: entry.value, p: entry.weight / total }));
}

/** Weighted prices for a kind/rarity at the pool level the fallback would actually use. */
export function effectivePoolPrices(
  pool: PoolPrices,
  kind: ItemKind,
  rarity: Rarity,
  level: number
): Weighted<number> | undefined {
  const resolved = nearestPoolLevel(level, (candidate) => pool.prices(kind, rarity, candidate) !== undefined);
  return resolved === null ? undefined : pool.prices(kind, rarity, resolved);
}

/** Market and sell value distribution of one item of the given kind in a box of `boxLevel`. */
export function itemDistribution(
  model: LootboxModel,
  pool: PoolPrices,
  kind: ItemKind,
  boxLevel: number,
  { cap, sellRatio = DEFAULT_SELL_RATIO }: DistributionOptions = {}
): ValueDistributions {
  const market: Dist = new Map();
  const sell: Dist = new Map();
  for (const { value: rarity, p: pRarity } of probabilities(model.rarity)) {
    for (const { value: offset, p: pOffset } of probabilities(model.levelOffset[rarity])) {
      const mass = pRarity * pOffset;
      const prices = effectivePoolPrices(pool, kind, rarity, clampLevel(boxLevel + offset));
      if (!prices) {
        // No pool anywhere for this kind and rarity: the slot stays empty.
        addMass(market, 0, mass);
        addMass(sell, 0, mass);
        continue;
      }
      const total = prices.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
      if (total <= 0) {
        addMass(market, 0, mass);
        addMass(sell, 0, mass);
        continue;
      }
      for (const { value: price, weight } of prices) {
        if (weight <= 0) continue;
        const each = (mass * weight) / total;
        addMass(market, capped(price, cap), each);
        addMass(sell, capped(price * sellRatio[rarity], cap), each);
      }
    }
  }
  return { market, sell };
}

export function mean(dist: Dist): number {
  let total = 0;
  for (const [value, p] of dist) total += value * p;
  return total;
}

export function mix(a: Dist, b: Dist, weightA: number): Dist {
  const out: Dist = new Map();
  for (const [value, p] of a) addMass(out, value, p * weightA);
  for (const [value, p] of b) addMass(out, value, p * (1 - weightA));
  return out;
}

export function convolve(a: Dist, b: Dist, cap?: number): Dist {
  const out: Dist = new Map();
  for (const [x, p] of a) {
    for (const [y, q] of b) addMass(out, capped(x + y, cap), p * q);
  }
  return out;
}

function extraPermanentShare(model: LootboxModel): number {
  const permanent = probabilities(model.extraKind).find((entry) => entry.value === "permanent");
  return permanent?.p ?? 0;
}

/**
 * Exact distribution of a box's total market and sell value. The first item is always
 * permanent; each further item is permanent or consumable per `model.extraKind`.
 * With `cap`, every value at or above the cap is merged into the cap (enough for odds).
 */
export function boxDistribution(
  model: LootboxModel,
  pool: PoolPrices,
  boxLevel: number,
  options: DistributionOptions = {}
): BoxDistribution {
  const { cap } = options;
  const permanent = itemDistribution(model, pool, "permanent", boxLevel, options);
  const consumable = itemDistribution(model, pool, "consumable", boxLevel, options);
  const permanentShare = extraPermanentShare(model);
  const extra: ValueDistributions = {
    market: mix(permanent.market, consumable.market, permanentShare),
    sell: mix(permanent.sell, consumable.sell, permanentShare),
  };

  const counts = probabilities(model.count);
  const maxCount = counts.reduce((max, entry) => Math.max(max, entry.value), 1);
  const result: BoxDistribution = { market: new Map(), sell: new Map(), expectedMarket: 0 };

  for (const key of ["market", "sell"] as const) {
    let current = permanent[key];
    for (let n = 1; n <= maxCount; n++) {
      if (n > 1) current = convolve(current, extra[key], cap);
      const pCount = counts.filter((entry) => entry.value === n).reduce((sum, entry) => sum + entry.p, 0);
      if (pCount === 0) continue;
      for (const [value, p] of current) addMass(result[key], value, p * pCount);
    }
  }

  // Expected value from uncapped single-item means (linearity of expectation).
  const uncapped = { ...options, cap: undefined };
  const uncappedPermanent = cap === undefined ? permanent : itemDistribution(model, pool, "permanent", boxLevel, uncapped);
  const uncappedConsumable =
    cap === undefined ? consumable : itemDistribution(model, pool, "consumable", boxLevel, uncapped);
  const meanCount = counts.reduce((sum, entry) => sum + entry.value * entry.p, 0);
  const meanExtra =
    permanentShare * mean(uncappedPermanent.market) + (1 - permanentShare) * mean(uncappedConsumable.market);
  result.expectedMarket = mean(uncappedPermanent.market) + Math.max(0, meanCount - 1) * meanExtra;
  return result;
}

export function oddsFromDistribution(dist: BoxDistribution, price: number): BoxOdds {
  let pLoss = 0;
  for (const [value, p] of dist.market) if (value < price) pLoss += p;
  let pSellProfit = 0;
  for (const [value, p] of dist.sell) if (value >= price) pSellProfit += p;
  return {
    pLoss,
    pSellProfit,
    valueRatio: price > 0 ? dist.expectedMarket / price : Number.POSITIVE_INFINITY,
    expectedMarket: dist.expectedMarket,
  };
}

/** Odds for one box level at a given price. */
export function boxOdds(
  model: LootboxModel,
  pool: PoolPrices,
  boxLevel: number,
  price: number,
  sellRatio: SellRatios = DEFAULT_SELL_RATIO
): BoxOdds {
  return oddsFromDistribution(boxDistribution(model, pool, boxLevel, { cap: price, sellRatio }), price);
}

export { RARITIES };
