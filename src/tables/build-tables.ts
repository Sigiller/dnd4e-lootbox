import { CONSUMABLES_PACK_ID, EQUIPMENT_PACK_ID, MODULE_ID, POOLS_FOLDER_NAME, ROOT_FOLDER_NAME } from "../constants.js";
import { formatMessage, localize } from "../i18n.js";
import { isItemType, poolEntryWeights } from "../model/type-weights.js";
import type { ItemKind, ItemType, LootboxModel, TypeWeights } from "../model/types.js";
import { CLASSIFY_INDEX_FIELDS, classifyItem, type CompendiumItemLike, type PoolEntry } from "../pool/classify.js";
import { getLootboxConfig } from "../settings.js";
import { readFolderFlag, readResultFlag, readTableFlag, type LootboxFolderFlag, type LootboxTableFlag } from "./flags.js";
import { allLootboxTables } from "./registry.js";
import {
  kindLabel,
  poolTablesData,
  rangesFormula,
  rangesFromWeights,
  structuralTablesData,
  type RollTableData,
} from "./table-data.js";

export interface BuildReport {
  structuralTables: number;
  poolTables: number;
  items: number;
}

const CREATE_CHUNK = 25;

async function readPool(maxConsumablePriceFactor: number): Promise<PoolEntry[]> {
  const entries: PoolEntry[] = [];
  for (const packId of [EQUIPMENT_PACK_ID, CONSUMABLES_PACK_ID]) {
    const pack = game.packs?.get(packId);
    if (!pack) throw new Error(formatMessage(`${MODULE_ID}.errors.missingPack`, { pack: packId }));
    const index = await pack.getIndex({ fields: [...CLASSIFY_INDEX_FIELDS] });
    for (const raw of index.values()) {
      const entry = classifyItem(raw as unknown as CompendiumItemLike, { maxConsumablePriceFactor });
      if (entry) entries.push(entry);
    }
  }
  return entries;
}

function findFolder(flag: LootboxFolderFlag): Folder.Implementation | undefined {
  return game.folders?.find((folder) => folder.type === "RollTable" && readFolderFlag(folder) === flag);
}

async function ensureFolder(
  flag: LootboxFolderFlag,
  name: string,
  parent: Folder.Implementation | null
): Promise<Folder.Implementation> {
  const existing = findFolder(flag);
  if (existing) return existing;
  const data = {
    name,
    type: "RollTable",
    folder: parent?.id ?? null,
    sorting: "a",
    flags: { "dnd4e-lootbox": { folder: flag } },
  };
  const created = (await Folder.implementation.create(data as unknown as Folder.CreateData)) as
    | Folder.Implementation
    | undefined;
  if (!created) throw new Error(`Could not create folder ${name}`);
  return created;
}

async function createTables(data: readonly RollTableData[], folderId: string | null): Promise<number> {
  let created = 0;
  for (let start = 0; start < data.length; start += CREATE_CHUNK) {
    const chunk = data.slice(start, start + CREATE_CHUNK).map((table) => ({ ...table, folder: folderId }));
    const docs = await RollTable.implementation.createDocuments(chunk as unknown as RollTable.CreateData[]);
    created += docs.length;
  }
  return created;
}

export function lootboxTablesExist(): boolean {
  return allLootboxTables().length > 0;
}

/**
 * (Re)build every lootbox table in the world from the compendium. Deletes only tables
 * this module created; folders are reused.
 */
export async function buildLootboxTables(): Promise<BuildReport> {
  if (!game.user?.isGM) throw new Error(localize(`${MODULE_ID}.errors.gmOnly`));
  const config = getLootboxConfig();
  const entries = await readPool(config.maxConsumablePriceFactor);
  if (entries.length === 0) throw new Error(localize(`${MODULE_ID}.errors.emptyPool`));

  const existing = allLootboxTables()
    .filter((table) => readTableFlag(table) !== undefined)
    .map((table) => table.id)
    .filter((id): id is string => typeof id === "string");
  if (existing.length > 0) await RollTable.implementation.deleteDocuments(existing);

  const root = await ensureFolder("root", ROOT_FOLDER_NAME, null);
  const pools = await ensureFolder("pools", POOLS_FOLDER_NAME, root);
  const kindFolders: Record<ItemKind, Folder.Implementation> = {
    permanent: await ensureFolder("permanent", kindLabel("permanent"), pools),
    consumable: await ensureFolder("consumable", kindLabel("consumable"), pools),
  };

  const structural = await createTables(structuralTablesData(config.model), root.id);
  const poolData = poolTablesData(entries, config.typeWeights);
  let poolTables = 0;
  for (const kind of ["permanent", "consumable"] as const) {
    poolTables += await createTables(
      poolData.filter((table) => table.flags["dnd4e-lootbox"].table.kind === kind),
      kindFolders[kind].id
    );
  }
  const items = poolData.reduce((sum, table) => sum + table.results.length, 0);
  return { structuralTables: structural, poolTables, items };
}

function sameStructuralTable(a: LootboxTableFlag, b: LootboxTableFlag): boolean {
  return a.role === b.role && (a.role !== "offset" || a.rarity === b.rarity);
}

/**
 * Rewrite the six structural tables in place (same documents, new results and formula) so they
 * roll the given model. Missing structural tables are recreated in the Lootbox folder.
 * Returns false when the lootbox tables have not been built yet.
 */
export async function syncStructuralTables(model: LootboxModel): Promise<boolean> {
  if (!game.user?.isGM) throw new Error(localize(`${MODULE_ID}.errors.gmOnly`));
  const existing = allLootboxTables();
  if (existing.length === 0) return false;
  const missing: RollTableData[] = [];
  for (const data of structuralTablesData(model)) {
    const wanted = data.flags["dnd4e-lootbox"].table;
    const table = existing.find((candidate) => {
      const flag = readTableFlag(candidate);
      return flag !== undefined && sameStructuralTable(flag, wanted);
    });
    if (!table) {
      missing.push(data);
      continue;
    }
    const oldIds = [...table.results.values()].map((result) => result.id).filter((id): id is string => !!id);
    if (oldIds.length > 0) await table.deleteEmbeddedDocuments("TableResult", oldIds);
    await table.createEmbeddedDocuments("TableResult", data.results as unknown as TableResult.CreateData[]);
    await table.update({ formula: data.formula } as unknown as RollTable.UpdateData);
  }
  if (missing.length > 0) {
    const root = await ensureFolder("root", ROOT_FOLDER_NAME, null);
    await createTables(missing, root.id);
  }
  return true;
}

export interface PoolSyncReport {
  /** none: no pool tables yet; untyped: built before item types, needs a rebuild; synced: weights rewritten. */
  status: "none" | "untyped" | "synced";
  /** Pool tables whose weights changed. */
  changedTables: number;
  /** Pool tables deleted because every item in them now has type weight 0. */
  removedTables: number;
}

const SYNC_CONCURRENCY = 10;

/**
 * Rewrite the weights, ranges and formula of every pool table in place for new type weights.
 * Items whose type weight is 0 are removed (and a table left empty is deleted); bringing them
 * back takes a rebuild. Items the GM removed by hand stay removed.
 */
export async function syncPoolWeights(typeWeights: TypeWeights): Promise<PoolSyncReport> {
  if (!game.user?.isGM) throw new Error(localize(`${MODULE_ID}.errors.gmOnly`));
  const pools = allLootboxTables().filter((table) => readTableFlag(table)?.role === "pool");
  const report: PoolSyncReport = { status: "none", changedTables: 0, removedTables: 0 };
  if (pools.length === 0) return report;
  const typed = pools.every((table) =>
    [...table.results.values()].every((result) => isItemType(readResultFlag(result)?.type))
  );
  if (!typed) return { ...report, status: "untyped" };

  const syncTable = async (table: RollTable.Implementation): Promise<void> => {
    const kind = readTableFlag(table)?.kind ?? "permanent";
    const current = [...table.results.values()].sort((a, b) => (a.range[0] ?? 0) - (b.range[0] ?? 0));
    const types = current.map((result): ItemType => {
      const type = readResultFlag(result)?.type;
      // Checked for every result above.
      if (!isItemType(type)) throw new Error(`Pool result without item type in ${table.name}`);
      return type;
    });
    const weights = poolEntryWeights(types, typeWeights[kind]);
    const kept = current.flatMap((result, index) => {
      const weight = weights[index] ?? 0;
      return weight > 0 && result.id ? [{ id: result.id, weight, result }] : [];
    });
    if (kept.length === 0) {
      if (table.id) {
        await RollTable.implementation.deleteDocuments([table.id]);
        report.removedTables++;
      }
      return;
    }
    const ranges = rangesFromWeights(kept.map((entry) => entry.weight));
    const formula = rangesFormula(ranges);
    const removed = current.filter((result) => !kept.some((entry) => entry.result === result));
    const unchanged =
      removed.length === 0 &&
      table.formula === formula &&
      kept.every(
        (entry, index) =>
          entry.result.weight === entry.weight &&
          entry.result.range[0] === ranges[index]?.[0] &&
          entry.result.range[1] === ranges[index]?.[1]
      );
    if (unchanged) return;
    const removedIds = removed.map((result) => result.id).filter((id): id is string => !!id);
    if (removedIds.length > 0) await table.deleteEmbeddedDocuments("TableResult", removedIds);
    const updates = kept.map((entry, index) => ({ _id: entry.id, weight: entry.weight, range: ranges[index] }));
    await table.updateEmbeddedDocuments("TableResult", updates as unknown as TableResult.UpdateData[]);
    await table.update({ formula } as unknown as RollTable.UpdateData);
    report.changedTables++;
  };

  for (let start = 0; start < pools.length; start += SYNC_CONCURRENCY) {
    await Promise.all(pools.slice(start, start + SYNC_CONCURRENCY).map(syncTable));
  }
  return { ...report, status: "synced" };
}
