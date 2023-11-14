import { AbstractChain } from "architecture/patterns"
import { FileService } from "architecture/plugin";
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
    baseDir: string,
    canvasFilePath: string,
}

export const DEFAULT_SETTINGS: Partial<ZettelFlowSettings> = {
    loggerEnabled: false,
    baseDir: FileService.PATH_SEPARATOR,
    uniquePrefixEnabled: false,
    uniquePrefix: "YYYYMMDDHHmmss",
}