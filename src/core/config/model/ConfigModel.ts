type ZettelFlowOptionMetadata={
    input:string, // TODO: investigate enums with typescript 5
    optional:boolean,
}

type ZettelFlowOption={
    label:string,
    relPath:string,
    metadata:ZettelFlowOptionMetadata[]
}

interface ZettelFlowConfig {
    baseDir:string,
    options:ZettelFlowOption[]
}