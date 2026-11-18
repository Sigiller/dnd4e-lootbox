import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_CHAT_VISIBILITY,
  normalizeChatVisibility,
  whisperRecipients,
} from "../src/open/visibility.js";

const audience = { authorId: "gm1", gmIds: ["gm1", "gm2"], buyerOwnerIds: ["p1", "p2"] };

describe("whisperRecipients", () => {
  it("whispers a private card to the GMs and the buyer's players", () => {
    assert.deepEqual(whisperRecipients("private", audience), ["gm1", "gm2", "p1", "p2"]);
  });

  it("whispers a private card without a buyer to the GMs only", () => {
    assert.deepEqual(whisperRecipients("private", { ...audience, buyerOwnerIds: [] }), ["gm1", "gm2"]);
  });

  it("leaves the buyer's players out of a GM-only card", () => {
    assert.deepEqual(whisperRecipients("gm", audience), ["gm1", "gm2"]);
  });

  it("posts a public card to everyone", () => {
    assert.deepEqual(whisperRecipients("public", audience), []);
  });

  it("always includes the author and lists nobody twice", () => {
    assert.deepEqual(
      whisperRecipients("private", { authorId: "a", gmIds: ["gm1"], buyerOwnerIds: ["gm1", "a"] }),
      ["a", "gm1"]
    );
  });
});

describe("normalizeChatVisibility", () => {
  it("defaults to private", () => {
    assert.equal(DEFAULT_CHAT_VISIBILITY, "private");
    assert.equal(normalizeChatVisibility(undefined), "private");
    assert.equal(normalizeChatVisibility("blind"), "private");
  });

  it("keeps a valid value", () => {
    assert.equal(normalizeChatVisibility("public"), "public");
    assert.equal(normalizeChatVisibility("gm"), "gm");
  });
});
