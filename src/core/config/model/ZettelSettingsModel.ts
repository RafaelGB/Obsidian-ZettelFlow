type ZettelFlowOptionMetadata={
    input:string, // TODO: investigate enums with typescript 5
    optional:boolean,
}

type ZettelFlowOption={
    label:string,
    relPath:string,
    metadata:Record<string, ZettelFlowOptionMetadata>
}

export interface ZettelFlowSettings{
    loggerEnabled:boolean,
    logLevel:string,
    baseDir:string,
    options:Record<string, ZettelFlowOption>
}

export const DEFAULT_SETTINGS:Partial<ZettelFlowSettings>={
    loggerEnabled:false,
    baseDir:"/",
    options:{
    }
}