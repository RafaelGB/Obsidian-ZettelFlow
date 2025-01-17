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
    communitySettings: {
        url: string,
    }
}

export type CommunityTemplateOptions = {
    _id: string;
    title: string;
    description: string;
    author: string,
    downloads: number;
    isSelf?: boolean;
    type: "step" | "action";
}

export type CommunityStepSettings = StepSettings & CommunityTemplateOptions;
export type CommunityAction = Action & CommunityTemplateOptions;

export type InstalledTemplates = {
    steps: Record<string, CommunityStepSettings>;
    actions: Record<string, CommunityAction>;
}

export const DEFAULT_SETTINGS: Partial<ZettelFlowSettings> = {
    loggerEnabled: false,
    uniquePrefixEnabled: false,
    uniquePrefix: "YYYYMMDDHHmmss",
    foldersFlowsPath: "_ZettelFlow",
    tableOfContentEnabled: true,
    installedTemplates: {
        steps: {},
        actions: {}
    },
    communitySettings: {
        url: "http://127.0.0.1:8000"
    }
}