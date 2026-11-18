export const DENOMINATIONS = ["ad", "pp", "gp", "sp", "cp"] as const;
export type Denomination = (typeof DENOMINATIONS)[number];
export type Purse = Record<Denomination, number>;

/** Value of one coin in copper pieces (dnd4e: ad = 100 pp, pp = 100 gp). */
const COPPER_VALUE: Readonly<Record<Denomination, number>> = {
  ad: 1_000_000,
  pp: 10_000,
  gp: 100,
  sp: 10,
  cp: 1,
};

/** Coins spent first to last: gold, then breaking platinum and astral diamonds, then small change. */
const PAY_ORDER: readonly Denomination[] = ["gp", "pp", "ad", "sp", "cp"];
/** Change is returned in the largest coins below an astral diamond. */
const CHANGE_ORDER: readonly Denomination[] = ["pp", "gp", "sp", "cp"];

export function normalizePurse(raw: Partial<Record<string, unknown>> | null | undefined): Purse {
  const purse = { ad: 0, pp: 0, gp: 0, sp: 0, cp: 0 };
  for (const denomination of DENOMINATIONS) {
    const value = Number(raw?.[denomination] ?? 0);
    purse[denomination] = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }
  return purse;
}

export function purseCopper(purse: Purse): number {
  return DENOMINATIONS.reduce((sum, denomination) => sum + purse[denomination] * COPPER_VALUE[denomination], 0);
}

export function purseGoldValue(purse: Purse): number {
  return purseCopper(purse) / 100;
}

/**
 * Pay `priceGp` from a purse. Spends gold first, breaks bigger coins when needed and
 * returns change in coins. Returns null when the purse holds less than the price.
 */
export function payFromPurse(purse: Purse, priceGp: number): Purse | null {
  const priceCopper = Math.round(priceGp * 100);
  if (priceCopper < 0) throw new Error("Price cannot be negative");
  if (purseCopper(purse) < priceCopper) return null;

  const next: Purse = { ...purse };
  let owed = priceCopper;
  for (const denomination of PAY_ORDER) {
    if (owed <= 0) break;
    const value = COPPER_VALUE[denomination];
    const coins = Math.min(next[denomination], Math.ceil(owed / value));
    next[denomination] -= coins;
    owed -= coins * value;
  }

  let change = -owed;
  for (const denomination of CHANGE_ORDER) {
    const value = COPPER_VALUE[denomination];
    const coins = Math.floor(change / value);
    next[denomination] += coins;
    change -= coins * value;
  }
  return next;
}
