import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_TYPE_WEIGHTS } from "../src/model/defaults.js";
import { poolCellsFromRecord, poolEntryWeights, poolPricesFromCells } from "../src/model/type-weights.js";
import type { ItemType, Weighted } from "../src/model/types.js";
import { POOL_CELLS } from "./helpers/fixtures.js";

const weights = (entries: Partial<Record<ItemType, number>>): Weighted<ItemType> =>
  Object.entries(entries).map(([value, weight]) => ({ value: value as ItemType, weight }));

function typeShares(types: readonly ItemType[], result: readonly number[]): Map<ItemType, number> {
  const total = result.reduce((sum, w) => sum + w, 0);
  const shares = new Map<ItemType, number>();
  types.forEach((type, index) => shares.set(type, (shares.get(type) ?? 0) + (result[index] ?? 0) / total));
  return shares;
}

describe("poolEntryWeights", () => {
  it("splits a type's share evenly among its items", () => {
    assert.deepEqual(poolEntryWeights(["neck", "neck", "neck", "ring"], weights({ neck: 10, ring: 10 })), [1, 1, 1, 3]);
  });

  it("follows unequal type weights exactly", () => {
    const types: ItemType[] = ["neck", "ring", "ring"];
    const result = poolEntryWeights(types, weights({ neck: 30, ring: 10 }));
    assert.deepEqual(result, [6, 1, 1]);
    assert.equal(typeShares(types, result).get("neck"), 0.75);
  });

  it("leaves out zero-weight types and lets the present types share the cell", () => {
    const types: ItemType[] = ["neck", "head", "ring"];
    const result = poolEntryWeights(types, weights({ neck: 10, head: 0, ring: 30, wondrous: 50 }));
    assert.deepEqual(result, [1, 0, 3]);
    assert.deepEqual(poolEntryWeights(["head"], weights({ head: 0 })), [0]);
  });

  it("stays within 10⁻⁴ of the type weights when the exact scale would be huge", () => {
    const counts: [ItemType, number][] = [
      ["head", 7],
      ["neck", 11],
      ["arms", 13],
      ["hands", 17],
      ["waist", 19],
      ["feet", 23],
      ["ring", 29],
      ["wondrous", 31],
    ];
    const types = counts.flatMap(([type, n]) => Array.from({ length: n }, () => type));
    const result = poolEntryWeights(types, DEFAULT_TYPE_WEIGHTS.permanent);
    assert.ok(result.every((w) => Number.isInteger(w) && w > 0));
    for (const share of typeShares(types, result).values()) assert.ok(Math.abs(share - 1 / 8) < 1e-4);
  });
});

describe("poolPricesFromCells", () => {
  it("merges equal prices and weights them by type", () => {
    const pool = poolPricesFromCells(
      {
        "permanent|common|5": [
          { price: 100, type: "neck" },
          { price: 100, type: "neck" },
          { price: 300, type: "ring" },
        ],
      },
      DEFAULT_TYPE_WEIGHTS
    );
    // neck and ring each get half the cell; the two neck items share theirs
    assert.deepEqual(pool.prices("permanent", "common", 5), [
      { value: 100, weight: 2 },
      { value: 300, weight: 2 },
    ]);
    assert.equal(pool.prices("permanent", "common", 6), undefined);
  });

  it("drops a cell whose types all have weight 0", () => {
    const pool = poolPricesFromCells(
      { "consumable|rare|5": [{ price: 50, type: "soulfang" }] },
      { ...DEFAULT_TYPE_WEIGHTS, consumable: weights({ soulfang: 0, potion: 10 }) }
    );
    assert.equal(pool.prices("consumable", "rare", 5), undefined);
  });
});

describe("pool fixture", () => {
  it("parses every cell and skips malformed rows", () => {
    assert.equal(Object.keys(POOL_CELLS).length, 162);
    const cells = poolCellsFromRecord({ "permanent|common|1": [[360, "neck"], [0, "neck"], [360, "bogus"], "x"] });
    assert.deepEqual(cells, { "permanent|common|1": [{ price: 360, type: "neck" }] });
  });
});
