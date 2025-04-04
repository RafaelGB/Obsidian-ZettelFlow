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
    // EXCLUSIVE for COMMUNITY installed steps
    title?: string,
    description?: string,
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
export type ZoneOption = 'frontmatter' | 'body' | 'context';

type StaticType = {
    staticBehaviour: boolean,
    staticValue?: string,

}
export type AditionBaseElement = {
    key: string,
    label: string,
    zone: ZoneOption,
} & Action & StaticType;

export type TagsElement = {
    staticValue?: string[],
} & StaticType & Action;

export type PromptElement = {
    placeholder: string,
} & AditionBaseElement;

export type NumberElement = {
    placeholder: string,
    staticValue?: number,
} & AditionBaseElement;

export type CalendarElement = {
    enableTime: boolean,
    format: string,
} & AditionBaseElement;

export type SelectorElement = {
    options: [string, string][],
    defaultOption?: string,
    multiple?: boolean,
} & AditionBaseElement;

export type DynamicSelectorElement = {
    code: string,
    multiple?: boolean,
} & AditionBaseElement;

export type CheckboxElement = {
    confirmTooltip: string,
    staticValue?: boolean,
} & AditionBaseElement;