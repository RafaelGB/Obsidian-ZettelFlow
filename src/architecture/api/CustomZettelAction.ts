import { AbstractHandlerClass } from "architecture/patterns";
import { WrappedActionBuilderProps } from "components/NoteBuilder";
import { FinalElement } from "notes";
import { StepBuilderModal } from "zettelkasten";

export abstract class CustomZettelAction {
    abstract component(props: WrappedActionBuilderProps): JSX.Element;
    abstract action(element: FinalElement): Promise<void>;
    abstract getIcon(): string;
    abstract getLabel(): string;
    abstract stepHandler(): AbstractHandlerClass<StepBuilderModal>;
}