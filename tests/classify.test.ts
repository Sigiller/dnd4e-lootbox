import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { basicsLine, classifyItem, itemType, rarityFromBasics } from "../src/pool/classify.js";
import { CLASSIFY_SAMPLES } from "./helpers/fixtures.js";

describe("classifyItem on real compendium documents", () => {
  for (const sample of CLASSIFY_SAMPLES) {
    it(`${sample.label}: ${sample.item.name}`, () => {
      const entry = classifyItem(sample.item);
      if (sample.expect === null) {
        assert.equal(entry, null);
        return;
      }
      assert.ok(entry, "expected the item to be in the pool");
      assert.equal(entry.kind, sample.expect.kind);
      assert.equal(entry.rarity, sample.expect.rarity);
      if (sample.expect.type !== undefined) assert.equal(entry.type, sample.expect.type);
      if (sample.expect.level !== undefined) assert.equal(entry.level, sample.expect.level);
      if (sample.expect.price !== undefined) assert.equal(entry.price, sample.expect.price);
      assert.equal(entry.uuid, sample.item.uuid);
    });
  }

  it("covers every exclusion the plan lists", () => {
    const excluded = CLASSIFY_SAMPLES.filter((s) => s.expect === null).map((s) => s.label);
    for (const label of ["arms shield", "body armor", "weapon", "implement", "psionic augment", "ammunition", "alternative reward", "mount"]) {
      assert.ok(excluded.includes(label), `missing fixture for ${label}`);
    }
  });
});

describe("itemType", () => {
  it("uses the equipment slot for permanent items, with other as wondrous", () => {
    assert.equal(itemType("permanent", "neck", "Neck Slot: Uncommon"), "neck");
    assert.equal(itemType("permanent", "ring", "Ring Slot: Rare"), "ring");
    assert.equal(itemType("permanent", "other", "Wondrous Item: Uncommon"), "wondrous");
  });

  it("reads the consumable subtype from the basics line", () => {
    assert.equal(itemType("consumable", "", "Consumable: Potion - Common"), "potion");
    assert.equal(itemType("consumable", "", "Consumable: Elixir - Uncommon"), "elixir");
    assert.equal(itemType("consumable", "", "Consumable: Reagent - Uncommon"), "reagent");
    assert.equal(itemType("consumable", "", "Consumable: Whetstones - Uncommon"), "whetstone");
    assert.equal(itemType("consumable", "", "Consumable: Soulfang - Uncommon"), "soulfang");
  });

  it("treats alchemical items and untyped wondrous consumables separately", () => {
    assert.equal(itemType("consumable", "", ""), "alchemical");
    assert.equal(itemType("consumable", "", "Alchemical Item: Common"), "alchemical");
    assert.equal(itemType("consumable", "", "Consumable: Uncommon"), "otherConsumable");
  });
});

describe("basics parsing", () => {
  it("strips tags and collapses whitespace", () => {
    assert.equal(
      basicsLine('<p class="flavour">x</p><p class="basics"><b>Neck Slot</b><b>:</b>  Uncommon\n</p>'),
      "Neck Slot: Uncommon"
    );
    assert.equal(basicsLine("<p>No basics</p>"), "");
  });

  it("does not read Uncommon as Common", () => {
    assert.equal(rarityFromBasics("Neck Slot: Uncommon"), "uncommon");
    assert.equal(rarityFromBasics("Consumable: Potion - Common"), "common");
    assert.equal(rarityFromBasics("Wondrous Item: Rare"), "rare");
    assert.equal(rarityFromBasics("Consumable: Assassin Poison - n"), null);
  });

  it("rejects levels outside 1–30 and non-positive prices", () => {
    const base = {
      uuid: "u",
      name: "n",
      type: "equipment",
      system: {
        armour: { type: "neck" },
        description: { value: '<p class="basics">Neck Slot: Uncommon</p>' },
      },
    };
    assert.equal(classifyItem({ ...base, system: { ...base.system, level: "31", price: 10 } }), null);
    assert.equal(classifyItem({ ...base, system: { ...base.system, level: "", price: 10 } }), null);
    assert.equal(classifyItem({ ...base, system: { ...base.system, level: "5", price: 0 } }), null);
    assert.ok(classifyItem({ ...base, system: { ...base.system, level: "5", price: 1000 } }));
  });
});
