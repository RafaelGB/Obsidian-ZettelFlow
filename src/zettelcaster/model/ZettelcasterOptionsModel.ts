export type ZettelFlowOptionMetadata = {
    input: string, // TODO: investigate enums with typescript 5
    message: string,
    optional?: boolean,
}

export type ZettelFlowOption = {
    label: string,
    relPath: string,
    frontmatter: Record<string, ZettelFlowOptionMetadata>,
    children?: ZettelFlowSection
}

export type ZettelFlowSection = {
    element: SectionElement,
    frontmatter: Record<string, ZettelFlowOptionMetadata>,
    info?: SectionInfo,
    children?: ZettelFlowSection
}

export type SectionInfo = {
    level: number,
    title: string
}

export interface SectionElement {
    type: string,
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
        relPath: '/zettelFlow/fleeting',
        frontmatter: {
            Type: {
                input: 'tag',
                message: '#zettelcaster/fleeting'
            }
        }
    }
}