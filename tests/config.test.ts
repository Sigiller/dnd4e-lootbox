import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COUNT_VALUES,
  DEFAULT_CONFIG,
  OFFSET_VALUES,
  normalizeConfig,
  priceFor,
  typesToRestore,
  validateConfig,
  weightShare,
  type LootboxConfig,
} from "../src/model/config.js";
import { DEFAULT_MODEL } from "../src/model/defaults.js";
import { boxOdds } from "../src/model/distribution.js";
import { fitPrices, oddsByLevel } from "../src/model/levels.js";
import { DEFAULT_BOX_PRICES } from "../src/model/prices.js";
import { classifyItem } from "../src/pool/classify.js";
import { structuralTablesData } from "../src/tables/table-data.js";
import { CLASSIFY_SAMPLES, POOL } from "./helpers/fixtures.js";

const clone = (config: LootboxConfig): LootboxConfig => structuredClone(config);

describe("normalizeConfig", () => {
  it("returns the defaults for garbage", () => {
    for (const raw of [undefined, null, 42, "x", [], {}]) assert.deepEqual(normalizeConfig(raw), DEFAULT_CONFIG);
  });

  it("round-trips the defaults and expands rows to every allowed value", () => {
    assert.deepEqual(normalizeConfig(structuredClone(DEFAULT_CONFIG)), DEFAULT_CONFIG);
    assert.deepEqual(
      DEFAULT_CONFIG.model.count.map((e) => e.value),
      COUNT_VALUES
    );
    assert.deepEqual(
      DEFAULT_CONFIG.model.levelOffset.rare.map((e) => e.value),
      OFFSET_VALUES
    );
    assert.equal(DEFAULT_CONFIG.model.levelOffset.common.find((e) => e.value === 5)?.weight, 0);
  });

  it("keeps valid edits and repairs invalid ones field by field", () => {
    const raw = structuredClone(DEFAULT_CONFIG) as unknown as Record<string, unknown> & LootboxConfig;
    raw.model = {
      ...raw.model,
      rarity: [
        { value: "common", weight: 2 },
        { value: "uncommon", weight: 7.4 },
        { value: "rare", weight: -3 },
      ],
      count: [{ value: 1, weight: 0 }],
    };
    raw.sellRatio = { common: 0.25, uncommon: 2, rare: 1 };
    raw.targets = { lossMin: 0.3, lossMax: 0.1, sellProfitMin: 0.1, sellProfitMax: 0.4, minValueRatio: 1.5 };
    raw.prices = [500, -1, "x", ...DEFAULT_BOX_PRICES.slice(3)] as unknown as number[];
    raw.maxConsumablePriceFactor = 0;
    const config = normalizeConfig(raw);
    assert.deepEqual(config.model.rarity, [
      { value: "common", weight: 2 },
      { value: "uncommon", weight: 7 },
      { value: "rare", weight: 0 },
    ]);
    assert.deepEqual(config.model.count, DEFAULT_CONFIG.model.count, "an all-zero table falls back to the default");
    assert.deepEqual(config.sellRatio, { common: 0.25, uncommon: 0.5, rare: 1 });
    assert.equal(config.targets.lossMin, 0.15, "an inverted range falls back");
    assert.equal(config.targets.lossMax, 0.25);
    assert.equal(config.targets.sellProfitMax, 0.4);
    assert.equal(config.targets.minValueRatio, 1.5);
    assert.deepEqual(config.prices.slice(0, 3), [500, DEFAULT_BOX_PRICES[1], DEFAULT_BOX_PRICES[2]]);
    assert.equal(config.maxConsumablePriceFactor, 10);
  });
});

describe("type weights in the config", () => {
  it("defaults to weight 10 for every slot and consumable type", () => {
    assert.equal(DEFAULT_CONFIG.typeWeights.permanent.length, 8);
    assert.equal(DEFAULT_CONFIG.typeWeights.consumable.length, 7);
    for (const kind of ["permanent", "consumable"] as const) {
      assert.ok(DEFAULT_CONFIG.typeWeights[kind].every((e) => e.weight === 10));
    }
  });

  it("keeps stored weights, fills missing types with 0 and falls back when a kind is all zero", () => {
    const config = normalizeConfig({
      typeWeights: {
        permanent: [
          { value: "neck", weight: 4 },
          { value: "ring", weight: 20 },
          { value: "bogus", weight: 50 },
        ],
        consumable: [{ value: "potion", weight: 0 }],
      },
    });
    assert.equal(config.typeWeights.permanent.find((e) => e.value === "neck")?.weight, 4);
    assert.equal(config.typeWeights.permanent.find((e) => e.value === "ring")?.weight, 20);
    assert.equal(config.typeWeights.permanent.find((e) => e.value === "head")?.weight, 0);
    assert.equal(config.typeWeights.permanent.length, 8);
    assert.deepEqual(config.typeWeights.consumable, DEFAULT_CONFIG.typeWeights.consumable);
  });

  it("reports a kind whose type weights are all zero", () => {
    const config = clone(DEFAULT_CONFIG);
    config.typeWeights = {
      ...config.typeWeights,
      consumable: config.typeWeights.consumable.map((e) => ({ ...e, weight: 0 })),
    };
    assert.deepEqual(validateConfig(config), ["typeWeights"]);
  });

  it("lists types raised from 0, which need a rebuild", () => {
    const before = clone(DEFAULT_CONFIG).typeWeights;
    const zeroed = {
      ...before,
      consumable: before.consumable.map((e) => (e.value === "soulfang" ? { ...e, weight: 0 } : e)),
    };
    assert.deepEqual(typesToRestore(zeroed, before), ["soulfang"]);
    assert.deepEqual(typesToRestore(before, zeroed), []);
  });
});

describe("validateConfig", () => {
  it("accepts the defaults", () => {
    assert.deepEqual(validateConfig(DEFAULT_CONFIG), []);
  });

  it("reports each kind of problem", () => {
    const config = clone(DEFAULT_CONFIG);
    config.model = {
      ...config.model,
      count: config.model.count.map((e) => ({ ...e, weight: 0 })),
      levelOffset: { ...config.model.levelOffset, rare: config.model.levelOffset.rare.map((e) => ({ ...e, weight: 0 })) },
      rarity: config.model.rarity.map((e) => ({ ...e, weight: e.value === "rare" ? 1.5 : e.weight })),
    };
    config.sellRatio = { ...config.sellRatio, rare: 1.2 };
    config.targets = { ...config.targets, sellProfitMin: 0.4 };
    config.prices = config.prices.map((p, i) => (i === 4 ? 0 : p));
    config.maxConsumablePriceFactor = Number.NaN;
    assert.deepEqual(validateConfig(config).sort(), [
      "countWeights",
      "offsetWeights",
      "priceFactor",
      "prices",
      "sellProfitRange",
      "sellRatio",
      "weightRange",
    ]);
  });
});

describe("config-driven odds and prices", () => {
  it("every level meets the targets with the default config", () => {
    const rows = oddsByLevel(DEFAULT_CONFIG, POOL);
    assert.equal(rows.length, 30);
    assert.ok(rows.every((row) => row.meetsTargets));
  });

  it("fitting the default config reproduces the default prices", () => {
    assert.deepEqual(fitPrices(DEFAULT_CONFIG, POOL), [...DEFAULT_BOX_PRICES]);
  });

  it("sell ratios change the sell-profit odds", () => {
    const price = priceFor(DEFAULT_CONFIG, 10);
    const base = boxOdds(DEFAULT_MODEL, POOL, 10, price, DEFAULT_CONFIG.sellRatio);
    const stingy = boxOdds(DEFAULT_MODEL, POOL, 10, price, { common: 0.2, uncommon: 0.2, rare: 0.2 });
    assert.ok(stingy.pSellProfit < base.pSellProfit);
    assert.equal(stingy.pLoss, base.pLoss);
  });

  it("refits prices to new targets", () => {
    const config = clone(DEFAULT_CONFIG);
    config.targets = { ...config.targets, lossMin: 0.3, lossMax: 0.4 };
    config.prices = fitPrices(config, POOL);
    const rows = oddsByLevel(config, POOL);
    assert.ok(config.prices.every((p, i) => p >= (DEFAULT_BOX_PRICES[i] ?? 0)), "more losses need higher prices");
    assert.ok(rows.filter((row) => row.odds.pLoss >= 0.25).length >= 25);
  });

  it("clamps price lookups to levels 1–30", () => {
    assert.equal(priceFor(DEFAULT_CONFIG, 0), DEFAULT_BOX_PRICES[0]);
    assert.equal(priceFor(DEFAULT_CONFIG, 99), DEFAULT_BOX_PRICES[29]);
  });

  it("weightShare gives each row's chance", () => {
    assert.equal(weightShare(DEFAULT_CONFIG.model.count, 2), 0.45);
    assert.equal(weightShare(DEFAULT_CONFIG.model.levelOffset.common, 5), 0);
  });
});

describe("config in tables and pool", () => {
  it("builds the same structural tables from the expanded default rows", () => {
    assert.deepEqual(structuralTablesData(DEFAULT_CONFIG.model), structuralTablesData(DEFAULT_MODEL));
  });

  it("leaves zero-weight rows out of the tables", () => {
    const config = clone(DEFAULT_CONFIG);
    const offsets = config.model.levelOffset.rare.map((e) => (e.value === 5 ? { ...e, weight: 3 } : e));
    config.model = { ...config.model, levelOffset: { ...config.model.levelOffset, rare: offsets } };
    const rare = structuralTablesData(config.model).find((t) => t.flags["dnd4e-lootbox"].table.rarity === "rare");
    assert.equal(rare?.formula, "1d23");
    assert.deepEqual(
      rare?.results.map((r) => r.flags["dnd4e-lootbox"].result.value),
      [-2, -1, 0, 1, 2, 5]
    );
  });

  it("applies the consumable price cap", () => {
    const greenbane = CLASSIFY_SAMPLES.find((s) => s.label === "greenbane price anomaly");
    assert.ok(greenbane);
    assert.equal(classifyItem(greenbane.item), null);
    assert.ok(classifyItem(greenbane.item, { maxConsumablePriceFactor: 30 }));
  });
});
