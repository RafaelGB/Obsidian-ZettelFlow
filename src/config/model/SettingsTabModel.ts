import { AbstractChain } from "architecture/patterns"
import ZettelFlow from "main"

export type SettingsHandlerInfo = {
    containerEl: HTMLElement,
    plugin: ZettelFlow,
    section?: AbstractChain<SettingsHandlerInfo>
}
