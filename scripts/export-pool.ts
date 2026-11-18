/**
 * Regenerates tests/fixtures/pool-prices.json ({ "<kind>|<rarity>|<level>": [[price, type], ...] })
 * from the dnd-4e-compendium LevelDB packs.
 * Copies each pack to a temp dir first (Foundry may hold the LOCK) and reads it with the
 * classic-level build bundled in the Foundry app.
 *
 *   npm run export-pool -- [path/to/dnd-4e-compendium] [path/to/foundry/app]
 */
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { classifyItem, type CompendiumItemLike, type PoolEntry } from "../src/pool/classify.js";
import { poolCellKey } from "../src/model/types.js";

interface LevelIterator {
  [Symbol.asyncIterator](): AsyncIterator<[string, unknown]>;
}
interface LevelDb {
  iterator(): LevelIterator;
  close(): Promise<void>;
}
type ClassicLevelCtor = new (path: string, options: { valueEncoding: "json" }) => LevelDb;

const compendiumDir = resolve(process.argv[2] ?? "../dnd-4e-compendium");
const foundryApp = resolve(
  process.argv[3] ?? "/Applications/Foundry Virtual Tabletop v14.app/Contents/Resources/app"
);
const PACKS = [
  { dir: "items", id: "dnd-4e-compendium.module-equipment" },
  { dir: "consumables", id: "dnd-4e-compendium.module-consumables" },
];

const require = createRequire(join(foundryApp, "package.json"));
const { ClassicLevel } = require("classic-level") as { ClassicLevel: ClassicLevelCtor };

async function readPack(dir: string, packId: string): Promise<PoolEntry[]> {
  const temp = mkdtempSync(join(tmpdir(), "lootbox-pack-"));
  try {
    cpSync(join(compendiumDir, "packs", dir), temp, { recursive: true });
    rmSync(join(temp, "LOCK"), { force: true });
    const db = new ClassicLevel(temp, { valueEncoding: "json" });
    const entries: PoolEntry[] = [];
    for await (const [key, value] of db.iterator()) {
      if (!key.startsWith("!items!")) continue;
      const doc = value as Omit<CompendiumItemLike, "uuid"> & { _id: string };
      const entry = classifyItem({ ...doc, uuid: `Compendium.${packId}.Item.${doc._id}` });
      if (entry) entries.push(entry);
    }
    await db.close();
    return entries;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

const entries = (await Promise.all(PACKS.map((pack) => readPack(pack.dir, pack.id)))).flat();
const cells: Record<string, [number, string][]> = {};
for (const entry of entries) {
  (cells[poolCellKey(entry.kind, entry.rarity, entry.level)] ??= []).push([entry.price, entry.type]);
}
const sorted = Object.fromEntries(
  Object.entries(cells)
    .sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))
    .map(([key, rows]) => [key, rows.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]))])
);
const out = resolve("tests/fixtures/pool-prices.json");
writeFileSync(out, `${JSON.stringify(sorted, null, 0)}\n`);
const kinds = entries.reduce<Record<string, number>>((acc, entry) => {
  acc[entry.kind] = (acc[entry.kind] ?? 0) + 1;
  return acc;
}, {});
const types = entries.reduce<Record<string, number>>((acc, entry) => {
  acc[entry.type] = (acc[entry.type] ?? 0) + 1;
  return acc;
}, {});
console.log(JSON.stringify(types));
console.log(`${String(entries.length)} items (${JSON.stringify(kinds)}) in ${String(Object.keys(sorted).length)} cells → ${out}`);
