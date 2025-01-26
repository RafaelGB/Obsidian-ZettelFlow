import { ActionSettingReader } from "architecture/api";
import { calendarDetails } from "./CalendarSettings";

export const calendarSettingsReader: ActionSettingReader = (contentEl, action) => {
    calendarDetails(contentEl, action, true);
}