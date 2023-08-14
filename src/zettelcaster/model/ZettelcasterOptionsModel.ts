export type ZettelFlowOptionMetadata = string | string[] | number | number[];

export type ZettelFlowOption = {
    label: string,
    targetFolder: string,
    frontmatter: Record<string, ZettelFlowOptionMetadata>,
    children: Record<string, ZettelFlowSection>
}

export type ZettelFlowSection = {
    element: SectionElement,
    frontmatter: Record<string, ZettelFlowOptionMetadata>,
    info: SectionInfo,
    children: Record<string, ZettelFlowSection>,
    optional?: boolean,
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
    options: Record<string, ZettelFlowSection>
}

export interface PromptElement extends SectionElement {
    type: 'prompt',
    placeholder: string,
}

export const DEFAULT_OPTIONS: Record<string, ZettelFlowOption> = {
    fleeting: {
        label: 'Fleeting note',
        targetFolder: '/zettelFlow/fleeting',
        frontmatter: {
            tags: 'zettelkasten/fleeting'
        },
        children: {
            meeting: {
                element: {
                    type: 'selector',
                },
                info: {
                    title: 'Work meeting'
                },
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
                info: {
                    title: 'Idea'
                },
                frontmatter: {
                    tags: 'idea'
                },
                children: {}
            }
        }
    },
    literature: {
        label: 'Literature note',
        targetFolder: '/zettelFlow/literature',
        frontmatter: {
            tags: 'zettelkasten/literature'
        },
        children: {}
    },
    permanent: {
        label: 'Permanent note',
        targetFolder: '/zettelFlow/permanent',
        frontmatter: {},
        children: {}
    }
}