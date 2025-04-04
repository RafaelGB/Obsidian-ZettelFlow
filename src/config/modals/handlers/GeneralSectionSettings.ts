// External imports
import { AbstractChain } from "architecture/patterns";
// Internal imports
import { SettingsHandlerInfo } from "config/typing";
import { CommunityTemplatesBrowserHandler } from "./general/CommunityTemplatesBrowserHandler";


export class GeneralSectionSettings extends AbstractChain<SettingsHandlerInfo> {
    protected starter = new CommunityTemplatesBrowserHandler();
    protected before(info: SettingsHandlerInfo): SettingsHandlerInfo {
        info.section = this;
        return info;
    }

    protected after(info: SettingsHandlerInfo): SettingsHandlerInfo {
        return info;
    }

    public refresh(info: SettingsHandlerInfo): void {
        info.containerEl.empty();
        this.starter.handle(info);
    }


}
const generalSectionSettings = new GeneralSectionSettings();
export default generalSectionSettings;