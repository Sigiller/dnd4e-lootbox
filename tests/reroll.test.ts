import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_SELL_RATIO } from "../src/model/types.js";
import { lootboxCardHtml, readCardFlag, type LootboxCardFlag } from "../src/open/chat-card.js";
import { grantedIdsBySlot } from "../src/open/grant.js";
import { replaceItem, summarizeItems, type DrawnItem } from "../src/open/resolve.js";
import { bumpRerolls, isRerollMode } from "../src/open/reroll.js";

// The card HTML localizes its labels; keys are enough here.
(globalThis as unknown as { game: unknown }).game = {
  i18n: {
    localize: (key: string) => key,
    format: (key: string, data: Record<string, string>) => `${key}${JSON.stringify(data)}`,
  },
};

const item = (uuid: string, price: number, rarity: DrawnItem["rarity"] = "uncommon"): DrawnItem => ({
  uuid,
  name: `Item ${uuid}`,
  img: null,
  kind: "permanent",
  rarity,
  level: 5,
  price,
});

describe("replaceItem", () => {
  const box = summarizeItems(1000, [item("a", 1000), item("b", 40, "common")]);

  it("swaps one item and recomputes totals and verdict at the same price", () => {
    assert.equal(box.verdict, "marketProfit");
    const swapped = replaceItem(box, 1, item("c", 1000, "rare"));
    assert.equal(swapped.price, 1000);
    assert.deepEqual(
      swapped.items.map((i) => i.uuid),
      ["a", "c"]
    );
    assert.equal(swapped.marketValue, 2000);
    assert.equal(swapped.sellValue, 1000 * DEFAULT_SELL_RATIO.uncommon + 1000 * DEFAULT_SELL_RATIO.rare);
    assert.equal(swapped.verdict, "sellProfit");
    assert.deepEqual(
      box.items.map((i) => i.uuid),
      ["a", "b"],
      "the original summary is untouched"
    );
  });

  it("rejects an index outside the box", () => {
    assert.throws(() => replaceItem(box, 2, item("c", 1)), RangeError);
    assert.throws(() => replaceItem(box, -1, item("c", 1)), RangeError);
  });
});

describe("isRerollMode", () => {
  it("accepts item and slot only", () => {
    assert.ok(isRerollMode("item"));
    assert.ok(isRerollMode("slot"));
    assert.ok(!isRerollMode("box"));
    assert.ok(!isRerollMode(undefined));
  });
});

describe("bumpRerolls", () => {
  it("counts rerolls per item, starting from zero", () => {
    assert.deepEqual(bumpRerolls(undefined, 3, 1), [0, 1, 0]);
    assert.deepEqual(bumpRerolls([0, 1, 0], 3, 1), [0, 2, 0]);
    assert.deepEqual(bumpRerolls([2], 2, 1), [2, 1]);
  });
});

describe("grantedIdsBySlot", () => {
  const items = [{ uuid: "potion" }, { uuid: "ring" }, { uuid: "potion" }, { uuid: "missing" }];

  it("maps each box item to its inventory stack by compendium source", () => {
    const created = [
      { uuid: "potion", id: "P" },
      { uuid: "ring", id: "R" },
    ];
    assert.deepEqual(grantedIdsBySlot(items, created), ["P", "R", "P", null]);
  });

  it("does not depend on the order Foundry returns created items in", () => {
    // v14 returns created documents sorted by id: here "A" (ring) before "Z" (potion).
    const created = [
      { uuid: "ring", id: "A" },
      { uuid: "potion", id: "Z" },
    ];
    assert.deepEqual(grantedIdsBySlot(items, created), ["Z", "A", "Z", null]);
  });

  it("skips created items without a source or id", () => {
    assert.deepEqual(grantedIdsBySlot(items, [{ uuid: null, id: "X" }, { uuid: "ring", id: undefined }]), [
      null,
      null,
      null,
      null,
    ]);
  });
});

describe("lootbox card", () => {
  const data: LootboxCardFlag = {
    level: 5,
    summary: summarizeItems(1000, [item("a", 1000), item("b", 40, "common")]),
    charged: false,
    sellRatio: DEFAULT_SELL_RATIO,
    rerolls: [0, 2],
  };

  it("has a swap and a slot reroll button per item and marks rerolled items", () => {
    const html = lootboxCardHtml(data);
    assert.deepEqual(
      [...html.matchAll(/data-lootbox-reroll="(\d+)" data-lootbox-mode="(\w+)"/g)].map((m) => `${m[1]}:${m[2]}`),
      ["0:item", "0:slot", "1:item", "1:slot"]
    );
    assert.ok(html.includes("dnd4e-lootbox.chat.rerollFirstSlot"), "the first item's slot button says it stays permanent");
    assert.ok(html.includes("dnd4e-lootbox.chat.rerollSlot"));
    assert.equal((html.match(/class="lb-rerolled"/g) ?? []).length, 1);
    assert.ok(html.includes("dnd4e-lootbox.chat.rerolledTimes{&quot;count&quot;:&quot;2&quot;}"));
  });

  it("reads only card flags that can be rerolled", () => {
    assert.deepEqual(readCardFlag({ flags: { "dnd4e-lootbox": { box: data } } }), data);
    const old = { flags: { "dnd4e-lootbox": { box: { level: 5, summary: data.summary } } } };
    assert.equal(readCardFlag(old), null, "cards from before rerolls lack charged and sellRatio");
    assert.equal(readCardFlag({ flags: {} }), null);
  });
});
