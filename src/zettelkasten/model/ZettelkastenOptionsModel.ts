import { Literal } from "architecture/plugin"
import { HexString } from "obsidian"

export type ZettelFlowElement = {
    path: string,
    label: string,
    childrenHeader: string,
    element: SectionElement,
    color?: HexString,
    targetFolder?: string,
    optional?: boolean,
}

export type SectionInfo = {
    title: string
}
export type ZoneOption = 'frontmatter' | 'body';

export type Action = {
    type: string,
    hasUI?: boolean,
    [key: string]: Literal
}
export type SectionElement = {
    type: string,
    hasUI?: boolean,
    label?: string,
    actions?: Action[],
    [key: string]: Literal,
}


export type AditionBaseElement = {
    key: string,
    label: string,
    zone: ZoneOption,
} & SectionElement;

export type PromptElement = {
    placeholder: string,
} & AditionBaseElement;

export type CalendarElement = AditionBaseElement;

export type SelectorElement = {
    options: Record<string, string>,
    defaultOption?: string,
} & AditionBaseElement;