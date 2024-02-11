import { Action } from "architecture/api";
import { Literal } from "architecture/plugin";
import { Flow, FlowNode } from "architecture/plugin/canvas";
import { HeaderType } from "application/components/header";
import { SectionType } from "application/components/section";
import ZettelFlow from "main";
import { FinalElement } from "application/notes";
import { NoteBuilder } from "application/notes/NoteBuilder";
import { ZettelFlowSettings } from "config";
import { SelectorMenuModal } from "zettelkasten";

export type NoteBuilderType = {
    plugin: ZettelFlow;
    modal: SelectorMenuModal;
    flow: Flow;
    enableTutorial?: boolean;
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
    actionType?: string;
    element?: FinalElement;
}
export type SectionElementOptions = {
    actionType?: string;
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
    setSectionElement: (element: JSX.Element, config: Partial<SectionElementOptions>) => void;
    setIsCreationMode: (mode: boolean) => void;
    goPrevious: () => void;
    build: (modal: SelectorMenuModal) => Promise<string>;
    manageNodeInfo: (selectedNode: FlowNode, skipAddToBuilder?: boolean) => void;
    addAction: (element: Action, callbackResult: Literal) => void;
    addBackgroundAction: (action: Action) => void;
    addJsFile: (path: string) => Promise<void>;
    initPluginConfig: (settings: ZettelFlowSettings) => Promise<void>;
    reset: () => void;
    setActionWasTriggered: (triggered: boolean) => void;
    setEnableSkip: (enable: boolean) => void;
    setCurrentNode: (node: FlowNode) => void;
}

export type NoteBuilderState = {
    creationMode: boolean;
    title: string;
    invalidTitle: boolean;
    currentAction: string;
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

export type TutorialType = Pick<NoteBuilderType, "plugin" | "modal">;

