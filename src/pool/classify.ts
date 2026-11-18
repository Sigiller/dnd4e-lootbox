import { MAX_LEVEL, MIN_LEVEL } from "../constants.js";
import { DEFAULT_MAX_CONSUMABLE_PRICE_FACTOR } from "../model/defaults.js";
import { CONSUMABLE_PRICE_BY_LEVEL } from "../model/standard-prices.js";
import type { ItemKind, ItemType, PermanentType, Rarity } from "../model/types.js";

/** The fields of a compendium index entry (or document) that classification reads. */
export interface CompendiumItemLike {
  uuid: string;
  name: string;
  img?: string | null;
  type: string;
  system?: {
    level?: unknown;
    price?: unknown;
    armour?: { type?: unknown } | null;
    consumableType?: unknown;
    description?: { value?: unknown } | null;
  } | null;
}

export interface PoolEntry {
  uuid: string;
  name: string;
  img: string | null;
  kind: ItemKind;
  /** Slot of a permanent item or type of a consumable; pool tables weight items by it. */
  type: ItemType;
  rarity: Rarity;
  level: number;
  price: number;
}

/** Index fields needed by `classifyItem` (pass to `pack.getIndex({ fields })`). */
export const CLASSIFY_INDEX_FIELDS = [
  "system.level",
  "system.price",
  "system.armour.type",
  "system.consumableType",
  "system.description.value",
] as const;

/** Equipment slots that hold magic items other than armor, with the item type each one gives. */
const PERMANENT_SLOTS: ReadonlyMap<string, PermanentType> = new Map([
  ["head", "head"],
  ["neck", "neck"],
  ["arms", "arms"],
  ["hands", "hands"],
  ["waist", "waist"],
  ["feet", "feet"],
  ["ring", "ring"],
  ["other", "wondrous"],
]);

/** Consumable subtypes named after "Consumable:" in the basics line, e.g. "Consumable: Potion - Uncommon". */
const CONSUMABLE_SUBTYPES: readonly [RegExp, ItemType][] = [
  [/^Potion/i, "potion"],
  [/^Elixir/i, "elixir"],
  [/^Reagent/i, "reagent"],
  [/^Whetstone/i, "whetstone"],
  [/^Soulfang/i, "soulfang"],
];

/** Basics categories that are never lootbox items. */
const EXCLUDED_CATEGORY =
  /^(Alternative Reward|Mount|Companion|Familiar|Artifact|Ammunition|Category:\s*Ammunition)/i;

/** Psionic items whose powers have "Augment 1:" / "Augment 2:" options. */
const PSIONIC_AUGMENT = /\bAugment\s+\d+\s*:/;

const RARITY_WORDS: readonly [Rarity, RegExp][] = [
  ["common", /\bCommon\b/],
  ["uncommon", /\bUncommon\b/],
  ["rare", /\bRare\b/],
];

function stringOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Text of the description's `<p class="basics">` line, e.g. "Neck Slot: Uncommon". */
export function basicsLine(descriptionHtml: string): string {
  const match = /<p class="basics">([\s\S]*?)<\/p>/.exec(descriptionHtml);
  if (!match?.[1]) return "";
  return match[1]
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function rarityFromBasics(basics: string): Rarity | null {
  for (const [rarity, pattern] of RARITY_WORDS) {
    if (pattern.test(basics)) return rarity;
  }
  return null;
}

function parseLevel(value: unknown): number | null {
  const text = typeof value === "number" ? String(value) : stringOf(value).trim();
  if (!/^\d+$/.test(text)) return null;
  const level = Number(text);
  return level >= MIN_LEVEL && level <= MAX_LEVEL ? level : null;
}

function parsePrice(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function itemKind(item: CompendiumItemLike, basics: string): ItemKind | null {
  const system = item.system ?? {};
  if (item.type === "equipment") {
    const slot = stringOf(system.armour?.type);
    if (!PERMANENT_SLOTS.has(slot)) return null;
    if (slot === "arms" && basics.includes("Shield")) return null;
    return "permanent";
  }
  if (item.type === "consumable") {
    if (stringOf(system.consumableType) === "ammo") return null;
    return "consumable";
  }
  return null;
}

/**
 * Decide whether a compendium item can appear in a lootbox and with which kind,
 * rarity, level and price. Returns null for anything excluded: weapons, implements,
 * armor, shields, ammunition, boons and other alternative rewards, mounts,
 * companions, familiars, artifacts, psionic Augment items and untagged items.
 */
export interface ClassifyOptions {
  /** Drop consumables priced above this multiple of the standard price for their level (Greenbane L9+). */
  maxConsumablePriceFactor?: number;
}

/**
 * Type of a pool item: the equipment slot of a permanent item ("other" = wondrous); for a
 * consumable, alchemical when the basics line is missing or says "Alchemical Item", otherwise the
 * subtype after "Consumable:" (wondrous consumables without one count as other).
 */
export function itemType(kind: ItemKind, slot: string, basics: string): ItemType {
  if (kind === "permanent") return PERMANENT_SLOTS.get(slot) ?? "wondrous";
  if (basics === "" || /^Alchemical Item/i.test(basics)) return "alchemical";
  const subtype = (basics.split(":")[1] ?? "").split(/\s[-–]\s/)[0]?.trim() ?? "";
  return CONSUMABLE_SUBTYPES.find(([pattern]) => pattern.test(subtype))?.[1] ?? "otherConsumable";
}

export function classifyItem(item: CompendiumItemLike, options: ClassifyOptions = {}): PoolEntry | null {
  const maxFactor = options.maxConsumablePriceFactor ?? DEFAULT_MAX_CONSUMABLE_PRICE_FACTOR;
  const description = stringOf(item.system?.description?.value);
  const basics = basicsLine(description);

  const kind = itemKind(item, basics);
  if (!kind) return null;
  if (EXCLUDED_CATEGORY.test(basics)) return null;

  let rarity = rarityFromBasics(basics);
  if (!rarity && kind === "consumable" && !basics && stringOf(item.system?.consumableType) === "alchemical") {
    // Older alchemical items carry no basics line; 4e alchemical items are common.
    rarity = "common";
  }
  if (!rarity) return null;
  if (PSIONIC_AUGMENT.test(description)) return null;

  const level = parseLevel(item.system?.level);
  if (level === null) return null;
  const price = parsePrice(item.system?.price);
  if (price === null) return null;

  if (kind === "consumable") {
    const standard = CONSUMABLE_PRICE_BY_LEVEL[level] ?? 0;
    if (standard > 0 && price > standard * maxFactor) return null;
  }

  const type = itemType(kind, stringOf(item.system?.armour?.type), basics);
  return { uuid: item.uuid, name: item.name, img: item.img ?? null, kind, type, rarity, level, price };
}
