import { ITEM_TYPES, type ItemType, type LootboxModel, type Targets, type TypeWeights } from "./types.js";

/**
 * Default weights of the structural tables (all d20). Calibrated together with
 * `DEFAULT_BOX_PRICES` so every box level hits the target odds; rerun `npm run calibrate`
 * after changing anything here. GMs override all of this in the module settings.
 */
export const DEFAULT_MODEL: LootboxModel = {
  count: [
    { value: 1, weight: 6 },
    { value: 2, weight: 9 },
    { value: 3, weight: 3 },
    { value: 4, weight: 2 },
  ],
  extraKind: [
    { value: "permanent", weight: 10 },
    { value: "consumable", weight: 10 },
  ],
  rarity: [
    { value: "common", weight: 6 },
    { value: "uncommon", weight: 13 },
    { value: "rare", weight: 1 },
  ],
  levelOffset: {
    common: [
      { value: -2, weight: 3 },
      { value: -1, weight: 6 },
      { value: 0, weight: 7 },
      { value: 1, weight: 3 },
      { value: 2, weight: 1 },
    ],
    uncommon: [
      { value: -2, weight: 1 },
      { value: -1, weight: 5 },
      { value: 0, weight: 9 },
      { value: 1, weight: 4 },
      { value: 2, weight: 1 },
    ],
    rare: [
      { value: -2, weight: 2 },
      { value: -1, weight: 5 },
      { value: 0, weight: 7 },
      { value: 1, weight: 4 },
      { value: 2, weight: 2 },
    ],
  },
};

/** Default target odds every box level must meet. */
export const DEFAULT_TARGETS: Targets = {
  lossMin: 0.15,
  lossMax: 0.25,
  sellProfitMin: 0.2,
  sellProfitMax: 0.3,
  minValueRatio: 1,
};

/** Consumables priced above this multiple of the standard price for their level are left out of the pools. */
export const DEFAULT_MAX_CONSUMABLE_PRICE_FACTOR = 10;

/**
 * Default item type weights: every slot and every consumable type equally likely within a pool
 * table, whatever the number of compendium entries behind it.
 */
export const DEFAULT_TYPE_WEIGHT = 10;

export const DEFAULT_TYPE_WEIGHTS: TypeWeights = {
  permanent: ITEM_TYPES.permanent.map((value: ItemType) => ({ value, weight: DEFAULT_TYPE_WEIGHT })),
  consumable: ITEM_TYPES.consumable.map((value: ItemType) => ({ value, weight: DEFAULT_TYPE_WEIGHT })),
};
