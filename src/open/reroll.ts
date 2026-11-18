import { MODULE_ID } from "../constants.js";
import { formatMessage, localize } from "../i18n.js";
import { nearestPoolLevel } from "../model/pool-fallback.js";
import { poolCellKey } from "../model/types.js";
import { createTableDrawer, drawPoolItemExcept, findLootboxTables, type LootboxTables } from "../tables/registry.js";
import { lootboxCardHtml, readCardFlag, type LootboxCardFlag } from "./chat-card.js";
import { grantItems, takeBackItem } from "./grant.js";
import { replaceItem, resolveSlot, type DrawnItem } from "./resolve.js";

/**
 * - `item`: another item of the same kind, rarity and level (the box's value barely moves).
 * - `slot`: the whole slot again, as when the box was opened: kind (items after the first),
 *   rarity, level offset and item.
 */
export type RerollMode = "item" | "slot";

export function isRerollMode(value: unknown): value is RerollMode {
  return value === "item" || value === "slot";
}

/** A slot reroll that lands on the same item is rolled again, up to this many times. */
const MAX_SLOT_DRAWS = 20;

/** Messages with a reroll in progress (a second click waits for the first). */
const busy = new Set<string>();

/** Reroll counts after one more reroll of item `index`. */
export function bumpRerolls(rerolls: readonly number[] | undefined, itemCount: number, index: number): number[] {
  return Array.from({ length: itemCount }, (_, i) => (rerolls?.[i] ?? 0) + (i === index ? 1 : 0));
}

function randomUniform(): number {
  const dice = CONFIG.Dice as { randomUniform?: () => number };
  return typeof dice.randomUniform === "function" ? dice.randomUniform() : Math.random();
}

/** Give the new item to the buyer and take one copy of the old one back. Returns the updated grant. */
async function swapGrantedItem(
  grant: NonNullable<LootboxCardFlag["grant"]>,
  index: number,
  current: DrawnItem,
  next: DrawnItem
): Promise<NonNullable<LootboxCardFlag["grant"]>> {
  const actor = await fromUuid(grant.actorUuid);
  if (!(actor instanceof Actor)) throw new Error(localize(`${MODULE_ID}.errors.buyerGone`));
  const buyer = actor as Actor.Implementation;
  const oldId = grant.itemIds[index] ?? null;
  // Check that the old item is still there before adding the new one.
  const owned =
    (oldId ? buyer.items.get(oldId) : undefined) ??
    buyer.items.find((candidate) => candidate._stats.compendiumSource === current.uuid);
  if (!owned) {
    throw new Error(formatMessage(`${MODULE_ID}.errors.itemGone`, { item: current.name, name: buyer.name }));
  }
  const [newId] = await grantItems(buyer, [next]);
  await takeBackItem(buyer, owned.id, current);
  const itemIds = grant.itemIds.map((id, i) => (i === index ? (newId ?? null) : id));
  // Slots that shared a stack that is now gone point nowhere.
  const stillThere = (id: string | null) => (id && buyer.items.get(id) ? id : null);
  return { ...grant, itemIds: itemIds.map((id, i) => (i === index ? id : stillThere(id))) };
}

function noOtherItemError(current: DrawnItem): Error {
  return new Error(
    formatMessage(`${MODULE_ID}.errors.noOtherItem`, {
      item: current.name,
      rarity: localize(`${MODULE_ID}.rarity.${current.rarity}`).toLowerCase(),
      kind: localize(`${MODULE_ID}.kind.${current.kind}`).toLowerCase(),
      level: current.level,
    })
  );
}

/** The replacement for item `index`: see `RerollMode`. Never the current item. */
async function drawReplacement(
  tables: LootboxTables,
  boxLevel: number,
  index: number,
  current: DrawnItem,
  mode: RerollMode
): Promise<DrawnItem> {
  if (mode === "slot") {
    const drawer = createTableDrawer(tables);
    for (let attempt = 0; attempt < MAX_SLOT_DRAWS; attempt++) {
      const { item } = await resolveSlot(boxLevel, index, drawer);
      if (item && item.uuid !== current.uuid) return item;
    }
    throw new Error(formatMessage(`${MODULE_ID}.errors.slotKeptItem`, { item: current.name }));
  }
  const poolLevel = nearestPoolLevel(
    current.level,
    (level) => (tables.pools.get(poolCellKey(current.kind, current.rarity, level))?.results.size ?? 0) > 0
  );
  const next =
    poolLevel === null
      ? null
      : drawPoolItemExcept(tables, current.kind, current.rarity, poolLevel, current.uuid, randomUniform);
  if (!next) throw noOtherItemError(current);
  return next;
}

/**
 * Replace item `index` of a lootbox card (see `RerollMode`). The box price stays; totals and
 * verdict are recomputed. When the box was charged, the buyer's inventory swaps the item too.
 */
export async function rerollLootboxItem(
  message: ChatMessage.Implementation,
  index: number,
  mode: RerollMode = "item"
): Promise<DrawnItem> {
  if (!game.user?.isGM) throw new Error(localize(`${MODULE_ID}.errors.gmOnly`));
  const flag = readCardFlag(message);
  if (!flag) throw new Error(localize(`${MODULE_ID}.errors.notRerollable`));
  const current = flag.summary.items[index];
  if (!current) throw new Error(localize(`${MODULE_ID}.errors.notRerollable`));
  const tables = findLootboxTables();
  if (!tables) throw new Error(localize(`${MODULE_ID}.errors.noTables`));

  const next = await drawReplacement(tables, flag.level, index, current, mode);
  const grant = flag.grant ? await swapGrantedItem(flag.grant, index, current, next) : undefined;
  const summary = replaceItem(flag.summary, index, next, flag.sellRatio);
  const updated: LootboxCardFlag = {
    ...flag,
    summary,
    rerolls: bumpRerolls(flag.rerolls, summary.items.length, index),
    ...(grant ? { grant } : {}),
  };
  await message.update({
    content: lootboxCardHtml(updated),
    flags: { "dnd4e-lootbox": { box: updated } },
  } as unknown as ChatMessage.UpdateData);
  return next;
}

/** Reroll by message id (API and macros). */
export async function rerollLootboxItemById(
  messageId: string,
  index: number,
  mode: RerollMode = "item"
): Promise<DrawnItem> {
  const message = game.messages?.get(messageId);
  if (!message) throw new Error(localize(`${MODULE_ID}.errors.notRerollable`));
  if (!isRerollMode(mode)) throw new Error(`Unknown reroll mode ${String(mode)}`);
  return rerollLootboxItem(message, index, mode);
}

function messageIdOf(element: Element): string | null {
  const host =
    element.closest("[data-message-id]") ??
    element.closest(".chat-message[data-document-id]") ??
    element.closest(".message[data-document-id]");
  return host?.getAttribute("data-message-id") ?? host?.getAttribute("data-document-id") ?? null;
}

function onDocumentClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest("[data-lootbox-reroll]");
  if (!(button instanceof HTMLElement)) return;
  event.preventDefault();
  event.stopPropagation();
  if (!game.user?.isGM) return;
  const messageId = messageIdOf(button);
  const message = messageId ? game.messages?.get(messageId) : undefined;
  const index = Number(button.dataset.lootboxReroll);
  const mode: RerollMode = button.dataset.lootboxMode === "slot" ? "slot" : "item";
  if (!message?.id || !Number.isInteger(index) || busy.has(message.id)) return;
  const id = message.id;
  busy.add(id);
  button.classList.add("lb-busy");
  rerollLootboxItem(message, index, mode)
    .catch((error: unknown) => {
      ui.notifications?.error(error instanceof Error ? error.message : String(error));
      button.classList.remove("lb-busy");
    })
    .finally(() => busy.delete(id));
}

let clickBound = false;

/** Reroll buttons: GMs click them anywhere a card shows (log, popout, notification); others never see them. */
export function registerRerollHooks(): void {
  if (!clickBound) {
    document.addEventListener("click", onDocumentClick, true);
    clickBound = true;
  }
  Hooks.on("renderChatMessageHTML", (message, html) => {
    if (!html.querySelector("[data-lootbox-reroll]")) return;
    if (!game.user?.isGM || !readCardFlag(message)) {
      html.querySelectorAll(".lb-actions, [data-lootbox-reroll]").forEach((element) => element.remove());
    }
  });
}
