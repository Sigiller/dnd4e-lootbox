import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fitPrice, meetsTargets, roundPrice } from "../src/model/calibrate.js";
import { DEFAULT_MODEL } from "../src/model/defaults.js";
import { boxDistribution, boxOdds, oddsFromDistribution, type Dist } from "../src/model/distribution.js";
import { DEFAULT_BOX_PRICES } from "../src/model/prices.js";
import { DEFAULT_CONFIG, priceFor } from "../src/model/config.js";
import { DEFAULT_TYPE_WEIGHTS } from "../src/model/defaults.js";
import { poolPricesFromCells } from "../src/model/type-weights.js";
import { DEFAULT_SELL_RATIO, type ItemType, type LootboxModel, type Rarity } from "../src/model/types.js";
import { resolveBox, summarizeBox } from "../src/open/resolve.js";
import { createWeightedDrawer, seededRng } from "../src/open/weighted-drawer.js";
import { POOL, poolEntries } from "./helpers/fixtures.js";

function close(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) <= eps;
}

describe("exact distribution", () => {
  // Tiny model small enough to enumerate by hand.
  const model: LootboxModel = {
    count: [
      { value: 1, weight: 1 },
      { value: 2, weight: 3 },
    ],
    extraKind: [
      { value: "permanent", weight: 1 },
      { value: "consumable", weight: 1 },
    ],
    rarity: [
      { value: "common", weight: 1 },
      { value: "rare", weight: 1 },
    ],
    levelOffset: {
      common: [{ value: 0, weight: 1 }],
      uncommon: [{ value: 0, weight: 1 }],
      rare: [
        { value: 0, weight: 1 },
        { value: 1, weight: 1 },
      ],
    },
  };
  const one = (type: ItemType, ...prices: number[]) => prices.map((price) => ({ price, type }));
  const pool = poolPricesFromCells(
    {
      "permanent|common|5": one("neck", 100, 200),
      "permanent|rare|5": one("ring", 1000),
      "permanent|rare|6": one("ring", 2000),
      "consumable|common|5": one("potion", 10),
      // no rare consumable at 5 or 6: falls back to level 4
      "consumable|rare|4": one("potion", 40),
    },
    DEFAULT_TYPE_WEIGHTS
  );

  it("matches brute-force enumeration", () => {
    interface Outcome {
      market: number;
      sell: number;
      p: number;
    }
    const single = (kind: "permanent" | "consumable"): Outcome[] => {
      const out: Outcome[] = [];
      const push = (price: number, rarity: Rarity, p: number) =>
        out.push({ market: price, sell: price * DEFAULT_SELL_RATIO[rarity], p });
      if (kind === "permanent") {
        push(100, "common", 0.25);
        push(200, "common", 0.25);
        push(1000, "rare", 0.25);
        push(2000, "rare", 0.25);
      } else {
        push(10, "common", 0.5);
        push(40, "rare", 0.25);
        push(40, "rare", 0.25);
      }
      return out;
    };
    const perm = single("permanent");
    const extra = [
      ...perm.map((o) => ({ ...o, p: o.p * 0.5 })),
      ...single("consumable").map((o) => ({ ...o, p: o.p * 0.5 })),
    ];
    const market: Dist = new Map();
    const sell: Dist = new Map();
    const add = (d: Dist, v: number, p: number) => d.set(v, (d.get(v) ?? 0) + p);
    for (const a of perm) {
      add(market, a.market, a.p * 0.25);
      add(sell, a.sell, a.p * 0.25);
      for (const b of extra) {
        add(market, a.market + b.market, a.p * b.p * 0.75);
        add(sell, a.sell + b.sell, a.p * b.p * 0.75);
      }
    }
    const dist = boxDistribution(model, pool, 5);
    for (const [expected, actual] of [
      [market, dist.market],
      [sell, dist.sell],
    ] as const) {
      assert.equal(actual.size, expected.size);
      for (const [value, p] of expected) assert.ok(close(actual.get(value) ?? 0, p), `value ${String(value)}`);
    }
    const expectedMean = [...market].reduce((s, [v, p]) => s + v * p, 0);
    assert.ok(close(dist.expectedMarket, expectedMean, 1e-6));
  });

  it("gives the same odds with and without the cap", () => {
    for (const level of [1, 7, 16, 30]) {
      const price = priceFor(DEFAULT_CONFIG, level);
      const capped = boxOdds(DEFAULT_MODEL, POOL, level, price);
      const full = oddsFromDistribution(boxDistribution(DEFAULT_MODEL, POOL, level), price);
      assert.ok(close(capped.pLoss, full.pLoss, 1e-9));
      assert.ok(close(capped.pSellProfit, full.pSellProfit, 1e-9));
      assert.ok(close(capped.expectedMarket, full.expectedMarket, 1e-6));
    }
  });
});

describe("default model and box prices", () => {
  it("has a price for every level 1–30", () => {
    assert.equal(DEFAULT_BOX_PRICES.length, 30);
  });

  for (let level = 1; level <= 30; level++) {
    it(`level ${String(level)} meets the target odds`, () => {
      const odds = boxOdds(DEFAULT_MODEL, POOL, level, priceFor(DEFAULT_CONFIG, level));
      assert.ok(odds.valueRatio > 1, `average value ${String(odds.valueRatio)}`);
      assert.ok(odds.pLoss >= 0.15 && odds.pLoss <= 0.25, `loss ${String(odds.pLoss)}`);
      assert.ok(odds.pSellProfit >= 0.2 && odds.pSellProfit <= 0.3, `sell-profit ${String(odds.pSellProfit)}`);
      assert.ok(meetsTargets(odds));
    });
  }

  it("DEFAULT_BOX_PRICES is what the calibration fits", () => {
    for (let level = 1; level <= 30; level++) {
      assert.equal(fitPrice(boxDistribution(DEFAULT_MODEL, POOL, level)).price, priceFor(DEFAULT_CONFIG, level), `L${String(level)}`);
    }
  });

  it("rounds prices up to two significant digits", () => {
    assert.equal(roundPrice(361), 370);
    assert.equal(roundPrice(2201), 2300);
    assert.equal(roundPrice(5000), 5000);
    assert.equal(roundPrice(1_234_567), 1_300_000);
    assert.equal(roundPrice(42), 42);
  });
});

describe("simulation agrees with the exact odds", () => {
  const entries = poolEntries();
  for (const level of [3, 7, 22]) {
    it(`level ${String(level)}: 20,000 seeded boxes within 1.5 pp`, async () => {
      const drawer = createWeightedDrawer(DEFAULT_MODEL, entries, seededRng(level * 7919));
      const price = priceFor(DEFAULT_CONFIG, level);
      let loss = 0;
      let sell = 0;
      const n = 20_000;
      for (let i = 0; i < n; i++) {
        const summary = summarizeBox(price, await resolveBox(level, drawer));
        if (summary.verdict === "loss") loss++;
        if (summary.verdict === "sellProfit") sell++;
      }
      const odds = boxOdds(DEFAULT_MODEL, POOL, level, price);
      assert.ok(Math.abs(loss / n - odds.pLoss) < 0.015, `loss ${String(loss / n)} vs ${String(odds.pLoss)}`);
      assert.ok(Math.abs(sell / n - odds.pSellProfit) < 0.015, `sell ${String(sell / n)} vs ${String(odds.pSellProfit)}`);
    });
  }
});
