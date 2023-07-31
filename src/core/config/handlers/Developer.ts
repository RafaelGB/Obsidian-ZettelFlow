import { AbstractChain, AbstractHandler } from "architecture/patterns";
import { SettingsHandlerInfo } from "../model/SettingsTabModel";
import { LoggerToggleHandler } from "./developer/LoggerToggleHandler";

export class Developer extends AbstractChain<SettingsHandlerInfo> {

    protected starter(): AbstractHandler<SettingsHandlerInfo> {
        return new LoggerToggleHandler();
    }
}
const developer = new Developer();
export default developer;