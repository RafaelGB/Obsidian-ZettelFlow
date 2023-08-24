import { Literal } from "architecture/plugin"

export type ZettelFlowBase = {
    label: string,
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
export type TypeOption = 'bridge' | 'prompt';
export interface SectionElement {
    type: TypeOption,
    [key: string]: Literal,
}

export interface PromptElement extends SectionElement {
    type: 'prompt',
    placeholder: string,
    key: string,
}

export const DEFAULT_OPTIONS: Record<string, ZettelFlowOption> = {
}