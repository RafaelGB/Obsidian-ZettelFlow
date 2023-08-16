export type ZettelFlowOptionMetadata = string | string[] | number | number[];

export type ZettelFlowOption = {
    label: string,
    targetFolder: string,
    frontmatter: Record<string, ZettelFlowOptionMetadata>,
    children: Record<string, ZettelFlowElement>,
    childrenHeader: string
}

export type ZettelFlowElement = {
    label: string,
    element: SectionElement,
    frontmatter: Record<string, ZettelFlowOptionMetadata>,
    children: Record<string, ZettelFlowElement>,
    childrenHeader?: string,
    optional?: boolean,
    templatePath?: string
}

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
                children: {}
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
                children: {}
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
    },
    permanent: {
        label: 'Permanent note',
        targetFolder: '/zettelFlow/permanent/',
        frontmatter: {},
        children: {},
        childrenHeader: ''
    }
}