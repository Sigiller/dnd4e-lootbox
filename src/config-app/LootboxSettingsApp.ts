import { createRoot, type Root } from "react-dom/client";
import { MODULE_ID } from "../constants.js";
import { DEFAULT_CONFIG, typesToRestore } from "../model/config.js";
import { getLootboxConfig, setLootboxConfig } from "../settings.js";
import { syncPoolWeights, syncStructuralTables } from "../tables/build-tables.js";
import { findLootboxTables, poolCellsFromTables, poolPricesFromTables } from "../tables/registry.js";
import type { SettingsController } from "./controller.js";
import { renderLootboxSettings } from "./mount.js";

const { ApplicationV2 } = foundry.applications.api;

const ROOT_CLASS = "lootbox-settings-root";

/** GM settings window: every weight, ratio, target and box price the module uses. */
export class LootboxSettingsApp extends ApplicationV2 {
  static override DEFAULT_OPTIONS = {
    id: "dnd4e-lootbox-settings",
    classes: ["dnd4e-lootbox", "dnd4e-lootbox-settings", "sheet", "fox4e", "dnd4e"],
    tag: "div",
    window: {
      title: `${MODULE_ID}.config.title`,
      icon: "fa-solid fa-sliders",
      resizable: true,
    },
    position: { width: 760, height: 760 },
  };

  #reactRoot: Root | null = null;

  protected override async _renderHTML(_context: object, _options: unknown): Promise<HTMLElement> {
    const root = document.createElement("div");
    root.className = ROOT_CLASS;
    return root;
  }

  protected override async _replaceHTML(result: HTMLElement, content: HTMLElement, _options: unknown): Promise<void> {
    if (content.querySelector(`:scope > .${ROOT_CLASS}`)) return;
    content.replaceChildren(result);
  }

  protected override async _onRender(context: object, options: unknown): Promise<void> {
    // @ts-expect-error ApplicationV2._onRender accepts DeepPartial render options at runtime.
    await super._onRender(context, options);
    const host = this.element.querySelector(`.${ROOT_CLASS}`);
    if (!(host instanceof HTMLElement)) return;
    if (this.#reactRoot) return;
    this.#reactRoot = createRoot(host);
    const controller: SettingsController = {
      current: getLootboxConfig,
      defaults: DEFAULT_CONFIG,
      pool: () => {
        const tables = findLootboxTables();
        return tables ? { cells: poolCellsFromTables(tables), actual: poolPricesFromTables(tables) } : null;
      },
      save: async (config) => {
        const before = getLootboxConfig();
        await setLootboxConfig(config);
        const saved = getLootboxConfig();
        const tablesSynced = await syncStructuralTables(saved.model);
        const pools = await syncPoolWeights(saved.typeWeights);
        return { tablesSynced, pools, restore: typesToRestore(before.typeWeights, saved.typeWeights) };
      },
      close: () => void this.close(),
    };
    renderLootboxSettings(this.#reactRoot, { controller });
  }

  protected override async _onClose(options: unknown): Promise<void> {
    this.#reactRoot?.unmount();
    this.#reactRoot = null;
    // @ts-expect-error ApplicationV2._onClose accepts DeepPartial render options at runtime.
    await super._onClose(options);
  }
}
