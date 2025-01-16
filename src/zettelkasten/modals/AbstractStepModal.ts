import { Modal } from "obsidian";
import { StepBuilderInfo } from "zettelkasten";

export abstract class AbstractStepModal extends Modal {
    abstract info: StepBuilderInfo;
    abstract mode: string
    abstract builder: string;

    abstract refresh(): void;
}