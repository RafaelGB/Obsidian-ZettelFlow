import { Literal } from "architecture/plugin";
import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import { ContentDTO, FinalElement, NoteDTO } from "application/notes"
import { StepBuilderModal } from "zettelkasten";
import { TFile } from "obsidian";

export type ExecuteInfo = {
    element: FinalElement,
    content: ContentDTO,
    note: NoteDTO,
    context: Record<string, Literal>,
    externalFns: Record<string, unknown>,
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
    props: StepBuilderModal,
    action: Action
) => void;

export interface ICustomZettelAction {
    id: string;
    component(props: WrappedActionBuilderProps): JSX.Element;
    settings: ActionSetting;
    execute(info: ExecuteInfo): Promise<void>;
    postProcess(info: ExecuteInfo, file: TFile): Promise<void>;
    getIcon(): string;
    getLabel(): string;
}