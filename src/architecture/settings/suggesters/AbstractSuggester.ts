import { AbstractInputSuggest } from "obsidian";
import { ObsidianApi } from "architecture/plugin/ObsidianAPI";

export abstract class TextInputSuggest<T> extends AbstractInputSuggest<T> {
    protected inputEl: HTMLInputElement;

    constructor(inputEl: HTMLInputElement) {
        super(ObsidianApi.globalApp(), inputEl);
        this.inputEl = inputEl;
    }
}
