import { DEFAULT_OPTIONS, ZettelFlowOption } from "domain/zettelcaster"

export interface ZettelFlowSettings{
    loggerEnabled:boolean,
    logLevel:string,
    baseDir:string,
    options:Record<string, ZettelFlowOption>
}

export const DEFAULT_SETTINGS:Partial<ZettelFlowSettings>={
    loggerEnabled:false,
    baseDir:"/",
    options: DEFAULT_OPTIONS
}