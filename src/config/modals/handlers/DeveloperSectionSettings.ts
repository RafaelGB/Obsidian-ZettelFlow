// External imports
import { AbstractChain } from "architecture/patterns";
import { c } from "architecture";
import { t } from "architecture/lang";
// Internal imports
import { SettingsHandlerInfo } from "config/typing";
import { LoggerToggleHandler } from "./developer/LoggerToggleHandler";


export class DeveloperSectionSettings extends AbstractChain<SettingsHandlerInfo> {
    private sectionContainer: HTMLElement;
    private parentContainer: HTMLElement;
    protected starter = new LoggerToggleHandler();
    protected before(info: SettingsHandlerInfo): SettingsHandlerInfo {
        info.section = this;
        this.parentContainer = info.containerEl;

        // Section title
        info.containerEl.createEl('h2', { text: t('developer_section_title') });

        // Section container
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
const developerSectionSettings = new DeveloperSectionSettings();
export default developerSectionSettings;