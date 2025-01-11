import { Action } from "architecture/api"
import { AbstractChain } from "architecture/patterns"
import ZettelFlow from "main"
import { StepSettings } from "zettelkasten"

export type SettingsHandlerInfo = {
    containerEl: HTMLElement,
    plugin: ZettelFlow,
    section?: AbstractChain<SettingsHandlerInfo>
}

export interface ZettelFlowSettings {
    loggerEnabled: boolean,
    logLevel: string,
    uniquePrefixEnabled: boolean,
    tableOfContentEnabled: boolean,
    uniquePrefix: string,
    ribbonCanvas: string,
    editorCanvas: string,
    jsLibraryFolderPath: string,
    foldersFlowsPath: string,
    installedTemplates: InstalledTemplates,
}

export type InstalledTemplates = {
    steps: StepSettings[],
    actions: Action[],
}

export const DEFAULT_SETTINGS: Partial<ZettelFlowSettings> = {
    loggerEnabled: false,
    uniquePrefixEnabled: false,
    uniquePrefix: "YYYYMMDDHHmmss",
    foldersFlowsPath: "_ZettelFlow",
    tableOfContentEnabled: true,
    installedTemplates: {
        steps: [],
        actions: [],
    }
}