import { useEffect, useMemo, useState } from "react";
import { MAX_LEVEL, MIN_LEVEL, MODULE_ID } from "../constants.js";
import { formatMessage, localize } from "../i18n.js";
import { meetsTargets } from "../model/calibrate.js";
import { priceFor, type LootboxConfig } from "../model/config.js";
import { formatGp, formatPercent, formatRatio, VERDICT_KEYS } from "../open/format.js";
import { CHAT_VISIBILITIES, normalizeChatVisibility } from "../open/visibility.js";
import type { LootboxController } from "./controller.js";
import {
  Actions,
  CheckRow,
  Heading,
  Inner,
  Note,
  Panel,
  Row,
  SecondaryButton,
  Stat,
  Stats,
} from "./Lootbox.styles.js";

const K = MODULE_ID;
const LEVELS = Array.from({ length: MAX_LEVEL - MIN_LEVEL + 1 }, (_, i) => i + MIN_LEVEL);

export interface LootboxProps {
  controller: LootboxController;
  /** Current module settings; the window re-renders with a new object when they change. */
  config: LootboxConfig;
  initialLevel: number;
  onLayoutChange: () => void;
}

/** World state read once per refresh (buyers' gold changes after a purchase, tables after a build). */
function readSnapshot(controller: LootboxController) {
  return { buyers: controller.buyers(), ready: controller.tablesReady() };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function LootboxRoot({ controller, config, initialLevel, onLayoutChange }: LootboxProps) {
  const [level, setLevel] = useState(initialLevel);
  const [buyerId, setBuyerId] = useState("");
  const [charge, setCharge] = useState(true);
  const [visibility, setVisibility] = useState(() => controller.defaultVisibility());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; warn: boolean } | null>(null);
  const [snapshot, setSnapshot] = useState(() => readSnapshot(controller));
  const refresh = () => setSnapshot(readSnapshot(controller));

  const { buyers, ready } = snapshot;
  const odds = useMemo(
    () => (snapshot.ready ? controller.odds(level) : null),
    // config: the odds use its prices and sell ratios even though the controller reads them itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [controller, level, snapshot, config]
  );

  const price = priceFor(config, level);
  const buyer = buyers.find((b) => b.id === buyerId);
  const chargeActive = Boolean(buyer) && charge;
  const shortOfMoney = chargeActive && buyer !== undefined && buyer.gold < price;

  // React renders asynchronously, so fit the window after every change that alters its height.
  useEffect(() => {
    onLayoutChange();
  }, [onLayoutChange, ready, odds, message, shortOfMoney]);

  const report = (text: string, warn = false) => {
    setMessage({ text, warn });
  };

  const build = async () => {
    if (ready && !(await controller.confirmRebuild())) return;
    setBusy(true);
    report(localize(`${K}.dialog.building`));
    try {
      const result = await controller.buildTables();
      refresh();
      report(
        formatMessage(`${K}.dialog.built`, {
          tables: result.structuralTables + result.poolTables,
          items: result.items,
        })
      );
    } catch (error) {
      report(errorText(error), true);
    } finally {
      setBusy(false);
    }
  };

  const open = async () => {
    setBusy(true);
    try {
      const result = await controller.open(level, buyer?.id ?? null, chargeActive, visibility);
      refresh();
      report(
        formatMessage(`${K}.dialog.opened`, {
          count: result.summary.items.length,
          value: formatGp(result.summary.marketValue),
          verdict: localize(`${K}.${VERDICT_KEYS[result.summary.verdict]}`),
        })
      );
    } catch (error) {
      report(errorText(error), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Inner className="lootbox-inner">
      {!ready && (
        <Panel>
          <Heading>{localize(`${K}.dialog.noTablesTitle`)}</Heading>
          <Note>{localize(`${K}.dialog.noTablesHint`)}</Note>
          <Actions>
            <button type="button" disabled={busy} onClick={() => void build()}>
              <i className="fa-solid fa-table-list" /> {localize(`${K}.dialog.buildTables`)}
            </button>
          </Actions>
        </Panel>
      )}

      <Panel>
        <Heading>{localize(`${K}.dialog.box`)}</Heading>
        <Row>
          <span>{localize(`${K}.dialog.level`)}</span>
          <select value={level} onChange={(e) => setLevel(Number(e.target.value))}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {formatMessage(`${K}.dialog.levelOption`, { level: l, price: formatGp(priceFor(config, l)) })}
              </option>
            ))}
          </select>
        </Row>
        {odds && (
          <>
            <Stats>
              <Stat $tone="loss">
                <strong>{formatPercent(odds.pLoss)}</strong>
                <span>{localize(`${K}.dialog.oddsLoss`)}</span>
              </Stat>
              <Stat $tone="sell">
                <strong>{formatPercent(odds.pSellProfit)}</strong>
                <span>{localize(`${K}.dialog.oddsSell`)}</span>
              </Stat>
              <Stat $tone="value">
                <strong>{formatRatio(odds.valueRatio)}</strong>
                <span>{localize(`${K}.dialog.oddsValue`)}</span>
              </Stat>
            </Stats>
            {!meetsTargets(odds, config.targets) && <Note $warn>{localize(`${K}.dialog.offTarget`)}</Note>}
          </>
        )}
      </Panel>

      <Panel>
        <Heading>{localize(`${K}.dialog.buyer`)}</Heading>
        <Row>
          <span>{localize(`${K}.dialog.buyerLabel`)}</span>
          <select value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>
            <option value="">{localize(`${K}.dialog.noBuyer`)}</option>
            {buyers.map((b) => (
              <option key={b.id} value={b.id}>
                {formatMessage(`${K}.dialog.buyerOption`, { name: b.name, level: b.level, gold: formatGp(b.gold) })}
              </option>
            ))}
          </select>
        </Row>
        <CheckRow $disabled={!buyer}>
          <input type="checkbox" checked={charge} disabled={!buyer} onChange={(e) => setCharge(e.target.checked)} />
          {localize(`${K}.dialog.charge`)}
        </CheckRow>
        {shortOfMoney && buyer && (
          <Note $warn>{formatMessage(`${K}.errors.notEnoughMoney`, { name: buyer.name })}</Note>
        )}
        <Row>
          <span>{localize(`${K}.dialog.visibility`)}</span>
          <select value={visibility} onChange={(e) => setVisibility(normalizeChatVisibility(e.target.value))}>
            {CHAT_VISIBILITIES.map((v) => (
              <option key={v} value={v}>
                {localize(`${K}.visibility.${v}`)}
              </option>
            ))}
          </select>
        </Row>
      </Panel>

      {message && <Note $warn={message.warn}>{message.text}</Note>}

      <Actions>
        <button type="button" disabled={busy || !ready || shortOfMoney} onClick={() => void open()}>
          <i className="fa-solid fa-box-open" /> {formatMessage(`${K}.dialog.open`, { price: formatGp(price) })}
        </button>
        {ready && (
          <SecondaryButton type="button" disabled={busy} onClick={() => void build()}>
            <i className="fa-solid fa-rotate" /> {localize(`${K}.dialog.rebuildTables`)}
          </SecondaryButton>
        )}
      </Actions>
    </Inner>
  );
}
