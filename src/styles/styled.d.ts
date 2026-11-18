import "styled-components";
import type { LootboxTheme } from "./theme.js";

declare module "styled-components" {
  export interface DefaultTheme extends LootboxTheme {}
}
