import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_MODEL, DEFAULT_TYPE_WEIGHTS } from "../src/model/defaults.js";
import type { LootboxModel } from "../src/model/types.js";
import {
  offsetLabel,
  poolTableName,
  poolTablesData,
  rangesFromWeights,
  structuralTablesData,
  weightsFromRanges,
} from "../src/tables/table-data.js";
import { poolEntries } from "./helpers/fixtures.js";

describe("structural tables", () => {
  const tables = structuralTablesData(DEFAULT_MODEL);

  it("builds six d20 tables with contiguous ranges", () => {
    assert.equal(tables.length, 6);
    for (const table of tables) {
      assert.equal(table.formula, "1d20", table.name);
      let next = 1;
      for (const result of table.results) {
        assert.equal(result.range[0], next);
        next = result.range[1] + 1;
      }
      assert.equal(next, 21, table.name);
    }
  });

  it("round-trips to the default model through result ranges", () => {
    const byRole = (role: string, rarity?: string) => {
      const table = tables.find(
        (t) => t.flags["dnd4e-lootbox"].table.role === role && t.flags["dnd4e-lootbox"].table.rarity === rarity
      );
      assert.ok(table);
      return table.results.map((r) => ({ value: r.flags["dnd4e-lootbox"].result.value, range: r.range }));
    };
    const model = {
      count: weightsFromRanges(byRole("count")),
      extraKind: weightsFromRanges(byRole("extraKind")),
      rarity: weightsFromRanges(byRole("rarity")),
      levelOffset: {
        common: weightsFromRanges(byRole("offset", "common")),
        uncommon: weightsFromRanges(byRole("offset", "uncommon")),
        rare: weightsFromRanges(byRole("offset", "rare")),
      },
    } as unknown as LootboxModel;
    assert.deepEqual(model, DEFAULT_MODEL);
  });

  it("labels results readably", () => {
    assert.equal(offsetLabel(0), "Box level");
    assert.equal(offsetLabel(-2), "−2 levels");
    assert.equal(offsetLabel(1), "+1 level");
    assert.deepEqual(rangesFromWeights([6, 9, 3, 2]), [
      [1, 6],
      [7, 15],
      [16, 18],
      [19, 20],
    ]);
  });
});

describe("pool tables", () => {
  const entries = poolEntries();
  const tables = poolTablesData(entries, DEFAULT_TYPE_WEIGHTS);

  it("creates one table per non-empty cell with every item once", () => {
    assert.equal(tables.length, 162);
    const total = tables.reduce((sum, t) => sum + t.results.length, 0);
    assert.equal(total, entries.length);
    for (const table of tables) {
      const top = table.results.at(-1)?.range[1] ?? 0;
      assert.equal(table.formula, `1d${String(top)}`);
      assert.ok(table.results.every((r) => r.type === "document" && r.documentUuid && r.weight >= 1));
      let next = 1;
      for (const result of table.results) {
        assert.deepEqual(result.range, [next, next + result.weight - 1]);
        next += result.weight;
      }
    }
  });

  it("gives every item type present in a table an equal share by default", () => {
    for (const table of tables) {
      const byType = new Map<string, number>();
      let total = 0;
      for (const result of table.results) {
        const type = result.flags["dnd4e-lootbox"].result.type ?? "?";
        byType.set(type, (byType.get(type) ?? 0) + result.weight);
        total += result.weight;
      }
      for (const weight of byType.values()) assert.ok(Math.abs(weight / total - 1 / byType.size) < 1e-4, table.name);
    }
  });

  it("leaves out types with weight 0 and drops tables left empty", () => {
    const noWondrous = {
      ...DEFAULT_TYPE_WEIGHTS,
      permanent: DEFAULT_TYPE_WEIGHTS.permanent.map((e) => (e.value === "wondrous" ? { ...e, weight: 0 } : e)),
    };
    const filtered = poolTablesData(entries, noWondrous);
    const results = filtered.flatMap((t) => t.results);
    assert.ok(results.every((r) => r.flags["dnd4e-lootbox"].result.type !== "wondrous"));
    assert.equal(results.length, entries.length - entries.filter((e) => e.type === "wondrous").length);
    assert.ok(filtered.every((t) => t.results.length > 0));
  });

  it("names and orders tables by kind, level and rarity", () => {
    assert.equal(tables[0]?.name, poolTableName("permanent", "common", 1));
    assert.equal(poolTableName("consumable", "rare", 7), "Consumable · L07 · Rare");
    assert.equal(tables.at(-1)?.flags["dnd4e-lootbox"].table.kind, "consumable");
  });
});
