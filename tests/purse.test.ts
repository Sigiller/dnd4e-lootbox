import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizePurse, payFromPurse, purseCopper, purseGoldValue } from "../src/purse.js";

const purse = (p: Partial<Record<"ad" | "pp" | "gp" | "sp" | "cp", number>>) => normalizePurse(p);

describe("payFromPurse", () => {
  it("pays from gold when there is enough", () => {
    assert.deepEqual(payFromPurse(purse({ gp: 500, sp: 3 }), 370), purse({ gp: 130, sp: 3 }));
  });

  it("breaks platinum and returns change in gold", () => {
    assert.deepEqual(payFromPurse(purse({ pp: 3, gp: 20 }), 150), purse({ pp: 1, gp: 70 }));
  });

  it("breaks an astral diamond and returns platinum and gold", () => {
    assert.deepEqual(payFromPurse(purse({ ad: 1 }), 2_200), purse({ pp: 78 }));
    assert.deepEqual(payFromPurse(purse({ ad: 1, gp: 50 }), 2_250), purse({ pp: 78 }));
  });

  it("uses silver and copper only when the bigger coins run out", () => {
    assert.deepEqual(payFromPurse(purse({ gp: 1, sp: 25, cp: 3 }), 3), purse({ sp: 5, cp: 3 }));
  });

  it("keeps the total value consistent", () => {
    const before = purse({ ad: 2, pp: 15, gp: 333, sp: 7, cp: 9 });
    const after = payFromPurse(before, 12_345);
    assert.ok(after);
    assert.equal(purseCopper(before) - purseCopper(after), 12_345 * 100);
  });

  it("returns null when funds are short", () => {
    assert.equal(payFromPurse(purse({ gp: 369, sp: 9 }), 370), null);
  });

  it("normalizes garbage to zero", () => {
    assert.deepEqual(normalizePurse({ gp: "12", sp: -3, cp: Number.NaN }), purse({ gp: 12 }));
    assert.equal(purseGoldValue(purse({ pp: 1, gp: 2, sp: 5 })), 102.5);
  });
});
