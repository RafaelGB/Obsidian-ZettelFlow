import { ActionSettingReader } from "architecture/api";
import { zettelIdDetails } from "./ZettelIdSettings";

export const zettelIdSettingsReader: ActionSettingReader = (contentEl, action) => {
    zettelIdDetails(contentEl, action, true);
};
