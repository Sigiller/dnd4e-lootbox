import { MODULE_ID } from "../constants.js";
import { localize } from "../i18n.js";
import { openLootbox, currentOdds } from "../open/open-box.js";
import { getPartyMembers } from "../party/party-members.js";
import { getChatVisibility, getLootboxConfig, onLootboxConfigChange } from "../settings.js";
import { purseGoldValue } from "../purse.js";
import { buildLootboxTables } from "../tables/build-tables.js";
import { findLootboxTables } from "../tables/registry.js";
import { readActorLevel, readActorPurse } from "../types/dnd4e.js";
import type { BuyerOption, LootboxController } from "./controller.js";
import { mountLootbox, unmountLootbox } from "./mount.js";

const { ApplicationV2, DialogV2 } = foundry.applications.api;

let activeApp: LootboxApp | null = null;

function measureDialogHeight(app: LootboxApp): number {
  const element = app.element;
  const windowContent = element.querySelector(".window-content");
  const inner = element.querySelector(".lootbox-inner");
  if (!(windowContent instanceof HTMLElement) || !(inner instanceof HTMLElement)) return 420;
  const frameHeight = element.offsetHeight - windowContent.clientHeight;
  return frameHeight + inner.scrollHeight;
}

function buyers(): BuyerOption[] {
  return getPartyMembers().flatMap((actor) =>
    actor.id
      ? [{ id: actor.id, name: actor.name, level: readActorLevel(actor), gold: purseGoldValue(readActorPurse(actor)) }]
      : []
  );
}

function partyLevel(): number {
  const levels = getPartyMembers().map(readActorLevel);
  if (levels.length === 0) return 1;
  return Math.round(levels.reduce((sum, l) => sum + l, 0) / levels.length);
}

const controller: LootboxController = {
  buyers,
  tablesReady: () => findLootboxTables() !== null,
  odds: currentOdds,
  defaultVisibility: getChatVisibility,
  open: async (level, buyerId, chargeAndGrant, visibility) =>
    openLootbox({ level, buyer: buyerId ? game.actors?.get(buyerId) ?? null : null, chargeAndGrant, visibility }),
  buildTables: buildLootboxTables,
  confirmRebuild: async () =>
    Boolean(
      await DialogV2.confirm({
        window: { title: localize(`${MODULE_ID}.dialog.rebuildTitle`) },
        content: `<p>${localize(`${MODULE_ID}.dialog.rebuildConfirm`)}</p>`,
      })
    ),
};

export class LootboxApp extends ApplicationV2 {
  #initialLevel: number;
  #stopListening: (() => void) | null = null;

  constructor(initialLevel: number) {
    super();
    this.#initialLevel = initialLevel;
  }

  static override DEFAULT_OPTIONS = {
    id: "dnd4e-lootbox-app",
    classes: ["dnd4e-lootbox", "sheet", "fox4e", "dnd4e"],
    tag: "div",
    window: {
      title: `${MODULE_ID}.dialog.title`,
      icon: "fa-solid fa-box-open",
      resizable: true,
    },
    position: {
      width: 460,
    },
  };

  protected override async _prepareContext(): Promise<object> {
    return {};
  }

  protected override async _renderHTML(_context: object, _options: unknown): Promise<HTMLElement> {
    const root = document.createElement("div");
    root.className = "lootbox-react-root";
    return root;
  }

  protected override async _replaceHTML(result: HTMLElement, content: HTMLElement, _options: unknown): Promise<void> {
    if (content.querySelector(":scope > .lootbox-react-root") instanceof HTMLElement) return;
    content.replaceChildren(result);
  }

  protected override async _onRender(context: object, options: unknown): Promise<void> {
    // @ts-expect-error ApplicationV2._onRender accepts DeepPartial render options at runtime.
    await super._onRender(context, options);
    this.#stopListening ??= onLootboxConfigChange(() => this.#mount());
    this.#mount();
    requestAnimationFrame(() => void this.fitToContent());
  }

  #mount(): void {
    const root = this.element.querySelector(".lootbox-react-root");
    if (!(root instanceof HTMLElement)) return;
    mountLootbox(root, {
      controller,
      config: getLootboxConfig(),
      initialLevel: this.#initialLevel,
      onLayoutChange: this.#fit,
    });
  }

  /** Stable callback so the React effect that fits the window does not rerun on every render. */
  #fit = (): void => {
    void this.fitToContent();
  };

  async fitToContent(): Promise<void> {
    this.setPosition({ height: measureDialogHeight(this) });
  }

  protected override async _onClose(options: unknown): Promise<void> {
    this.#stopListening?.();
    this.#stopListening = null;
    unmountLootbox();
    if (activeApp === this) activeApp = null;
    // @ts-expect-error ApplicationV2._onClose accepts DeepPartial render options at runtime.
    await super._onClose(options);
  }
}

export async function openLootboxDialog(options?: { level?: number }): Promise<void> {
  if (game.system?.id !== "dnd4e" || !game.user?.isGM) return;
  if (activeApp?.rendered) {
    activeApp.bringToFront();
    return;
  }
  activeApp = new LootboxApp(options?.level ?? partyLevel());
  await activeApp.render(true);
}
