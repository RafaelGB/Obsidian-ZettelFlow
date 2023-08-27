import { SectionElement, ZettelFlowElement } from "./ZettelkastenOptionsModel";

export type StepBuilderInfo = {
    isRoot: boolean;
    element: Omit<SectionElement, 'color'>;
} & Omit<ZettelFlowElement, 'children' | 'element'>;