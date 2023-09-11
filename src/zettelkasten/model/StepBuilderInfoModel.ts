import { Menu, TFolder } from "obsidian";
import { SectionElement, ZettelFlowElement } from "./ZettelkastenOptionsModel";

export type StepBuilderInfo = {
    contentEl: HTMLElement,
    isRoot: boolean;
    filename?: string;
    folder?: TFolder;
    menu?: Menu,
} & ZettelFlowElement;

export type StepSettings = {
    root: boolean
    element: SectionElement;
    label?: string
    targetFolder?: string
    childrenHeader?: string,
    optional?: boolean,
}