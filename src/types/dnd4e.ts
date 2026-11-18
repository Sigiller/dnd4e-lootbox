import { normalizePurse, type Purse } from "../purse.js";

interface Dnd4eActorSystem {
  details?: { level?: unknown };
  currency?: Partial<Record<string, unknown>>;
}

const PC_TYPE = "Player Character";

/** Single documented cast point for dnd4e actor system data. */
function getDnd4eSystem(actor: Actor.Implementation): Dnd4eActorSystem {
  return actor.system as Dnd4eActorSystem;
}

export function isPlayerCharacter(actor: Actor.Implementation): boolean {
  return String(actor.type) === PC_TYPE;
}

export function readActorLevel(actor: Actor.Implementation): number {
  return Number(getDnd4eSystem(actor).details?.level) || 1;
}

export function readActorPurse(actor: Actor.Implementation): Purse {
  return normalizePurse(getDnd4eSystem(actor).currency);
}

interface Dnd4eItemSystem {
  quantity?: unknown;
}

/** Quantity of an inventory item (1 when the system data has none). */
export function readItemQuantity(item: Item.Implementation): number {
  const quantity = Number((item.system as Dnd4eItemSystem).quantity);
  return Number.isFinite(quantity) && quantity >= 1 ? Math.floor(quantity) : 1;
}
