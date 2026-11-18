import { useDeferredValue, useMemo, useState, type ChangeEvent } from "react";
import { MODULE_ID } from "../constants.js";
import { formatMessage, localize } from "../i18n.js";
import {
  OFFSET_VALUES,
  validateConfig,
  weightShare,
  type ConfigProblem,
  type LootboxConfig,
} from "../model/config.js";
import { fitPrices, oddsByLevel, type LevelOdds } from "../model/levels.js";
import { poolPricesFromCells } from "../model/type-weights.js";
import {
  ITEM_KINDS,
  RARITIES,
  type ItemKind,
  type ItemType,
  type PoolPrices,
  type Rarity,
  type Targets,
  type TypeWeights,
  type Weighted,
} from "../model/types.js";
import { formatPercent, formatRatio } from "../open/format.js";
import { offsetLabel } from "../tables/table-data.js";
import type { PoolSource, SaveReport, SettingsController } from "./controller.js";
import { Columns, Footer, Form, Grid, Heading, Hint, Panel } from "./LootboxSettings.styles.js";

const K = `${MODULE_ID}.config`;
const t = (key: string) => localize(`${K}.${key}`);

/** Problems that make the odds meaningless, so the odds table is not computed. */
const MODEL_PROBLEMS: ReadonlySet<ConfigProblem> = new Set([
  "countWeights",
  "extraKindWeights",
  "rarityWeights",
  "offsetWeights",
  "typeWeights",
  "weightRange",
  "sellRatio",
  "prices",
]);

type SimpleTable = "count" | "extraKind" | "rarity";

function numberFrom(event: ChangeEvent<HTMLInputElement>): number {
  return event.target.value.trim() === "" ? Number.NaN : Number(event.target.value);
}

function percent(fraction: number): number {
  return Math.round(fraction * 10000) / 100;
}

function withWeight<T>(weights: Weighted<T>, value: T, weight: number): Weighted<T> {
  return weights.map((entry) => (entry.value === value ? { value, weight } : entry));
}

function WeightRows<T extends string | number>({
  weights,
  label,
  onChange,
}: {
  weights: Weighted<T>;
  label: (value: T) => string;
  onChange: (value: T, weight: number) => void;
}) {
  return (
    <Grid>
      <thead>
        <tr>
          <th />
          <th className="num">{t("weight")}</th>
          <th className="share">{t("chance")}</th>
        </tr>
      </thead>
      <tbody>
        {weights.map(({ value, weight }) => (
          <tr key={String(value)}>
            <td>{label(value)}</td>
            <td style={{ width: "5.5em" }}>
              <input type="number" min={0} step={1} value={Number.isNaN(weight) ? "" : weight} onChange={(e) => onChange(value, numberFrom(e))} />
            </td>
            <td className="share" style={{ width: "4.5em" }}>
              {formatPercent(weightShare(weights, value))}
            </td>
          </tr>
        ))}
      </tbody>
    </Grid>
  );
}

/** Pool prices under the given type weights: re-weighted from the items, or the tables as they are. */
function poolFor(source: PoolSource | null, typeWeights: TypeWeights): PoolPrices | null {
  if (!source) return null;
  return source.cells ? poolPricesFromCells(source.cells, typeWeights) : source.actual;
}

/** Notification lines after a save: what was rewritten and what still needs a rebuild. */
function saveMessages(report: SaveReport): { info: string; warnings: string[] } {
  const warnings: string[] = [];
  if (report.pools.status === "untyped") warnings.push(t("poolsUntyped"));
  if (report.pools.status === "synced" && report.restore.length > 0) {
    const types = report.restore.map((type) => localize(`${MODULE_ID}.itemType.${type}`)).join(", ");
    warnings.push(formatMessage(`${K}.restoreTypes`, { types }));
  }
  if (report.pools.removedTables > 0) {
    warnings.push(formatMessage(`${K}.poolTablesRemoved`, { count: report.pools.removedTables }));
  }
  return { info: t(report.tablesSynced ? "savedSynced" : "saved"), warnings };
}

function OddsCells({ row, targets }: { row: LevelOdds; targets: Targets }) {
  const { pLoss, pSellProfit, valueRatio } = row.odds;
  const cls = (ok: boolean) => (ok ? "num" : "num off");
  return (
    <>
      <td className={cls(pLoss >= targets.lossMin && pLoss <= targets.lossMax)}>{formatPercent(pLoss)}</td>
      <td className={cls(pSellProfit >= targets.sellProfitMin && pSellProfit <= targets.sellProfitMax)}>
        {formatPercent(pSellProfit)}
      </td>
      <td className={cls(valueRatio > targets.minValueRatio)}>{formatRatio(valueRatio)}</td>
    </>
  );
}

export interface LootboxSettingsProps {
  controller: SettingsController;
}

export function LootboxSettingsRoot({ controller }: LootboxSettingsProps) {
  const [draft, setDraft] = useState<LootboxConfig>(() => controller.current());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; warn: boolean } | null>(null);
  const poolSource = useMemo(() => controller.pool(), [controller]);

  const problems = useMemo(() => validateConfig(draft), [draft]);
  const deferred = useDeferredValue(draft);
  const deferredProblems = useMemo(() => validateConfig(deferred), [deferred]);
  const deferredTypeWeights = deferred.typeWeights;
  const pool = useMemo(() => poolFor(poolSource, deferredTypeWeights), [poolSource, deferredTypeWeights]);
  const odds = useMemo(
    () => (pool && !deferredProblems.some((p) => MODEL_PROBLEMS.has(p)) ? oddsByLevel(deferred, pool) : null),
    [deferred, deferredProblems, pool]
  );
  const offTarget = odds?.filter((row) => !row.meetsTargets).length ?? 0;

  const update = (change: (config: LootboxConfig) => LootboxConfig) => {
    setDraft((current) => change(current));
    setMessage(null);
  };
  const setSimple = (table: SimpleTable, value: string | number, weight: number) =>
    update((c) => ({
      ...c,
      model: { ...c.model, [table]: withWeight(c.model[table] as Weighted<string | number>, value, weight) },
    }));
  const setOffset = (rarity: Rarity, offset: number, weight: number) =>
    update((c) => ({
      ...c,
      model: {
        ...c.model,
        levelOffset: { ...c.model.levelOffset, [rarity]: withWeight(c.model.levelOffset[rarity], offset, weight) },
      },
    }));
  const setSell = (rarity: Rarity, pct: number) =>
    update((c) => ({ ...c, sellRatio: { ...c.sellRatio, [rarity]: pct / 100 } }));
  const setTarget = (key: keyof Targets, value: number) =>
    update((c) => ({ ...c, targets: { ...c.targets, [key]: value } }));
  const setPrice = (index: number, price: number) =>
    update((c) => ({ ...c, prices: c.prices.map((p, i) => (i === index ? price : p)) }));
  const setTypeWeight = (kind: ItemKind, type: ItemType, weight: number) =>
    update((c) => ({ ...c, typeWeights: { ...c.typeWeights, [kind]: withWeight(c.typeWeights[kind], type, weight) } }));

  const fit = () => {
    const fitPool = poolFor(poolSource, draft.typeWeights);
    if (!fitPool) return;
    setBusy(true);
    setMessage({ text: t("fitting"), warn: false });
    // Let React paint the "fitting" message before the ~1 s computation.
    window.setTimeout(() => {
      try {
        const prices = fitPrices(draft, fitPool);
        setDraft((c) => ({ ...c, prices }));
        setMessage({ text: t("fitted"), warn: false });
      } catch (error) {
        setMessage({ text: error instanceof Error ? error.message : String(error), warn: true });
      } finally {
        setBusy(false);
      }
    }, 30);
  };

  const save = async () => {
    setBusy(true);
    try {
      const { info, warnings } = saveMessages(await controller.save(draft));
      ui.notifications?.info(info);
      for (const warning of warnings) ui.notifications?.warn(warning, { permanent: true });
      controller.close();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : String(error), warn: true });
      setBusy(false);
    }
  };

  const rarityLabel = (rarity: Rarity) => localize(`${MODULE_ID}.rarity.${rarity}`);
  const typeLabel = (type: ItemType) => localize(`${MODULE_ID}.itemType.${type}`);
  const { model, sellRatio, targets } = draft;

  return (
    <Form className="lootbox-settings-inner">
      <Hint>{t("intro")}</Hint>
      <Columns>
        <Panel>
          <Heading>{t("count")}</Heading>
          <WeightRows
            weights={model.count}
            label={(n) => formatMessage(`${K}.items`, { count: n })}
            onChange={(value, weight) => setSimple("count", value, weight)}
          />
          <Heading>{t("extraKind")}</Heading>
          <Hint>{t("extraKindHint")}</Hint>
          <WeightRows
            weights={model.extraKind}
            label={(kind) => localize(`${MODULE_ID}.kind.${kind}`)}
            onChange={(value, weight) => setSimple("extraKind", value, weight)}
          />
          <Heading>{t("rarity")}</Heading>
          <WeightRows
            weights={model.rarity}
            label={rarityLabel}
            onChange={(value, weight) => setSimple("rarity", value, weight)}
          />
        </Panel>

        <Panel>
          <Heading>{t("offset")}</Heading>
          <Hint>{t("offsetHint")}</Hint>
          <Grid>
            <thead>
              <tr>
                <th />
                {RARITIES.map((rarity) => (
                  <th key={rarity} className="num">
                    {rarityLabel(rarity)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {OFFSET_VALUES.map((offset) => (
                <tr key={offset}>
                  <td>{offsetLabel(offset)}</td>
                  {RARITIES.map((rarity) => {
                    const weight = model.levelOffset[rarity].find((e) => e.value === offset)?.weight ?? 0;
                    return (
                      <td key={rarity}>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={Number.isNaN(weight) ? "" : weight}
                          onChange={(e) => setOffset(rarity, offset, numberFrom(e))}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </Grid>

          <Heading>{t("sellRatio")}</Heading>
          <Grid>
            <tbody>
              {RARITIES.map((rarity) => (
                <tr key={rarity}>
                  <td>{rarityLabel(rarity)}</td>
                  <td style={{ width: "6em" }}>
                    <input type="number" min={0} max={100} step={1} value={percent(sellRatio[rarity])} onChange={(e) => setSell(rarity, numberFrom(e))} />
                  </td>
                  <td className="share" style={{ width: "1.5em" }}>%</td>
                </tr>
              ))}
            </tbody>
          </Grid>
        </Panel>
      </Columns>

      <Panel>
        <Heading>{t("types")}</Heading>
        <Hint>{t("typesHint")}</Hint>
        {poolSource && !poolSource.cells && <Hint $warn>{t("untypedPools")}</Hint>}
      </Panel>
      <Columns>
        {ITEM_KINDS.map((kind) => (
          <Panel key={kind}>
            <Heading>{t(kind === "permanent" ? "permanentTypes" : "consumableTypes")}</Heading>
            <WeightRows
              weights={draft.typeWeights[kind]}
              label={typeLabel}
              onChange={(type, weight) => setTypeWeight(kind, type, weight)}
            />
          </Panel>
        ))}
      </Columns>

      <Columns>
        <Panel>
          <Heading>{t("targets")}</Heading>
          <Hint>{t("targetsHint")}</Hint>
          <Grid>
            <thead>
              <tr>
                <th />
                <th className="num">{t("min")}</th>
                <th className="num">{t("max")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t("loss")}</td>
                <td><input type="number" min={0} max={100} step={0.5} value={percent(targets.lossMin)} onChange={(e) => setTarget("lossMin", numberFrom(e) / 100)} /></td>
                <td><input type="number" min={0} max={100} step={0.5} value={percent(targets.lossMax)} onChange={(e) => setTarget("lossMax", numberFrom(e) / 100)} /></td>
              </tr>
              <tr>
                <td>{t("sellProfit")}</td>
                <td><input type="number" min={0} max={100} step={0.5} value={percent(targets.sellProfitMin)} onChange={(e) => setTarget("sellProfitMin", numberFrom(e) / 100)} /></td>
                <td><input type="number" min={0} max={100} step={0.5} value={percent(targets.sellProfitMax)} onChange={(e) => setTarget("sellProfitMax", numberFrom(e) / 100)} /></td>
              </tr>
              <tr>
                <td>{t("minValue")}</td>
                <td><input type="number" min={0} step={0.05} value={targets.minValueRatio} onChange={(e) => setTarget("minValueRatio", numberFrom(e))} /></td>
                <td />
              </tr>
            </tbody>
          </Grid>
        </Panel>

        <Panel>
          <Heading>{t("pool")}</Heading>
          <Grid>
            <tbody>
              <tr>
                <td>{t("priceFactor")}</td>
                <td style={{ width: "6em" }}>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={Number.isNaN(draft.maxConsumablePriceFactor) ? "" : draft.maxConsumablePriceFactor}
                    onChange={(e) => update((c) => ({ ...c, maxConsumablePriceFactor: numberFrom(e) }))}
                  />
                </td>
                <td className="share" style={{ width: "1.5em" }}>×</td>
              </tr>
            </tbody>
          </Grid>
          <Hint>{t("priceFactorHint")}</Hint>
        </Panel>
      </Columns>

      <Panel>
        <Heading>{t("prices")}</Heading>
        <Hint $warn={offTarget > 0}>
          {!pool
            ? t("noPool")
            : odds
              ? offTarget > 0
                ? formatMessage(`${K}.offTarget`, { count: offTarget })
                : t("allOnTarget")
              : t("fixProblems")}
        </Hint>
        <Grid>
          <thead>
            <tr>
              <th>{t("level")}</th>
              <th className="num">{t("price")}</th>
              <th className="num">{t("loss")}</th>
              <th className="num">{t("sellProfit")}</th>
              <th className="num">{t("avgValue")}</th>
            </tr>
          </thead>
          <tbody>
            {draft.prices.map((price, index) => {
              const row = odds?.[index];
              return (
                <tr key={index}>
                  <td>{index + 1}</td>
                  <td style={{ width: "9em" }}>
                    <input type="number" min={1} step={1} value={Number.isNaN(price) ? "" : price} onChange={(e) => setPrice(index, numberFrom(e))} />
                  </td>
                  {row ? <OddsCells row={row} targets={deferred.targets} /> : <td colSpan={3} />}
                </tr>
              );
            })}
          </tbody>
        </Grid>
        <button type="button" disabled={busy || !pool || problems.some((p) => MODEL_PROBLEMS.has(p) && p !== "prices")} onClick={fit}>
          <i className="fa-solid fa-wand-magic-sparkles" /> {t("fit")}
        </button>
      </Panel>

      {problems.length > 0 && (
        <Hint $warn>{problems.map((problem) => localize(`${MODULE_ID}.errors.config.${problem}`)).join(" ")}</Hint>
      )}
      {message && <Hint $warn={message.warn}>{message.text}</Hint>}

      <Footer>
        <button type="button" disabled={busy} onClick={() => update(() => structuredClone(controller.defaults))}>
          <i className="fa-solid fa-rotate-left" /> {t("reset")}
        </button>
        <button type="button" disabled={busy} onClick={() => controller.close()}>
          <i className="fa-solid fa-xmark" /> {t("cancel")}
        </button>
        <button type="button" disabled={busy || problems.length > 0} onClick={() => void save()}>
          <i className="fa-solid fa-floppy-disk" /> {t("save")}
        </button>
      </Footer>
    </Form>
  );
}
