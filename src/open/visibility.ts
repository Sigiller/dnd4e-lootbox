/** Who sees a lootbox chat card. */
export const CHAT_VISIBILITIES = ["private", "gm", "public"] as const;
export type ChatVisibility = (typeof CHAT_VISIBILITIES)[number];

/** Cards are whispered to the GMs and the buyer's players unless the world setting says otherwise. */
export const DEFAULT_CHAT_VISIBILITY: ChatVisibility = "private";

export function isChatVisibility(value: unknown): value is ChatVisibility {
  return typeof value === "string" && (CHAT_VISIBILITIES as readonly string[]).includes(value);
}

export function normalizeChatVisibility(value: unknown): ChatVisibility {
  return isChatVisibility(value) ? value : DEFAULT_CHAT_VISIBILITY;
}

export interface WhisperAudience {
  /** The user posting the card. */
  authorId: string;
  gmIds: readonly string[];
  /** Players owning the buyer (empty without a buyer). */
  buyerOwnerIds: readonly string[];
}

/**
 * Whisper recipients of a card. An empty list means a public message.
 * - `private`: the GMs and the players who own the buyer.
 * - `gm`: the GMs only.
 * - `public`: everyone.
 * The author is always included in a whisper, so the list is never empty unless the card is public.
 */
export function whisperRecipients(visibility: ChatVisibility, audience: WhisperAudience): string[] {
  if (visibility === "public") return [];
  const ids = [audience.authorId, ...audience.gmIds];
  if (visibility === "private") ids.push(...audience.buyerOwnerIds);
  return [...new Set(ids.filter((id) => id !== ""))];
}
