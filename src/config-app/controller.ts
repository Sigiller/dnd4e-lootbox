import type { LootboxConfig } from "../model/config.js";
import type { ItemType, PoolCells, PoolPrices } from "../model/types.js";
import type { PoolSyncReport } from "../tables/build-tables.js";

/** The built pool tables, as the editor needs them for live odds. */
export interface PoolSource {
  /** Items with prices and types, re-weighted live by the edited type weights; null for tables built before item types. */
  cells: PoolCells | null;
  /** The pools exactly as the tables roll them now. */
  actual: PoolPrices;
}

export interface SaveReport {
  /** Whether the structural roll tables were rewritten (false when the tables are not built yet). */
  tablesSynced: boolean;
  /** What happened to the pool table weights. */
  pools: PoolSyncReport;
  /** Types raised from weight 0, whose items only come back with a rebuild. */
  restore: ItemType[];
}

/** What the settings editor needs from Foundry, injected by its ApplicationV2 window. */
export interface SettingsController {
  current(): LootboxConfig;
  defaults: LootboxConfig;
  /** The built pool tables, or null before the tables exist. */
  pool(): PoolSource | null;
  save(config: LootboxConfig): Promise<SaveReport>;
  close(): void;
}
