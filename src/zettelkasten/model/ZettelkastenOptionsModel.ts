import { Literal } from "architecture/plugin"
import { HexString } from "obsidian"

export type ZettelFlowElement = {
    path: string,
    label: string,
    childrenHeader: string,
    element: SectionElement,
    targetFolder?: string,
    optional?: boolean,
}

export type SectionInfo = {
    title: string
}
export type TypeOption = 'bridge' | 'prompt' | 'calendar';

export interface SectionElement {
    type: TypeOption,
    color?: HexString,
    label?: string,
    triggered?: boolean,
    [key: string]: Literal,
}

export interface PromptElement extends SectionElement {
    key: string,
    label: string,
    placeholder: string,
}

export interface CalendarElement extends SectionElement {
    key: string,
    label: string,
}