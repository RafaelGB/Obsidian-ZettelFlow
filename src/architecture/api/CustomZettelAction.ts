import { AbstractHandlerClass } from "architecture/patterns";
import { WrappedActionBuilderProps } from "components/NoteBuilder";
import { StepBuilderModal } from "zettelkasten";
import { ExecuteInfo } from "./model/CustomZettelActionTypes";

export abstract class CustomZettelAction {
    abstract id: string;
    abstract stepHandler: AbstractHandlerClass<StepBuilderModal>;
    abstract component(props: WrappedActionBuilderProps): JSX.Element;
    abstract execute(info: ExecuteInfo): Promise<void>;
    abstract getIcon(): string;
    abstract getLabel(): string;
}