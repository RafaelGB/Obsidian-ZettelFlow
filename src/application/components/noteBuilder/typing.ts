import { Action } from "architecture/api";
import { Literal } from "architecture/plugin";
import { Flow, FlowNode } from "architecture/plugin/canvas";
import { HeaderType } from "application/components/header";
import { SectionType } from "application/components/section";
import ZettelFlow from "main";
import { FinalElement } from "application/notes";
import type { DraftSnapshot, WizardDraft } from "application/notes/draftState";
import type { BufferedVerdict, SuggestionVerdict } from "application/notes/suggestionVerdicts";
import type { RedoEntry } from "application/components/noteBuilder/walkHistory";
import type { HiddenBranch } from "application/notes/branchVisibility";
import type { JudgementConfidence } from "architecture/knowledge/judgement/Judgement";
import { NoteBuilder } from "application/notes/NoteBuilder";
import { ZettelFlowSettings } from "config";
import { SelectorMenuModal } from "zettelkasten";
import { JSX } from "react";

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
    /** The canvas node this step came from (#410) — what a resumed draft navigates back to. */
    nodeId?: string;
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
    /**
     * Record a verdict on a suggested connection (#411, §XII). Buffered until the note exists;
     * a session that never builds records nothing.
     */
    judgeSuggestion: (
        targetPath: string,
        verdict: SuggestionVerdict,
        detail?: { note?: string; confidence?: JudgementConfidence }
    ) => void;
    /** Write the buffered verdicts against the created note. */
    flushSuggestionVerdicts: (notePath: string) => void;
    /** Record the branches a closed condition removed from the current step (#414). */
    setHiddenBranches: (hidden: HiddenBranch[]) => void;
    /** Return to a step already walked, discarding the answers given after it (#413). */
    jumpToStep: (index: number) => void;
    /** Step forward into the step just stepped out of, while no new answer has been given (#413). */
    redo: () => void;
    /** Freeze the session so it survives closing the modal (#410). */
    snapshotDraft: (canvasPath: string) => DraftSnapshot;
    /** Put a stored draft back: results restored, actions never re-run (#410). */
    restoreFromDraft: (draft: WizardDraft) => void;
    addBridge: (uniqueChild: FlowNode) => void;
    setTitle: (title: string) => void;
    setInvalidTitle: (invalid: boolean) => void;
    setTargetFolder: (folder: string | undefined) => void;
    setHeader: (header: Partial<HeaderType>) => void;
    setVisualSection: (section: SectionType) => void;
    setSectionElement: (element: JSX.Element, config: Partial<SectionElementOptions>) => void;
    setIsCreationMode: (mode: boolean) => void;
    goPrevious: () => void;
    build: (modal: SelectorMenuModal) => Promise<string>;
    manageNodeInfo: (selectedNode: FlowNode, skipAddToBuilder?: boolean) => void;
    addAction: (element: Action, callbackResult: Literal) => void;
    addBackgroundAction: (action: Action) => void;
    addJsFile: (path: string) => Promise<void>;
    initPluginConfig: (settings: ZettelFlowSettings, currentFolder?: string) => Promise<void>;
    reset: () => void;
    setActionWasTriggered: (triggered: boolean) => void;
    setEnableSkip: (enable: boolean) => void;
    setCurrentNode: (node: FlowNode) => void;
    setActiveContext: (canvasName: string, stepName: string) => void;
    // Companion pane: record a chosen connection link and bump the preview (#127)
    insertLink: (basename: string) => void;
    // Progress bar actions
    pbFinishElement: () => void;
}

export type NoteBuilderState = {
    /** Verdicts on suggested connections, pending the note's creation (#411). */
    suggestionVerdicts: BufferedVerdict[];
    /** Steps stepped back out of, so they can be stepped into again (#413). */
    redoStack: RedoEntry<SavedSection>[];
    /** Branches a closed condition removed from this step, and why (#414). */
    hiddenBranches: HiddenBranch[];
    creationMode: boolean;
    title: string;
    invalidTitle: boolean;
    currentAction: string;
    previousSections: Map<number, SavedSection>;
    previousArray: number[];
    section: SectionType;
    enableSkip: boolean;
    position: number;
    /** Increments whenever a connection link is inserted, so the preview re-assembles (#127). */
    linkVersion: number;
    pbValue: number;
    pbElements: number;
    pbElementsDone: number;
    header: HeaderType;
    builder: NoteBuilder;
    currentNode?: FlowNode;
    activeCanvasName: string;
    activeStepName: string;
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

