import { FileService } from "architecture/plugin";
import { FlowNode } from "architecture/plugin/canvas";
export type WorkflowStep = {
    id: string,
    isRecursive?: boolean,
    children?: WorkflowStep[],
}

export interface ZettelFlowSettings {
    loggerEnabled: boolean,
    logLevel: string,
    uniquePrefixEnabled: boolean,
    uniquePrefix: string,
    baseDir: string,
    canvasFilePath: string,
    nodes: Record<string, FlowNode>,
    workflow: WorkflowStep[]
}

export const DEFAULT_SETTINGS: Partial<ZettelFlowSettings> = {
    loggerEnabled: false,
    baseDir: FileService.PATH_SEPARATOR,
    uniquePrefixEnabled: false,
    uniquePrefix: "YYYYMMDDHHmmss",
    nodes: {}
}