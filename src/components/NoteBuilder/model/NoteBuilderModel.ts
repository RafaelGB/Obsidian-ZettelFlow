import { Literal } from "architecture/plugin";
import { HeaderType, SectionType } from "components/core";
import { WorkflowStep } from "config";
import ZettlelFlow from "main";
import { FinalElement } from "notes";
import { NoteBuilder } from "notes/NoteBuilder";
import { Modal } from "obsidian";
import { SectionElement, ZettelFlowElement } from "zettelkasten";

export type NoteBuilderType = {
    plugin: ZettlelFlow;
    modal: Modal;
}

export type ElementBuilderProps = {
    childen: WorkflowStep[],

} & NoteBuilderType;

export type ActionBuilderProps = {
    action: ZettelFlowElement;
    actionStep: WorkflowStep;
} & NoteBuilderType;

export type SavedSection = {
    section: SectionType;
    header: HeaderType;
    path: string;
    element?: FinalElement;
}
export type SectionElementOptions = {
    savePrevious?: boolean;
    isOptional?: boolean;
}
export type NoteBuilderStateInfo = {
    wasActionTriggered: () => boolean;
    getTitle: () => string;
    getCurrentStep: () => WorkflowStep | undefined;
}

export type NoteBuilderStateActions = {
    incrementPosition(): number;
    addBridge(): void;
    setTitle: (title: string) => void;
    setInvalidTitle: (invalid: boolean) => void;
    setTargetFolder: (folder: string | undefined) => void;
    setHeader: (header: Partial<HeaderType>) => void;
    setSectionElement: (element: JSX.Element, config?: Partial<SectionElementOptions>) => void;
    goPrevious: () => void;
    build: () => Promise<string>;
    manageElementInfo: (selectedElement: ZettelFlowElement, skipAddToBuilder?: boolean) => void;
    addElement: (element: SectionElement, callbackResult: Literal) => void;
    setPatternPrefix: (prefix: string) => void;
    reset: () => void;
    setActionWasTriggered: (triggered: boolean) => void;
    setEnableSkip: (enable: boolean) => void;
    setCurrentStep: (step: WorkflowStep) => void;
}

export type NoteBuilderState = {
    title: string;
    invalidTitle: boolean;
    previousSections: Map<number, SavedSection>;
    previousArray: number[];
    section: SectionType;
    enableSkip: boolean;
    position: number;
    header: HeaderType;
    builder: NoteBuilder;
    currentStep?: WorkflowStep;
    actionWasTriggered: boolean;
    actions: NoteBuilderStateActions;
    data: NoteBuilderStateInfo;
}

export type CallbackPickedState = Pick<
    NoteBuilderState,
    "actions" | "data"
>;

export type StoreNoteBuilderModifier = (
    partial: NoteBuilderState | Partial<NoteBuilderState>
) => void;