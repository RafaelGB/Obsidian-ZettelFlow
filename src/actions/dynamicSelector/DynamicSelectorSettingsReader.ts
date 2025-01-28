import { ActionSettingReader } from "architecture/api";
import { dynamicSelectorDetails } from "./DynamicSelectorSettings";

export const dynamicSelectorSettingsReader: ActionSettingReader = (contentEl, action) => {
    dynamicSelectorDetails(contentEl, action, true);
}