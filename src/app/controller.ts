import type { BoxOdds } from "../model/distribution.js";
import type { OpenLootboxResult } from "../open/open-box.js";
import type { ChatVisibility } from "../open/visibility.js";
import type { BuildReport } from "../tables/build-tables.js";

export interface BuyerOption {
  id: string;
  name: string;
  level: number;
  gold: number;
}

/** Everything the React tree needs from Foundry, injected by the ApplicationV2 window. */
export interface LootboxController {
  buyers(): BuyerOption[];
  tablesReady(): boolean;
  odds(level: number): BoxOdds | null;
  /** The world's default chat card visibility, preselected in the window. */
  defaultVisibility(): ChatVisibility;
  open(
    level: number,
    buyerId: string | null,
    chargeAndGrant: boolean,
    visibility: ChatVisibility
  ): Promise<OpenLootboxResult>;
  buildTables(): Promise<BuildReport>;
  confirmRebuild(): Promise<boolean>;
}
