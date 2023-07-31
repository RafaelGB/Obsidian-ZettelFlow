import { AbstractChain, AbstractHandler } from "architecture/patterns";
import { SettingsHandlerInfo } from "../model/SettingsTabModel";
import { LoggerToggleHandler } from "./developer/LoggerToggleHandler";
import { c } from "architecture";

export class Developer extends AbstractChain<SettingsHandlerInfo> {
    private sectionContainer: HTMLElement;
    private parentContainer: HTMLElement;
    protected starter = new LoggerToggleHandler();
    protected before(info: SettingsHandlerInfo): SettingsHandlerInfo {
        info.section = this;
        this.parentContainer = info.containerEl;
        this.sectionContainer = info.containerEl.createDiv();
        this.sectionContainer.addClass(c('settings-developer-section'));
        info.containerEl = this.sectionContainer;
        return info;
    }

    protected after(info: SettingsHandlerInfo): SettingsHandlerInfo {
        info.containerEl = this.parentContainer;
        return info;
    }

    public refresh(info: SettingsHandlerInfo): void {
        this.sectionContainer.empty();
        info.containerEl = this.sectionContainer;
        this.starter.handle(info);
    }


}
const developer = new Developer();
export default developer;