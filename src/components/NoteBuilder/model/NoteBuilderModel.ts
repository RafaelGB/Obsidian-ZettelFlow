import { HeaderType, SectionType } from "components/core";
import ZettlelFlow from "main";
import { BuilderRoot } from "notes/NoteBuilder";
import { Modal } from "obsidian";
import { ZettelFlowElement } from "zettelkasten";
import { StoreApi, UseBoundStore } from "zustand";

export type NoteBuilderType = {
    plugin: ZettlelFlow;
    modal: Modal;
}

export type NoteBuilderProps = {
    store: NoteBuilderStore;
} & NoteBuilderType;

export type ElementBuilderProps = {
    childen: Record<string, ZettelFlowElement>,
    builder: BuilderRoot;
} & NoteBuilderProps;

export type ActionBuilderProps = {
    action: ZettelFlowElement;
    path: string;
    builder: BuilderRoot;
} & NoteBuilderProps;

export type SavedSection = {
    section: SectionType;
    header: HeaderType;
}
export type NoteBuilderState = {
    title: string;
    invalidTitle: boolean;
    targetFolder: string;
    previousSections: Map<number, SavedSection>;
    nextSections: Map<number, SavedSection>;
    section: SectionType;
    position: number;
    header: HeaderType;
    actions: {
        incrementPosition(): number;
        addBridge(): void;
        setTitle: (title: string) => void;
        setInvalidTitle: (invalid: boolean) => void;
        setTargetFolder: (folder: string) => void;
        setHeader: (header: Partial<HeaderType>) => void;
        setSectionElement: (element: JSX.Element, extra?: Partial<Omit<SectionType, "element" | "position">>) => void;
        goPrevious: () => void;
        goNext: () => void;
    }
}

export type NoteBuilderStore = UseBoundStore<StoreApi<NoteBuilderState>>;