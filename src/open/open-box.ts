import { MODULE_ID } from "../constants.js";
import { formatMessage, localize } from "../i18n.js";
import { boxOdds, type BoxOdds } from "../model/distribution.js";
import { clampLevel } from "../model/pool-fallback.js";
import { priceFor } from "../model/config.js";
import { payFromPurse } from "../purse.js";
import { createTableDrawer, findLootboxTables, modelFromTables, poolPricesFromTables } from "../tables/registry.js";
import { getChatVisibility, getLootboxConfig } from "../settings.js";
import { readActorPurse } from "../types/dnd4e.js";
import { postLootboxCard } from "./chat-card.js";
import { grantItems } from "./grant.js";
import { resolveBox, summarizeBox, type BoxSlot, type BoxSummary } from "./resolve.js";
import { whisperRecipients, type ChatVisibility } from "./visibility.js";

export interface OpenLootboxOptions {
  level: number;
  buyer?: Actor.Implementation | null;
  /** Deduct the price from the buyer and add the items to their inventory. */
  chargeAndGrant?: boolean;
  /** Post the chat card (default true). */
  postToChat?: boolean;
  /** Who sees the card; defaults to the world's "Chat card visibility" setting (private). */
  visibility?: ChatVisibility;
}

export interface OpenLootboxResult {
  level: number;
  slots: BoxSlot[];
  summary: BoxSummary;
  charged: boolean;
  granted: number;
}

function requireTables() {
  const tables = findLootboxTables();
  if (!tables) throw new Error(localize(`${MODULE_ID}.errors.noTables`));
  return tables;
}

/** Odds of a box level as the world's tables currently roll it. */
export function currentOdds(level: number): BoxOdds | null {
  const tables = findLootboxTables();
  if (!tables) return null;
  const config = getLootboxConfig();
  const boxLevel = clampLevel(level);
  return boxOdds(
    modelFromTables(tables),
    poolPricesFromTables(tables),
    boxLevel,
    priceFor(config, boxLevel),
    config.sellRatio
  );
}

/** User ids that see the card: see `whisperRecipients`. Buyer owners are the players with Owner permission. */
function cardRecipients(visibility: ChatVisibility, buyer: Actor.Implementation | null): string[] {
  const users = game.users?.contents ?? [];
  return whisperRecipients(visibility, {
    authorId: game.user?.id ?? "",
    gmIds: users.filter((u) => u.isGM).map((u) => u.id),
    buyerOwnerIds: buyer
      ? users.filter((u) => !u.isGM && buyer.testUserPermission(u, "OWNER")).map((u) => u.id)
      : [],
  });
}

/** Open one lootbox: roll the tables, optionally charge the buyer and grant the items, post the card. */
export async function openLootbox(options: OpenLootboxOptions): Promise<OpenLootboxResult> {
  if (!game.user?.isGM) throw new Error(localize(`${MODULE_ID}.errors.gmOnly`));
  const tables = requireTables();
  const config = getLootboxConfig();
  const level = clampLevel(options.level);
  const price = priceFor(config, level);
  const buyer = options.buyer ?? null;
  const charge = Boolean(options.chargeAndGrant && buyer);

  const newPurse = buyer && charge ? payFromPurse(readActorPurse(buyer), price) : null;
  if (buyer && charge && !newPurse) {
    throw new Error(formatMessage(`${MODULE_ID}.errors.notEnoughMoney`, { name: buyer.name }));
  }

  const slots = await resolveBox(level, createTableDrawer(tables));
  const summary = summarizeBox(price, slots, config.sellRatio);

  let grantedIds: (string | null)[] | null = null;
  if (buyer && charge && newPurse) {
    await buyer.update({ system: { currency: newPurse } } as unknown as Actor.UpdateData);
    grantedIds = await grantItems(buyer, summary.items);
  }
  const granted = new Set(grantedIds?.filter((id) => id !== null)).size;

  if (options.postToChat !== false) {
    const whisper = cardRecipients(options.visibility ?? getChatVisibility(), buyer);
    await postLootboxCard(
      {
        level,
        summary,
        buyerName: buyer?.name,
        charged: charge,
        sellRatio: config.sellRatio,
        rerolls: summary.items.map(() => 0),
        ...(buyer?.uuid && grantedIds ? { grant: { actorUuid: buyer.uuid, itemIds: grantedIds } } : {}),
      },
      whisper
    );
  }
  return { level, slots, summary, charged: charge, granted };
}

export interface SimulationReport {
  level: number;
  price: number;
  boxes: number;
  lossRate: number;
  sellProfitRate: number;
  valueRatio: number;
  averageItems: number;
  predicted: BoxOdds;
}

/** Roll `boxes` boxes through the real tables without chat, charges or items, and compare with the odds. */
export async function simulateLootboxes(level: number, boxes: number): Promise<SimulationReport> {
  const tables = requireTables();
  const config = getLootboxConfig();
  const boxLevel = clampLevel(level);
  const price = priceFor(config, boxLevel);
  const drawer = createTableDrawer(tables);
  let losses = 0;
  let sellProfits = 0;
  let market = 0;
  let items = 0;
  for (let i = 0; i < boxes; i++) {
    const summary = summarizeBox(price, await resolveBox(boxLevel, drawer), config.sellRatio);
    if (summary.verdict === "loss") losses++;
    if (summary.verdict === "sellProfit") sellProfits++;
    market += summary.marketValue;
    items += summary.items.length;
  }
  return {
    level: boxLevel,
    price,
    boxes,
    lossRate: losses / boxes,
    sellProfitRate: sellProfits / boxes,
    valueRatio: market / boxes / price,
    averageItems: items / boxes,
    predicted: boxOdds(modelFromTables(tables), poolPricesFromTables(tables), boxLevel, price, config.sellRatio),
  };
}
