import { Menu, TFolder } from "obsidian";
import { Action } from "architecture/api";
import { ZettelNodeType } from "architecture/plugin"
import { HexString } from "obsidian"

export type StepBuilderInfo = {
    type: string,
    contentEl: HTMLElement,
    filename?: string;
    folder?: TFolder;
    menu?: Menu,
    nodeId?: string,
} & StepSettings;

export type StepSettings = {
    root: boolean
    actions: Action[],
    label: string
    targetFolder?: string
    childrenHeader?: string,
    optional?: boolean,
}

export type ZettelFlowElement = {
    type: ZettelNodeType,
    childrenHeader: string,
    label: string,
    tooltip?: string,
    actions: Action[],
    color?: HexString,
    targetFolder?: string,
    optional?: boolean,
    // EXCLUSIVE FOR FILE
    path?: string,
    // EXCLUSIVE FOR EMBED NODE
    yaml?: string,
}

export type SectionInfo = {
    title: string
}
export type ZoneOption = 'frontmatter' | 'body';


export type AditionBaseElement = {
    key: string,
    label: string,
    zone: ZoneOption,
} & Action;

export type PromptElement = {
    placeholder: string,
} & AditionBaseElement;

export type CalendarElement = {
    enableTime: boolean,
} & AditionBaseElement;

export type SelectorElement = {
    options: [string, string][],
    defaultOption?: string,
} & AditionBaseElement;