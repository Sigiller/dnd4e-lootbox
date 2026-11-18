import { MAX_LEVEL, MIN_LEVEL } from "../constants.js";
import { fitPrice, meetsTargets } from "./calibrate.js";
import { priceFor, type LootboxConfig } from "./config.js";
import { boxDistribution, boxOdds, type BoxOdds } from "./distribution.js";
import type { PoolPrices } from "./types.js";

export interface LevelOdds {
  level: number;
  price: number;
  odds: BoxOdds;
  meetsTargets: boolean;
}

export const LEVELS: readonly number[] = Array.from({ length: MAX_LEVEL - MIN_LEVEL + 1 }, (_, i) => i + MIN_LEVEL);

/** Odds of every box level under a config, with the pool prices the tables roll. */
export function oddsByLevel(config: LootboxConfig, pool: PoolPrices): LevelOdds[] {
  return LEVELS.map((level) => {
    const price = priceFor(config, level);
    const odds = boxOdds(config.model, pool, level, price, config.sellRatio);
    return { level, price, odds, meetsTargets: meetsTargets(odds, config.targets) };
  });
}

/** Fit a two-significant-digit price for every level to the config's targets. */
export function fitPrices(config: LootboxConfig, pool: PoolPrices): number[] {
  return LEVELS.map(
    (level) =>
      fitPrice(boxDistribution(config.model, pool, level, { sellRatio: config.sellRatio }), config.targets).price
  );
}
