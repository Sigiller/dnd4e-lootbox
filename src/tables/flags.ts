import { MODULE_ID } from "../constants.js";
import type { ItemKind, ItemType, Rarity } from "../model/types.js";

export type TableRole = "count" | "extraKind" | "rarity" | "offset" | "pool";

/** `flags.dnd4e-lootbox.table` on every RollTable this module builds. */
export interface LootboxTableFlag {
  role: TableRole;
  rarity?: Rarity;
  kind?: ItemKind;
  level?: number;
}

/** `flags.dnd4e-lootbox.result` on every TableResult this module builds. */
export interface LootboxResultFlag {
  /** Structural tables: count (number), kind or rarity key (string), level offset (number). */
  value?: number | string;
  /** Pool tables: the item's market price, rarity, kind, type and level at build time. */
  price?: number;
  rarity?: Rarity;
  kind?: ItemKind;
  type?: ItemType;
  level?: number;
}

/** `flags.dnd4e-lootbox.folder` on the folders this module builds. */
export type LootboxFolderFlag = "root" | "pools" | ItemKind;

interface FlagHolder {
  flags: unknown;
}

function moduleFlags(doc: FlagHolder): Record<string, unknown> | undefined {
  const flags = doc.flags as Record<string, unknown> | undefined;
  const scoped = flags?.[MODULE_ID];
  return scoped && typeof scoped === "object" ? (scoped as Record<string, unknown>) : undefined;
}

/** Single documented cast point for this module's table flags. */
export function readTableFlag(table: FlagHolder): LootboxTableFlag | undefined {
  return moduleFlags(table)?.table as LootboxTableFlag | undefined;
}

export function readResultFlag(result: FlagHolder): LootboxResultFlag | undefined {
  return moduleFlags(result)?.result as LootboxResultFlag | undefined;
}

export function readFolderFlag(folder: FlagHolder): LootboxFolderFlag | undefined {
  return moduleFlags(folder)?.folder as LootboxFolderFlag | undefined;
}
