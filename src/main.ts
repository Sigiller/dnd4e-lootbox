import { openLootboxDialog } from "./app/LootboxApp.js";
import { MODULE_ID } from "./constants.js";
import type { LootboxApi } from "./foundry-augmentations.js";
import { LootboxSettingsApp } from "./config-app/LootboxSettingsApp.js";
import { priceFor } from "./model/config.js";
import { injectChatStyles } from "./open/chat-card.js";
import { currentOdds, openLootbox, simulateLootboxes } from "./open/open-box.js";
import { registerRerollHooks, rerollLootboxItemById } from "./open/reroll.js";
import { getLootboxConfig, registerSettings } from "./settings.js";
import { buildLootboxTables } from "./tables/build-tables.js";

Hooks.once("init", () => {
  registerSettings(LootboxSettingsApp);
  injectChatStyles();
  registerRerollHooks();
});

Hooks.once("ready", () => {
  if (game.system?.id !== "dnd4e") {
    console.warn(`${MODULE_ID} | active only for the dnd4e system (current: ${game.system?.id ?? "none"})`);
    return;
  }
  const mod = game.modules?.get(MODULE_ID);
  if (mod) {
    const api: LootboxApi = {
      openLootboxDialog,
      openLootbox,
      buildTables: buildLootboxTables,
      simulate: simulateLootboxes,
      odds: currentOdds,
      price: (level) => priceFor(getLootboxConfig(), level),
      config: getLootboxConfig,
      rerollItem: rerollLootboxItemById,
    };
    mod.api = api;
  }
  console.log(`${MODULE_ID} | ready`);
});

Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user?.isGM || game.system?.id !== "dnd4e") return;
  const tokenControls = controls.tokens;
  if (!tokenControls?.tools) return;
  tokenControls.tools.dnd4eLootbox = {
    name: "dnd4eLootbox",
    title: `${MODULE_ID}.sceneControl.title`,
    icon: "fa-solid fa-box-open",
    button: true,
    order: 999,
    visible: true,
    onChange: () => {
      void openLootboxDialog();
    },
  };
});
