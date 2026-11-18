# D&D 4e Lootbox

Buyable lootboxes for the dnd4e system on Foundry v14. A box of level L holds 1–4 random magic items from the
[DnD 4e Compendium](https://github.com/wigmeister2000/foundry-4e-compendium), drawn through linked roll tables.

- Never weapons, implements, armor, shields, ammunition, boons and other alternative rewards, mounts, companions,
  familiars, artifacts or psionic Augment items.
- Alchemical items can appear as consumables.
- Sell ratios used for the odds: common 20%, uncommon 50%, rare 100%.

## Usage (GM)

1. Click the box icon in the token controls, or run the macro below.
2. On first use, click **Build tables**. This creates a **Lootbox** folder in the Roll Tables tab with six structural
   tables and one pool table per (kind, level, rarity), 162 in total.
3. Pick a box level, optionally a buyer from the party, and click **Open box**. With *Charge the price and add the
   items*, the price is paid from the buyer's coins (change is returned) and the items go to their inventory.
   A chat card lists the items with links, the market and sell totals, and the verdict. The card is private by
   default (see **Chat card visibility** below); the window's *Chat card* field changes it for one box.
4. Each item on the chat card has two reroll buttons (GMs only; players never see them):
   - **Swap** (dice icon): a different item of the same kind, rarity and level, drawn from its pool table with the
     item type weights. Permanent items of one level all cost the same, so this never changes a box's value.
   - **Reroll slot** (d20 icon): the whole slot rolled again as when the box was opened: kind (items after the first;
     the first item stays permanent), rarity, level offset and item. The value can go up or down.

   The box price stays the same; the totals and verdict are recalculated, and the item is marked *rerolled*. If the
   box was charged to a buyer, the old item leaves their inventory (one off a stack) and the new one is added. A
   reroll is refused when the old item is no longer in the inventory, or when the pool has no other item.

```js
game.modules.get("dnd4e-lootbox").api.openLootboxDialog();
```

Other API calls: `openLootbox({ level, buyer, chargeAndGrant, visibility })`, `rerollItem(messageId, index, mode)` (`"item"` or `"slot"`),
`buildTables()`, `odds(level)`, `price(level)` and `simulate(level, boxes)`. `simulate` rolls the real tables without chat or items and compares the outcome with the
predicted odds.

You can remove items you dislike from a pool table. The window computes the odds from the tables as they are now
and warns when a box leaves the target range. **Rebuild** recreates every table and discards those removals.

## Settings

Every number lives in **Configure Settings → Module Settings → D&D 4e Lootbox → Lootbox numbers → Configure** (GM only):

- weights of the item count, extra item type and rarity tables;
- level offset weights from −5 to +5 for each rarity (weight 0 = never);
- sell ratios per rarity;
- target odds (money-losing range, profit-if-sold range, minimum average value);
- the consumable price cap that keeps mispriced consumables out of the pools;
- item type weights: one per permanent slot (head, neck, arms, hands, waist, feet, ring, wondrous) and one per
  consumable type (potion, elixir, alchemical, reagent, whetstone, soulfang, other);
- the price of every box level.

While you edit, the window shows the odds of every box level under your unsaved numbers and marks levels that miss
the targets in red. Prices do not follow weight changes by themselves. **Fit prices to targets** recomputes all 30
prices from the current weights, sell ratios and targets. **Save** stores the numbers, rewrites the six structural
roll tables in place and reweights the pool tables in place (items you removed from a pool stay removed). The pool
tables pick up a new consumable price cap only after **Rebuild**.

Item type weights decide how a pool table picks: each type present in the table gets its weight's share, split
evenly among its items. By default every slot and consumable type weighs 10, so a neck item is no more likely than a
ring just because the compendium has five times as many neck entries. Where a type has no items at some level and
rarity (rings below level 10, for example), the other types share its part. Weight 0 removes a type's items from the
pools; raising it from 0 again takes a **Rebuild**. Tables built before type weights existed carry
no item types: the settings window says so, and **Rebuild** applies the weights.

**Chat card visibility** (a world setting in the same category) decides who sees the lootbox chat card, the only
message the module posts:

- **Private** (default): whispered to the GMs and the players who own the buyer. With no buyer, only the GMs see it.
- **GMs only**: whispered to the GMs.
- **Public**: everyone.

A GM can show a whispered card to everyone later with **Reveal To Everyone** in its chat context menu.

The tables below are for the default numbers.

## How a box is rolled

1. **Item Count**: 1 (30%), 2 (45%), 3 (15%), 4 (10%).
2. The first item is permanent. Each further item rolls **Extra Item Type**: permanent or consumable, 50/50.
3. Each item rolls **Rarity** (common 30%, uncommon 65%, rare 5%), then **Level Offset** for that rarity
   (−2 to +2 around the box level).
4. The item comes from the pool table for its kind, level and rarity, weighted by item type (see Settings). An empty
   pool falls back to the nearest level.

## Prices and odds

Each column shows:
- **Loss**: chance that the market value is below the price.
- **Sell-profit**: chance that selling everything returns at least the price.
- **Avg value**: expected market value ÷ price.

| L | Price (gp) | Loss | Sell-profit | Avg value |
| 1 | 370 | 21.8% | 23.2% | 1.73× |
| 2 | 460 | 18.9% | 24.7% | 1.73× |
| 3 | 600 | 19.5% | 26.0% | 1.70× |
| 4 | 780 | 19.4% | 25.2% | 1.69× |
| 5 | 1,000 | 19.7% | 27.5% | 1.80× |
| 6 | 1,600 | 20.0% | 25.2% | 1.69× |
| 7 | 2,200 | 20.2% | 27.2% | 1.75× |
| 8 | 3,000 | 19.8% | 25.9% | 1.69× |
| 9 | 3,900 | 19.7% | 25.0% | 1.69× |
| 10 | 5,000 | 19.9% | 27.4% | 1.80× |
| 11 | 8,100 | 20.0% | 24.9% | 1.66× |
| 12 | 11,000 | 20.2% | 27.1% | 1.75× |
| 13 | 15,000 | 19.5% | 26.2% | 1.70× |
| 14 | 20,000 | 19.9% | 24.2% | 1.65× |
| 15 | 25,000 | 19.8% | 27.3% | 1.80× |
| 16 | 40,000 | 20.2% | 25.0% | 1.68× |
| 17 | 56,000 | 20.2% | 23.6% | 1.72× |
| 18 | 75,000 | 19.8% | 25.8% | 1.69× |
| 19 | 97,000 | 19.7% | 25.2% | 1.70× |
| 20 | 120,000 | 19.6% | 27.9% | 1.87× |
| 21 | 200,000 | 20.0% | 25.1% | 1.68× |
| 22 | 280,000 | 20.2% | 23.6% | 1.72× |
| 23 | 370,000 | 19.7% | 26.0% | 1.72× |
| 24 | 490,000 | 19.8% | 24.6% | 1.68× |
| 25 | 620,000 | 19.8% | 27.5% | 1.81× |
| 26 | 1,000,000 | 20.0% | 25.1% | 1.68× |
| 27 | 1,400,000 | 20.2% | 23.6% | 1.72× |
| 28 | 1,800,000 | 19.3% | 26.5% | 1.77× |
| 29 | 2,300,000 | 18.7% | 25.3% | 1.70× |
| 30 | 2,800,000 | 18.5% | 24.6% | 1.61× |

These are exact probabilities, not simulation. The tests check that every level stays within 15–25% loss and
20–30% sell-profit, with average value above 1×.

## Development

```bash
npm ci
npm run check            # lint + typecheck + tests + build
npm run export-pool      # refresh tests/fixtures/pool-prices.json from the compendium LevelDB
npm run calibrate        # print fitted default prices and odds; add -- --write to update src/model/prices.ts
```
