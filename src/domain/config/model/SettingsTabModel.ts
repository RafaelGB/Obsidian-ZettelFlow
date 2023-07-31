import { AbstractChain } from "architecture/patterns"
import ZettlelFlow from "main"

export type SettingsHandlerInfo = {
    containerEl: HTMLElement,
    plugin: ZettlelFlow,
    section?: AbstractChain<SettingsHandlerInfo>
}
