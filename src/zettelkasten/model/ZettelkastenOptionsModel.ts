import { Literal } from "architecture/plugin";

export type ZettelFlowBase = {
    label: string,
    frontmatter: Record<string, Literal>,
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

export interface PromptElement extends SectionElement {
    type: 'prompt',
    placeholder: string,
}

export const DEFAULT_OPTIONS: Record<string, ZettelFlowOption> = {
}