import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clampLevel, nearestPoolLevel } from "../src/model/pool-fallback.js";

describe("nearestPoolLevel", () => {
  it("prefers the level itself", () => {
    assert.equal(nearestPoolLevel(7, () => true), 7);
  });

  it("tries one level down before one level up", () => {
    assert.equal(nearestPoolLevel(7, (l) => l === 6 || l === 8), 6);
    assert.equal(nearestPoolLevel(7, (l) => l === 8), 8);
  });

  it("walks up from level 1 when the low levels are empty", () => {
    assert.equal(nearestPoolLevel(1, (l) => l >= 5), 5);
  });

  it("clamps the start level and returns null when nothing exists", () => {
    assert.equal(nearestPoolLevel(35, (l) => l === 29), 29);
    assert.equal(nearestPoolLevel(5, () => false), null);
    assert.equal(clampLevel(0), 1);
    assert.equal(clampLevel(31), 30);
  });
});
