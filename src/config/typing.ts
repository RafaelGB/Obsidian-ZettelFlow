import { AbstractChain } from "architecture/patterns"
import ZettelFlow from "main"

export type SettingsHandlerInfo = {
    containerEl: HTMLElement,
    plugin: ZettelFlow,
    section?: AbstractChain<SettingsHandlerInfo>
}

export interface ZettelFlowSettings {
    loggerEnabled: boolean,
    logLevel: string,
    uniquePrefixEnabled: boolean,
    uniquePrefix: string,
    ribbonCanvas: string,
    canvasFilePath?: string,
}

export const DEFAULT_SETTINGS: Partial<ZettelFlowSettings> = {
    loggerEnabled: false,
    uniquePrefixEnabled: false,
    uniquePrefix: "YYYYMMDDHHmmss",
}