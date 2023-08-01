export type ZettelFlowOptionMetadata={
    input:string, // TODO: investigate enums with typescript 5
    message:string,
    optional?:boolean,
}

export type ZettelFlowOption={
    label:string,
    relPath:string,
    frontmatter:Record<string, ZettelFlowOptionMetadata>
}

export const DEFAULT_OPTIONS:Record<string, ZettelFlowOption>={
    fleeting: {
        label:'Fleeting note',
        relPath:'/zettelFlow/fleeting',
        frontmatter:{
            Type:{
                input:'tag',
                message:'#zettelcaster/fleeting'
            }
        }
    }
}