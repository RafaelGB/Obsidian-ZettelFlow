import { Literal } from "architecture/plugin"
import { HexString } from "obsidian"

export type ZettelFlowBase = {
    label: string,
    children: Record<string, ZettelFlowElement>,
    childrenHeader: string,
    element: SectionElement
}

export type ZettelFlowOption = {
    targetFolder: string,
} & ZettelFlowBase

export type ZettelFlowElement = {
    optional?: boolean,
} & ZettelFlowBase

export type SectionInfo = {
    title: string
}
export type TypeOption = 'bridge' | 'prompt';
export interface SectionElement {
    type: TypeOption,
    color: HexString,
    label?: string,
    triggered?: boolean,
    [key: string]: Literal,
}

export interface PromptElement extends SectionElement {
    type: 'prompt',
    placeholder: string,
    key: string,
}

export const DEFAULT_OPTIONS: Record<string, ZettelFlowOption> = {
}