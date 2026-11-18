import type { Root } from "react-dom/client";
import { ThemeProvider } from "styled-components";
import { GlobalStyles } from "../styles/GlobalStyles.js";
import { lootboxTheme } from "../styles/theme.js";
import { LootboxSettingsRoot, type LootboxSettingsProps } from "./LootboxSettingsRoot.js";

export function renderLootboxSettings(root: Root, props: LootboxSettingsProps): void {
  root.render(
    <ThemeProvider theme={lootboxTheme}>
      <GlobalStyles />
      <LootboxSettingsRoot {...props} />
    </ThemeProvider>
  );
}
