import type { BoxVerdict } from "./resolve.js";
import type { Rarity } from "../model/types.js";

const GP = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export function formatGp(value: number): string {
  return `${GP.format(value)} gp`;
}

export function formatPercent(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

export function formatRatio(ratio: number): string {
  return `${ratio.toFixed(2)}×`;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const RARITY_KEYS: Readonly<Record<Rarity, string>> = {
  common: "rarity.common",
  uncommon: "rarity.uncommon",
  rare: "rarity.rare",
};

export const VERDICT_KEYS: Readonly<Record<BoxVerdict, string>> = {
  loss: "verdict.loss",
  marketProfit: "verdict.marketProfit",
  sellProfit: "verdict.sellProfit",
};
