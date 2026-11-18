import type { LootboxConfig } from "./model/config.js";
import type { BoxOdds } from "./model/distribution.js";
import type { LootboxCardFlag } from "./open/chat-card.js";
import type { OpenLootboxOptions, OpenLootboxResult, SimulationReport } from "./open/open-box.js";
import type { ChatVisibility } from "./open/visibility.js";
import type { DrawnItem } from "./open/resolve.js";
import type { RerollMode } from "./open/reroll.js";
import type { BuildReport } from "./tables/build-tables.js";
import type { LootboxFolderFlag, LootboxResultFlag, LootboxTableFlag } from "./tables/flags.js";

export interface LootboxApi {
  /** Open the GM lootbox window, optionally preselecting a box level. */
  openLootboxDialog: (options?: { level?: number }) => Promise<void>;
  /** Open one box without the window. */
  openLootbox: (options: OpenLootboxOptions) => Promise<OpenLootboxResult>;
  /** (Re)build the lootbox roll tables from the compendium. */
  buildTables: () => Promise<BuildReport>;
  /** Roll many boxes through the tables without side effects and compare with the predicted odds. */
  simulate: (level: number, boxes: number) => Promise<SimulationReport>;
  /** Odds of a box level as the current tables roll it. */
  odds: (level: number) => BoxOdds | null;
  /** Box price in gp for a level under the current settings. */
  price: (level: number) => number;
  /** Every number the module uses, as currently configured. */
  config: () => LootboxConfig;
  /**
   * Replace item `index` (0-based) of a lootbox chat card. Mode `item` (default): another item of
   * the same kind, rarity and level. Mode `slot`: kind (items after the first), rarity, level and item again.
   */
  rerollItem: (messageId: string, index: number, mode?: RerollMode) => Promise<DrawnItem>;
}

declare module "fvtt-types/configuration" {
  export interface ModuleConfig {
    "dnd4e-lootbox": {
      api?: LootboxApi;
    };
  }

  export interface SettingConfig {
    "dnd4e-lootbox.config": LootboxConfig;
    "dnd4e-lootbox.chatVisibility": ChatVisibility;
    "dnd4e-party-sheet.partyFolderName": string;
  }

  export interface FlagConfig {
    ChatMessage: {
      "dnd4e-lootbox": {
        box?: LootboxCardFlag;
      };
    };
    Folder: {
      "dnd4e-lootbox": {
        folder?: LootboxFolderFlag;
      };
    };
    RollTable: {
      "dnd4e-lootbox": {
        table?: LootboxTableFlag;
      };
    };
    TableResult: {
      "dnd4e-lootbox": {
        result?: LootboxResultFlag;
      };
    };
  }
}

export {};
