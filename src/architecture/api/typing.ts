import { Literal } from "architecture/plugin";
import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import { ContentDTO, FinalElement, NoteDTO } from "application/notes"
import { StepBuilderModal } from "zettelkasten";

export type ExecuteInfo = {
    element: FinalElement,
    content: ContentDTO,
    note: NoteDTO
}

export type Action = {
    type: string;
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
    getIcon(): string;
    getLabel(): string;
}