import ZettelFlow from "main";
import { Modal } from "obsidian";
import { StepBuilderInfo } from "zettelkasten";
import type { StepGroupId } from "./handlers/stepGroups";

export abstract class AbstractStepModal extends Modal {
    /**
     * The five question containers (#425). A handler appends into its own instead of dumping into
     * `contentEl`; before they exist (or in a modal that does not build them) it falls back, so no
     * handler needs to know whether the grouping is there.
     */
    groups: Partial<Record<StepGroupId, HTMLElement>> = {};

    /** Where this handler's settings belong. */
    groupEl(group: StepGroupId): HTMLElement {
        return this.groups[group] ?? this.info.contentEl;
    }

    abstract info: StepBuilderInfo;
    abstract getPlugin(): ZettelFlow;
    abstract mode: string
    abstract builder: string;

    abstract refresh(): void;
}