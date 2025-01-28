import { ActionSettingReader } from "architecture/api";
import { numberDetails } from "./NumberSettings";

export const numberSettingsReader: ActionSettingReader = (contentEl, action) => {
    numberDetails(contentEl, action, true);
}