import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ItemKind, Rarity } from "../src/model/types.js";
import {
  resolveBox,
  resolveSlot,
  summarizeBox,
  verdictFor,
  type DrawnItem,
  type LootboxDrawer,
} from "../src/open/resolve.js";

function scriptedDrawer(script: {
  count: number;
  kinds: ItemKind[];
  rarities: Rarity[];
  offsets: number[];
  pools: Set<string>;
}): LootboxDrawer & { requested: string[] } {
  const kinds = [...script.kinds];
  const rarities = [...script.rarities];
  const offsets = [...script.offsets];
  const requested: string[] = [];
  return {
    requested,
    drawCount: async () => script.count,
    drawExtraKind: async () => kinds.shift() ?? "permanent",
    drawRarity: async () => rarities.shift() ?? "uncommon",
    drawOffset: async () => offsets.shift() ?? 0,
    hasPool: (kind, rarity, level) => script.pools.has(`${kind}|${rarity}|${String(level)}`),
    drawItem: async (kind, rarity, level): Promise<DrawnItem> => {
      requested.push(`${kind}|${rarity}|${String(level)}`);
      return { uuid: `u-${String(requested.length)}`, name: "Item", img: null, kind, rarity, level, price: 1000 };
    },
  };
}

describe("resolveSlot", () => {
  it("keeps the first slot permanent without drawing a kind", async () => {
    const drawer = scriptedDrawer({
      count: 1,
      kinds: ["consumable"],
      rarities: ["rare"],
      offsets: [1],
      pools: new Set(["permanent|rare|8"]),
    });
    const slot = await resolveSlot(7, 0, drawer);
    assert.equal(slot.kind, "permanent");
    assert.equal(slot.rarity, "rare");
    assert.equal(slot.targetLevel, 8);
    assert.deepEqual(drawer.requested, ["permanent|rare|8"]);
  });

  it("draws kind, rarity, offset and item for a later slot", async () => {
    const drawer = scriptedDrawer({
      count: 1,
      kinds: ["consumable"],
      rarities: ["common"],
      offsets: [-2],
      pools: new Set(["consumable|common|4"]),
    });
    const slot = await resolveSlot(7, 2, drawer);
    assert.deepEqual(
      { kind: slot.kind, rarity: slot.rarity, offset: slot.offset, target: slot.targetLevel, pool: slot.poolLevel },
      { kind: "consumable", rarity: "common", offset: -2, target: 5, pool: 4 }
    );
  });
});

describe("resolveBox", () => {
  it("makes the first item permanent and draws a kind for each extra item", async () => {
    const drawer = scriptedDrawer({
      count: 3,
      kinds: ["consumable", "permanent"],
      rarities: ["uncommon", "common", "rare"],
      offsets: [0, -1, 2],
      pools: new Set(["permanent|uncommon|10", "consumable|common|9", "permanent|rare|12"]),
    });
    const slots = await resolveBox(10, drawer);
    assert.deepEqual(
      slots.map((s) => [s.kind, s.rarity, s.targetLevel, s.poolLevel]),
      [
        ["permanent", "uncommon", 10, 10],
        ["consumable", "common", 9, 9],
        ["permanent", "rare", 12, 12],
      ]
    );
  });

  it("falls back to the nearest pool and clamps levels", async () => {
    const drawer = scriptedDrawer({
      count: 2,
      kinds: ["consumable"],
      rarities: ["rare", "rare"],
      offsets: [2, -2],
      pools: new Set(["permanent|rare|29", "consumable|rare|5"]),
    });
    const slots = await resolveBox(30, drawer);
    assert.equal(slots[0]?.targetLevel, 30);
    assert.equal(slots[0]?.poolLevel, 29);
    assert.equal(slots[1]?.targetLevel, 28);
    assert.equal(slots[1]?.poolLevel, 5);
  });

  it("clamps the count to 1–4 and leaves a slot empty without any pool", async () => {
    const drawer = scriptedDrawer({ count: 9, kinds: [], rarities: [], offsets: [], pools: new Set() });
    const slots = await resolveBox(5, drawer);
    assert.equal(slots.length, 4);
    assert.ok(slots.every((s) => s.item === null && s.poolLevel === null));
  });
});

describe("summarizeBox", () => {
  const item = (price: number, rarity: Rarity): DrawnItem => ({
    uuid: "u",
    name: "n",
    img: null,
    kind: "permanent",
    rarity,
    level: 5,
    price,
  });
  const slot = (i: DrawnItem) => ({
    kind: i.kind,
    rarity: i.rarity,
    offset: 0,
    targetLevel: 5,
    poolLevel: 5,
    item: i,
  });

  it("totals market and per-rarity sell value", () => {
    const summary = summarizeBox(1000, [slot(item(1000, "uncommon")), slot(item(100, "common")), slot(item(50, "rare"))]);
    assert.equal(summary.marketValue, 1150);
    assert.equal(summary.sellValue, 500 + 20 + 50);
    assert.equal(summary.verdict, "marketProfit");
  });

  it("classifies verdicts", () => {
    assert.equal(verdictFor(1000, 999, 500), "loss");
    assert.equal(verdictFor(1000, 1000, 999), "marketProfit");
    assert.equal(verdictFor(1000, 1000, 1000), "sellProfit");
  });
});
