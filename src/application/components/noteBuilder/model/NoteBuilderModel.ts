import { Action } from "architecture/api";
import { Literal } from "architecture/plugin";
import { Flow, FlowNode } from "architecture/plugin/canvas";
import { HeaderType } from "application/components/header";
import { SectionType } from "components/section";
import ZettelFlow from "main";
import { FinalElement } from "application/notes";
import { NoteBuilder } from "application/notes/NoteBuilder";
import { Modal } from "obsidian";

export type NoteBuilderType = {
    plugin: ZettelFlow;
    modal: Modal;
    flow: Flow;
}

export type ElementBuilderProps = {
    childen: FlowNode[],
} & NoteBuilderType;

export type ActionBuilderProps = {
    action: Action;
    node: FlowNode;
    position: number;
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
    getCurrentNode: () => FlowNode | undefined;
}

export type NoteBuilderStateActions = {
    addBridge: (uniqueChild: FlowNode) => void;
    setTitle: (title: string) => void;
    setInvalidTitle: (invalid: boolean) => void;
    setTargetFolder: (folder: string | undefined) => void;
    setHeader: (header: Partial<HeaderType>) => void;
    setSectionElement: (element: JSX.Element, config?: Partial<SectionElementOptions>) => void;
    goPrevious: () => void;
    build: () => Promise<string>;
    manageNodeInfo: (selectedNode: FlowNode, skipAddToBuilder?: boolean) => void;
    addAction: (element: Action, callbackResult: Literal) => void;
    addBackgroundAction: (action: Action) => void;
    setPatternPrefix: (prefix: string) => void;
    reset: () => void;
    setActionWasTriggered: (triggered: boolean) => void;
    setEnableSkip: (enable: boolean) => void;
    setCurrentNode: (node: FlowNode) => void;
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
    currentNode?: FlowNode;
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