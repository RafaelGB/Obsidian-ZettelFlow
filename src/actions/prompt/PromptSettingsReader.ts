import { ActionSettingReader } from "architecture/api";
import { promptDetails } from "./PromptSettings";

export const promptSettingsReader: ActionSettingReader = (contentEl, action) => {
    promptDetails(contentEl, action, true);
}