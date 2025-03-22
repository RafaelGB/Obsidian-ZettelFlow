import { log } from "architecture";
import { AbstractHandlerClass } from "architecture/patterns";
import { SettingsHandlerInfo } from "config/typing";

export class AddPropertyHookHandler extends AbstractHandlerClass<SettingsHandlerInfo> {
    name = "Folders and Flows Path";
    description = "Select the path to the folders and flows";
    handle(info: SettingsHandlerInfo): SettingsHandlerInfo {
        const { plugin } = info;
        log.info("AddPropertyHookHandler", "handle", "info", info);
        return this.goNext(info);
    }
}