import { ActionSettingReader } from "architecture/api";
import { checkboxDetails } from "./CheckboxSettings";

export const checkboxSettingsReader: ActionSettingReader = (contentEl, action) => {
    checkboxDetails(contentEl, action, true);
}