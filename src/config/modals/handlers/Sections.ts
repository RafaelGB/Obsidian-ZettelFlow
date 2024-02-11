// External imports
import { AbstractChain } from "architecture/patterns";
// Internal imports
import { SettingsHandlerInfo } from "config/typing";
import { RibbonCanvasFileSelectorHandler } from "./sections/RibbonCanvasFileSelectorHandler";


export class Sections extends AbstractChain<SettingsHandlerInfo> {
    private sectionContainer: HTMLElement;
    private parentContainer: HTMLElement;
    protected starter = new RibbonCanvasFileSelectorHandler();
    protected before(info: SettingsHandlerInfo): SettingsHandlerInfo {
        info.section = this;
        this.parentContainer = info.containerEl;
        this.sectionContainer = info.containerEl.createDiv();
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
const sections = new Sections();
export default sections;