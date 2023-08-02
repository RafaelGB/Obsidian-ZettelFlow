import { DEFAULT_OPTIONS, ZettelFlowOption } from "zettelcaster";

export interface ZettelFlowSettings{
    loggerEnabled:boolean,
    logLevel:string,
    baseDir:string,
    rootSection:Record<string, ZettelFlowOption>
}

export const DEFAULT_SETTINGS:Partial<ZettelFlowSettings>={
    loggerEnabled:false,
    baseDir:"/",
    rootSection: DEFAULT_OPTIONS
}