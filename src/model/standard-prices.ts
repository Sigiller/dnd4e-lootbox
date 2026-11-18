/** 4e magic item price by level (index = level, 1–30). Rarity does not change the price. */
export const PERMANENT_PRICE_BY_LEVEL: readonly number[] = [
  0, 360, 520, 680, 840, 1000, 1800, 2600, 3400, 4200, 5000, 9000, 13000, 17000, 21000, 25000,
  45000, 65000, 85000, 105000, 125000, 225000, 325000, 425000, 525000, 625000, 1125000, 1625000,
  2125000, 2625000, 3125000,
];

/** 4e consumable price by level (index = level, 1–30). */
export const CONSUMABLE_PRICE_BY_LEVEL: readonly number[] = [
  0, 20, 25, 30, 40, 50, 75, 100, 125, 160, 200, 350, 500, 650, 800, 1000, 1800, 2600, 3400, 4200,
  5000, 9000, 13000, 17000, 21000, 25000, 45000, 65000, 85000, 105000, 125000,
];
