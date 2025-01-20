import ZettelFlow from "main";
import { Modal } from "obsidian";
import { StepBuilderInfo } from "zettelkasten";

export abstract class AbstractStepModal extends Modal {
    abstract info: StepBuilderInfo;
    abstract getPlugin(): ZettelFlow;
    abstract mode: string
    abstract builder: string;

    abstract refresh(): void;
}