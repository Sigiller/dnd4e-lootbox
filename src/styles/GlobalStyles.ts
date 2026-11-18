import { createGlobalStyle } from "styled-components";
import { lootboxTheme as t } from "./theme.js";

export const GlobalStyles = createGlobalStyle`
  .application.dnd4e-lootbox {
    font-family: ${t.fontFamily};

    .window-content {
      padding: 0;
      overflow: auto;
      display: block;
      height: auto;
      color: ${t.colourTextOnLight};
    }

    .lootbox-react-root,
    .lootbox-settings-root {
      display: block;
      background: ${t.gradient4e};
      color: ${t.colourTextOnLight};
    }
  }

  .application.dnd4e-lootbox-settings .window-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
`;
