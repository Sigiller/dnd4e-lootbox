import { MODULE_ID } from "./constants.js";
import { DEFAULT_CONFIG, normalizeConfig, type LootboxConfig } from "./model/config.js";
import {
  CHAT_VISIBILITIES,
  DEFAULT_CHAT_VISIBILITY,
  normalizeChatVisibility,
  type ChatVisibility,
} from "./open/visibility.js";

export const CONFIG_SETTING = "config";
export const CONFIG_MENU = "configMenu";
export const CHAT_VISIBILITY_SETTING = "chatVisibility";

const listeners = new Set<() => void>();

/** Register the world setting holding every number the module uses, and its GM editor menu. */
export function registerSettings(menuType: new () => foundry.applications.api.ApplicationV2.Any): void {
  game.settings?.register(MODULE_ID, CONFIG_SETTING, {
    scope: "world",
    config: false,
    type: Object,
    default: DEFAULT_CONFIG,
    onChange: () => {
      for (const listener of listeners) listener();
    },
  });
  game.settings?.registerMenu(MODULE_ID, CONFIG_MENU, {
    name: `${MODULE_ID}.settings.config.name`,
    label: `${MODULE_ID}.settings.config.label`,
    hint: `${MODULE_ID}.settings.config.hint`,
    icon: "fa-solid fa-sliders",
    type: menuType,
    restricted: true,
  });
  game.settings?.register(MODULE_ID, CHAT_VISIBILITY_SETTING, {
    name: `${MODULE_ID}.settings.chatVisibility.name`,
    hint: `${MODULE_ID}.settings.chatVisibility.hint`,
    scope: "world",
    config: true,
    type: String,
    // Keys: the settings window localizes choice labels when it renders them
    choices: Object.fromEntries(
      CHAT_VISIBILITIES.map((v) => [v, `${MODULE_ID}.visibility.${v}`])
    ) as Record<ChatVisibility, string>,
    default: DEFAULT_CHAT_VISIBILITY,
  });
}

/** Default visibility of lootbox chat cards in this world. */
export function getChatVisibility(): ChatVisibility {
  return normalizeChatVisibility(game.settings?.get(MODULE_ID, CHAT_VISIBILITY_SETTING));
}

/** The world's lootbox numbers (defaults for anything missing or invalid). */
export function getLootboxConfig(): LootboxConfig {
  return normalizeConfig(game.settings?.get(MODULE_ID, CONFIG_SETTING));
}

export async function setLootboxConfig(config: LootboxConfig): Promise<void> {
  await game.settings?.set(MODULE_ID, CONFIG_SETTING, normalizeConfig(config));
}

/** Run a callback whenever the config changes on any client. Returns the unsubscribe function. */
export function onLootboxConfigChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
