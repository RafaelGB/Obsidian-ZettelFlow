import { Action } from "architecture/api";
import { Literal } from "architecture/plugin";
import { HeaderType } from "components/header";
import { SectionType } from "components/section";
import { WorkflowStep } from "config";
import ZettelFlow from "main";
import { FinalElement } from "notes";
import { NoteBuilder } from "notes/NoteBuilder";
import { Modal } from "obsidian";
import { ZettelFlowElement } from "zettelkasten";

export type NoteBuilderType = {
    plugin: ZettelFlow;
    modal: Modal;
}

export type ElementBuilderProps = {
    childen: WorkflowStep[],

} & NoteBuilderType;

export type ActionBuilderProps = {
    action: Action;
    position: number;
    actionStep: WorkflowStep;
} & NoteBuilderType;

export type WrappedActionBuilderProps = {
    callback: (value: unknown) => void;
} & ActionBuilderProps;

export type SavedSection = {
    section: SectionType;
    header: HeaderType;
    isAction: boolean;
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
    addBridge: (uniqueChild: ZettelFlowElement) => void;
    setTitle: (title: string) => void;
    setInvalidTitle: (invalid: boolean) => void;
    setTargetFolder: (folder: string | undefined) => void;
    setHeader: (header: Partial<HeaderType>) => void;
    setSectionElement: (element: JSX.Element, config?: Partial<SectionElementOptions>) => void;
    goPrevious: () => void;
    build: () => Promise<string>;
    manageElementInfo: (selectedElement: ZettelFlowElement, skipAddToBuilder?: boolean) => void;
    addElement: (element: Action, callbackResult: Literal) => void;
    addBackgroundAction: (action: Action) => void;
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