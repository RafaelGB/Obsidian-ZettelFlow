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
    builder: BuilderRoot;
} & NoteBuilderType;

export type ElementBuilderProps = {
    childen: Record<string, ZettelFlowElement>,
} & NoteBuilderProps;

export type ActionSelectorProps = {
    action: ZettelFlowElement;
} & NoteBuilderProps;

export type NoteBuilderState = {
    title: string;
    targetFolder: string;
    section: SectionType;
    header: HeaderType;
    actions: {
        setTitle: (title: string) => void;
        setTargetFolder: (folder: string) => void;
        setHeader: (header: Partial<HeaderType>) => void;
        setSectionElement: (element: JSX.Element) => void;
    }
}

export type NoteBuilderStore = UseBoundStore<StoreApi<NoteBuilderState>>;