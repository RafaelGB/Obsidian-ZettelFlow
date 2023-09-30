import { AbstractHandlerClass } from "architecture/patterns";
import { WrappedActionBuilderProps } from "components/NoteBuilder";
import { ContentDTO, FinalElement } from "notes";
import { StepBuilderModal } from "zettelkasten";

export abstract class CustomZettelAction {
    abstract stepHandler: AbstractHandlerClass<StepBuilderModal>;
    abstract component(props: WrappedActionBuilderProps): JSX.Element;
    abstract execute(element: FinalElement, content: ContentDTO): Promise<void>;
    abstract getIcon(): string;
    abstract getLabel(): string;
}