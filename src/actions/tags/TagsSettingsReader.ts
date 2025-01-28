import { ActionSettingReader } from "architecture/api";
import { tagsDetails } from "./TagsSettings";

export const tagsSettingsReader: ActionSettingReader = (contentEl, action) => {
    tagsDetails(contentEl, action, true);
}