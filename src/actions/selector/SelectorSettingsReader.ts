import { ActionSettingReader } from "architecture/api";
import { selectorDetails } from "./SelectorSettings";

export const selectorSettingsReader: ActionSettingReader = (contentEl, action) => {
    selectorDetails(contentEl, action, true);
}