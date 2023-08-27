import { Menu, TFolder } from "obsidian";
import { SectionElement, ZettelFlowElement } from "./ZettelkastenOptionsModel";

export type StepBuilderInfo = {
    contentEl: HTMLElement,
    isRoot: boolean;
    element: Omit<SectionElement, 'color'>;
    filename?: string;
    folder?: TFolder;
    menu?: Menu,
} & Omit<ZettelFlowElement, 'children' | 'element'>;

export type StepSettings = {
    root: boolean
    element: SectionElement;
    label?: string
    targetFolder?: string
    childrenHeader?: string
}