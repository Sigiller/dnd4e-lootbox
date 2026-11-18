import { MODULE_ID } from "../constants.js";
import { formatMessage, localize } from "../i18n.js";
import { lootboxTheme as t } from "../styles/theme.js";
import { escapeHtml, formatGp, formatRatio, RARITY_KEYS, VERDICT_KEYS } from "./format.js";
import type { SellRatios } from "../model/types.js";
import { sellValue, type BoxSummary, type DrawnItem } from "./resolve.js";

const CHAT_STYLE_ID = "dnd4e-lootbox-chat-styles";
const K = MODULE_ID;

export interface LootboxCardData {
  level: number;
  summary: BoxSummary;
  buyerName?: string;
  charged: boolean;
  sellRatio: SellRatios;
  /** Times each item was rerolled, by item index. */
  rerolls?: readonly number[];
}

/** `flags.dnd4e-lootbox.box`: everything needed to redraw the card and to swap granted items. */
export interface LootboxCardFlag extends LootboxCardData {
  /** The buyer and the inventory item each box item went to, when the items were granted. */
  grant?: { actorUuid: string; itemIds: (string | null)[] };
}

/** Inject chat card CSS once (the chat log is outside any React tree). */
export function injectChatStyles(): void {
  if (document.getElementById(CHAT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = CHAT_STYLE_ID;
  style.textContent = `
    .dnd4e-lootbox-chat {
      background: ${t.backgroundPanel};
      border: 1px solid ${t.borderMuted};
      border-radius: ${t.radiusPanel};
      color: ${t.colourTextOnLight};
      padding: 6px 0 4px;
      overflow: hidden;
    }
    .dnd4e-lootbox-chat .lb-head { padding: 0 10px 6px; border-bottom: 1px solid ${t.borderMuted}; }
    .dnd4e-lootbox-chat .lb-title { margin: 0; color: ${t.colourHeading}; font-size: 0.95rem; }
    .dnd4e-lootbox-chat .lb-sub { font-size: 0.75rem; color: ${t.colourTextInside}; }
    .dnd4e-lootbox-chat .lb-items { list-style: none; margin: 0; padding: 0; }
    .dnd4e-lootbox-chat .lb-item {
      display: grid; grid-template-columns: 28px 1fr auto auto; gap: 6px; align-items: center;
      padding: 4px 10px; font-size: 0.8rem;
    }
    .dnd4e-lootbox-chat .lb-item:nth-child(odd) { background: ${t.backgroundRowEven}; }
    .dnd4e-lootbox-chat .lb-icon {
      display: block; width: 28px; height: 28px; border-radius: ${t.radiusControl};
      background: ${t.colourTextInside}; overflow: hidden;
    }
    .dnd4e-lootbox-chat .lb-icon img { display: block; width: 28px; height: 28px; border: none; }
    .dnd4e-lootbox-chat .lb-meta { display: block; font-size: 0.7rem; color: ${t.colourTextInside}; }
    .dnd4e-lootbox-chat .lb-rarity-common { color: ${t.colourCommon}; }
    .dnd4e-lootbox-chat .lb-rarity-uncommon { color: ${t.colourUncommon}; }
    .dnd4e-lootbox-chat .lb-rarity-rare { color: ${t.colourRare}; font-weight: bold; }
    .dnd4e-lootbox-chat .lb-price { text-align: right; white-space: nowrap; }
    .dnd4e-lootbox-chat .lb-actions { display: flex; flex-direction: column; gap: 2px; }
    .dnd4e-lootbox-chat .lb-reroll {
      display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px;
      border-radius: ${t.radiusControl}; color: ${t.colourTextInside}; cursor: pointer;
    }
    .dnd4e-lootbox-chat .lb-reroll:hover { color: ${t.colourHeading}; background: ${t.backgroundRowEven}; }
    .dnd4e-lootbox-chat .lb-reroll.lb-busy { opacity: 0.4; pointer-events: none; }
    .dnd4e-lootbox-chat .lb-rerolled { font-style: italic; }
    .dnd4e-lootbox-chat .lb-totals { padding: 6px 10px 2px; font-size: 0.8rem; border-top: 1px solid ${t.borderMuted}; }
    .dnd4e-lootbox-chat .lb-totals div { display: flex; justify-content: space-between; }
    .dnd4e-lootbox-chat .lb-verdict {
      margin: 6px 10px 2px; padding: 3px 6px; border-radius: ${t.radiusControl};
      text-align: center; font-weight: bold; font-size: 0.8rem; color: ${t.colourTextOnDark};
    }
    .dnd4e-lootbox-chat .lb-verdict-loss { background: ${t.colourLoss}; }
    .dnd4e-lootbox-chat .lb-verdict-marketProfit { background: ${t.colourMarket}; }
    .dnd4e-lootbox-chat .lb-verdict-sellProfit { background: ${t.colourSell}; }
  `;
  document.head.append(style);
}

function itemRow(item: DrawnItem, index: number, sellRatio: SellRatios, rerolls: number): string {
  const label = item.name.replace(/[{}[\]]/g, "");
  const img = `<span class="lb-icon">${item.img ? `<img src="${escapeHtml(item.img)}" alt="">` : ""}</span>`;
  const rarity = localize(`${K}.${RARITY_KEYS[item.rarity]}`);
  const kind = localize(`${K}.kind.${item.kind}`);
  const rerolled =
    rerolls > 0
      ? ` · <span class="lb-rerolled">${escapeHtml(
          rerolls === 1 ? localize(`${K}.chat.rerolled`) : formatMessage(`${K}.chat.rerolledTimes`, { count: rerolls })
        )}</span>`
      : "";
  const button = (mode: "item" | "slot", labelKey: string, icon: string) => {
    const label = escapeHtml(localize(`${K}.chat.${labelKey}`));
    return `<a class="lb-reroll" role="button" data-lootbox-reroll="${String(index)}" data-lootbox-mode="${mode}" data-tooltip="${label}" aria-label="${label}"><i class="fa-solid ${icon}"></i></a>`;
  };
  // Removed for non-GMs when the message renders (see reroll.ts).
  const reroll = `<span class="lb-actions">${button("item", "reroll", "fa-dice")}${button(
    "slot",
    index === 0 ? "rerollFirstSlot" : "rerollSlot",
    "fa-dice-d20"
  )}</span>`;
  return `<li class="lb-item">
    ${img}
    <span>@UUID[${item.uuid}]{${label}}
      <span class="lb-meta"><span class="lb-rarity-${item.rarity}">${escapeHtml(rarity)}</span> · ${escapeHtml(kind)} · ${escapeHtml(formatMessage(`${K}.chat.level`, { level: item.level }))}${rerolled}</span>
    </span>
    <span class="lb-price">${formatGp(item.price)}<span class="lb-meta">${escapeHtml(formatMessage(`${K}.chat.sellsFor`, { gp: formatGp(sellValue(item, sellRatio)) }))}</span></span>
    ${reroll}
  </li>`;
}

export function lootboxCardHtml({ level, summary, buyerName, charged, sellRatio, rerolls }: LootboxCardData): string {
  const sub = buyerName
    ? formatMessage(charged ? `${K}.chat.boughtBy` : `${K}.chat.openedFor`, { name: escapeHtml(buyerName) })
    : "";
  const ratio = summary.price > 0 ? summary.marketValue / summary.price : 0;
  return `<div class="dnd4e-lootbox-chat">
    <header class="lb-head">
      <h3 class="lb-title">${escapeHtml(formatMessage(`${K}.chat.title`, { level, price: formatGp(summary.price) }))}</h3>
      ${sub ? `<div class="lb-sub">${sub}</div>` : ""}
    </header>
    <ul class="lb-items">${summary.items.map((item, index) => itemRow(item, index, sellRatio, rerolls?.[index] ?? 0)).join("")}</ul>
    <div class="lb-totals">
      <div><span>${escapeHtml(localize(`${K}.chat.marketValue`))}</span><span>${formatGp(summary.marketValue)} (${formatRatio(ratio)})</span></div>
      <div><span>${escapeHtml(localize(`${K}.chat.sellValue`))}</span><span>${formatGp(summary.sellValue)}</span></div>
    </div>
    <div class="lb-verdict lb-verdict-${summary.verdict}">${escapeHtml(localize(`${K}.${VERDICT_KEYS[summary.verdict]}`))}</div>
  </div>`;
}

/**
 * Post the card. `whisper` lists the recipients' user ids; an empty list posts it publicly.
 * A GM can still reveal a whispered card from its chat context menu.
 */
export async function postLootboxCard(data: LootboxCardFlag, whisper: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    content: lootboxCardHtml(data),
    speaker: ChatMessage.implementation.getSpeaker(),
    whisper,
    flags: { "dnd4e-lootbox": { box: data } },
  });
}

/** The card data of a lootbox message, or null for other messages and for cards from before rerolls. */
export function readCardFlag(message: { flags: unknown }): LootboxCardFlag | null {
  const flags = message.flags as Record<string, unknown> | undefined;
  const box = (flags?.[MODULE_ID] as Record<string, unknown> | undefined)?.box as Partial<LootboxCardFlag> | undefined;
  if (!box || typeof box.level !== "number" || typeof box.charged !== "boolean") return null;
  if (!box.summary || !Array.isArray(box.summary.items) || !box.sellRatio) return null;
  return box as LootboxCardFlag;
}
