import { Literal } from "architecture/plugin";
import { ActionCategory } from "./categories";
import type { ActionKind } from "architecture/knowledge/taxonomy/actionKind";
import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import { ContentDTO, FinalElement, NoteDTO } from "application/notes"
import { TFile } from "obsidian";
import { JSX } from "react";
import { AbstractStepModal } from "zettelkasten/modals/AbstractStepModal";

export type ExecuteInfo = {
    element: FinalElement,
    content: ContentDTO,
    note: NoteDTO,
    context: Record<string, Literal>,
    /**
     * True when the action runs headless as part of a note's on-creation pattern (#170/#201) rather
     * than an interactive wizard step. Cognitive actions suppress their success `Notice` when set, so
     * a pattern that runs several of them does not spray a stack of toasts. Absent ⇒ interactive.
     */
    silent?: boolean,
}

export type Action = {
    type: string;
    id: string;
    description?: string;
    hasUI?: boolean;
    [key: string]: Literal;
};

export type ActionSetting = (
    contentEl: HTMLElement,
    props: AbstractStepModal,
    action: Action,
    disableNavbar?: boolean
) => void;

export type ActionSettingReader = (
    contentEl: HTMLElement,
    action: Action
) => void;

export interface ICustomZettelAction {
    id: string;
    /** Optional cognitive-capability category (#152); absent ⇒ uncategorized. */
    category?: ActionCategory;
    /** Command/Query classification (#265) — primary taxonomy axis; command mutates, query observes. */
    kind?: ActionKind;
    component(props: WrappedActionBuilderProps): JSX.Element;
    settings: ActionSetting;
    execute(info: ExecuteInfo): Promise<void>;
    postProcess(info: ExecuteInfo, file: TFile): Promise<void>;
    getIcon(): string;
    getLabel(): string;
}