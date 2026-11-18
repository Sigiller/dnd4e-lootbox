import { MODULE_ID } from "../constants.js";
import { formatMessage } from "../i18n.js";
import { readItemQuantity } from "../types/dnd4e.js";
import type { DrawnItem } from "./resolve.js";

interface ItemSource {
  _id?: string;
  _stats?: { compendiumSource?: string | null };
  system?: { quantity?: number };
}

/**
 * Inventory item id of every box item, in box order: items created together as one stack (same
 * compendium uuid) share an id; an item that could not be created gets null. `created` pairs each
 * new inventory item with its compendium source; its order does not matter (Foundry v14 returns
 * created documents sorted by id, not in request order).
 */
export function grantedIdsBySlot(
  items: readonly Pick<DrawnItem, "uuid">[],
  created: readonly { uuid: string | null | undefined; id: string | null | undefined }[]
): (string | null)[] {
  const idByUuid = new Map<string, string>();
  for (const { uuid, id } of created) {
    if (uuid && id) idByUuid.set(uuid, id);
  }
  return items.map((item) => idByUuid.get(item.uuid) ?? null);
}

/**
 * Add the items to the actor's inventory from the compendium, one stack per distinct item with the
 * quantity it appears in the box. Returns the inventory item id of each box item (see `grantedIdsBySlot`).
 */
export async function grantItems(actor: Actor.Implementation, items: readonly DrawnItem[]): Promise<(string | null)[]> {
  const grouped = new Map<string, number>();
  for (const item of items) grouped.set(item.uuid, (grouped.get(item.uuid) ?? 0) + 1);
  const data: ItemSource[] = [];
  for (const [uuid, quantity] of grouped) {
    const doc = await fromUuid(uuid);
    if (!(doc instanceof foundry.abstract.Document) || doc.documentName !== "Item") continue;
    const source = doc.toObject() as ItemSource;
    delete source._id;
    source._stats = { ...(source._stats ?? {}), compendiumSource: uuid };
    source.system = { ...(source.system ?? {}), quantity };
    data.push(source);
  }
  if (data.length === 0) return items.map(() => null);
  const created = (await actor.createEmbeddedDocuments("Item", data as unknown as Item.CreateData[])) ?? [];
  return grantedIdsBySlot(
    items,
    created.map((doc) => ({ uuid: doc._stats.compendiumSource, id: doc.id }))
  );
}

/**
 * Take one copy of a granted box item back from the actor: lower its stack by one, or delete it.
 * Looks the item up by its recorded id, then by compendium source. Throws when it is gone.
 */
export async function takeBackItem(actor: Actor.Implementation, itemId: string | null, item: DrawnItem): Promise<void> {
  const owned =
    (itemId ? actor.items.get(itemId) : undefined) ??
    actor.items.find((candidate) => candidate._stats.compendiumSource === item.uuid);
  if (!owned) {
    throw new Error(formatMessage(`${MODULE_ID}.errors.itemGone`, { item: item.name, name: actor.name }));
  }
  const quantity = readItemQuantity(owned);
  if (quantity > 1) await owned.update({ system: { quantity: quantity - 1 } } as unknown as Item.UpdateData);
  else await owned.delete();
}
