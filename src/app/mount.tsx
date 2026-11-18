import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "styled-components";
import { GlobalStyles } from "../styles/GlobalStyles.js";
import { lootboxTheme } from "../styles/theme.js";
import { LootboxRoot, type LootboxProps } from "./LootboxRoot.js";

let host: HTMLElement | null = null;
let root: Root | null = null;

export function mountLootbox(element: HTMLElement, props: LootboxProps): void {
  if (host !== element) {
    unmountLootbox();
    host = element;
    root = createRoot(element);
  }
  root?.render(
    <ThemeProvider theme={lootboxTheme}>
      <GlobalStyles />
      <LootboxRoot {...props} />
    </ThemeProvider>
  );
}

export function unmountLootbox(): void {
  root?.unmount();
  root = null;
  host = null;
}
