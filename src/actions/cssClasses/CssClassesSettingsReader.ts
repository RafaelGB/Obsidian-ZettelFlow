import { ActionSettingReader } from "architecture/api";
import { cssClassesDetails } from "./CssClassesSettings";

export const cssClassesSettingsReader: ActionSettingReader = (contentEl, action) => {
    cssClassesDetails(contentEl, action, true);
}