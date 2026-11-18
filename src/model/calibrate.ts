import { DEFAULT_TARGETS } from "./defaults.js";
import { oddsFromDistribution, type BoxDistribution, type BoxOdds } from "./distribution.js";
import type { Targets } from "./types.js";

/** Round up to two significant digits (370, 1,600, 2,300,000). */
export function roundPrice(value: number): number {
  if (value <= 0) return 0;
  const step = 10 ** Math.max(0, Math.floor(Math.log10(value)) - 1);
  return Math.ceil(value / step - 1e-9) * step;
}

function outside(value: number, min: number, max: number): number {
  return Math.max(0, min - value) + Math.max(0, value - max);
}

/** The inner 80% of a target band; fitting aims inside it so rounding keeps the odds in range. */
function softBand(min: number, max: number): { min: number; max: number; centre: number } {
  const margin = (max - min) * 0.1;
  return { min: min + margin, max: max - margin, centre: (min + max) / 2 };
}

/** Lower is better: distance from the target band, then from its centre. */
export function priceScore(odds: BoxOdds, targets: Targets = DEFAULT_TARGETS): number {
  const loss = softBand(targets.lossMin, targets.lossMax);
  const sell = softBand(targets.sellProfitMin, targets.sellProfitMax);
  return (
    outside(odds.pLoss, loss.min, loss.max) * 20 +
    outside(odds.pSellProfit, sell.min, sell.max) * 20 +
    (odds.pLoss - loss.centre) ** 2 +
    (odds.pSellProfit - sell.centre) ** 2 +
    (odds.valueRatio > targets.minValueRatio * 1.1 ? 0 : 5)
  );
}

export function meetsTargets(odds: BoxOdds, targets: Targets = DEFAULT_TARGETS): boolean {
  return (
    odds.pLoss >= targets.lossMin &&
    odds.pLoss <= targets.lossMax &&
    odds.pSellProfit >= targets.sellProfitMin &&
    odds.pSellProfit <= targets.sellProfitMax &&
    odds.valueRatio > targets.minValueRatio
  );
}

export interface FittedPrice {
  price: number;
  odds: BoxOdds;
}

/** Best two-significant-digit price for an uncapped box distribution. */
export function fitPrice(dist: BoxDistribution, targets: Targets = DEFAULT_TARGETS): FittedPrice {
  const candidates = new Set<number>();
  for (const value of [...dist.market.keys(), ...dist.sell.keys()]) {
    if (value <= 0) continue;
    candidates.add(roundPrice(value));
    candidates.add(roundPrice(value * 1.0001));
  }
  let best: (FittedPrice & { score: number }) | undefined;
  for (const price of [...candidates].sort((a, b) => a - b)) {
    const odds = oddsFromDistribution(dist, price);
    const score = priceScore(odds, targets);
    if (!best || score < best.score) best = { price, odds, score };
  }
  if (!best) throw new Error("Cannot fit a price to an empty distribution");
  return { price: best.price, odds: best.odds };
}
