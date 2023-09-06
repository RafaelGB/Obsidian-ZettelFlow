import { Literal } from "architecture/plugin";
import { HeaderType, SectionType } from "components/core";
import { WorkflowStep } from "config";
import ZettlelFlow from "main";
import { BuilderRoot } from "notes/NoteBuilder";
import { FinalElement } from "notes/model/FinalNoteModel";
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
export type NoteBuilderState = {
    title: string;
    invalidTitle: boolean;
    previousSections: Map<number, SavedSection>;
    nextSections: Map<number, SavedSection>;
    section: SectionType;
    position: number;
    header: HeaderType;
    builder: BuilderRoot;
    actions: {
        incrementPosition(): number;
        addBridge(): void;
        setTitle: (title: string) => void;
        setInvalidTitle: (invalid: boolean) => void;
        setTargetFolder: (folder: string | undefined) => void;
        setHeader: (header: Partial<HeaderType>) => void;
        setSectionElement: (element: JSX.Element) => void;
        goPrevious: () => void;
        goNext: () => void;
        build: () => Promise<void>;
        manageElementInfo: (selectedElement: ZettelFlowElement) => void;
        addElement: (element: SectionElement, callbackResult: Literal) => void;
        setPatternPrefix: (prefix: string) => void;
        reset: () => void;
    }
}

export type StoreNoteBuilderModifier = (
    partial: NoteBuilderState | Partial<NoteBuilderState>
) => void;