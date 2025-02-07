import { ActionSettingReader } from "architecture/api";
import { taskManagementDetails } from "./TaskManagementSettings";

export const taskManagementSettingsReader: ActionSettingReader = (contentEl, action) => {
    taskManagementDetails(contentEl, action, true);
}