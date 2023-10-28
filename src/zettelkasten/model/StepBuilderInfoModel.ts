import { Menu, TFolder } from "obsidian";
import { SectionElement, ZettelFlowElement } from "./ZettelkastenOptionsModel";
import { Action } from "architecture/api";

export type StepBuilderInfo = {
    contentEl: HTMLElement,
    isRoot: boolean;
    filename?: string;
    folder?: TFolder;
    menu?: Menu,
} & ZettelFlowElement;

export type StepSettings = {
    root: boolean
    actions: Action[],
    element: SectionElement;
    label?: string
    targetFolder?: string
    childrenHeader?: string,
    optional?: boolean,
}