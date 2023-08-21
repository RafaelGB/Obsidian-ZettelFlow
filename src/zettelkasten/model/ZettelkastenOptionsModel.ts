export type ZettelFlowOptionMetadata = string | string[] | number | number[];

export type ZettelFlowBase = {
    label: string,
    frontmatter: Record<string, ZettelFlowOptionMetadata>,
    children: Record<string, ZettelFlowElement>,
    childrenHeader: string,
}

export type ZettelFlowOption = {
    targetFolder: string,
} & ZettelFlowBase

export type ZettelFlowElement = {
    element: SectionElement,
    optional?: boolean,
} & ZettelFlowBase

export type SectionInfo = {
    title: string
}

export interface SectionElement {
    type: string,
    placeholder?: string,
}

export interface SelectorElement extends SectionElement {
    type: 'selector',
    options: Record<string, ZettelFlowElement>
}

export interface PromptElement extends SectionElement {
    type: 'prompt',
    placeholder: string,
}

export const DEFAULT_OPTIONS: Record<string, ZettelFlowOption> = {
    fleeting: {
        label: 'Fleeting note',
        targetFolder: '/zettelFlow/fleeting/',
        frontmatter: {
            tags: 'zettelkasten/fleeting'
        },
        children: {
            meeting: {
                element: {
                    type: 'selector',
                },
                label: 'Work meeting',
                frontmatter: {
                    tags: 'meeting'
                },
                children: {},
                childrenHeader: '',
            },
            idea: {
                element: {
                    type: 'prompt',
                    placeholder: 'What is the idea?'
                },
                label: 'Idea',
                frontmatter: {
                    tags: 'idea'
                },
                children: {},
                childrenHeader: ''
            }
        },
        childrenHeader: 'What kind of fleeting note is this?'
    },
    literature: {
        label: 'Literature note',
        targetFolder: '/zettelFlow/literature/',
        frontmatter: {
            tags: 'zettelkasten/literature'
        },
        children: {},
        childrenHeader: ''
    }
}