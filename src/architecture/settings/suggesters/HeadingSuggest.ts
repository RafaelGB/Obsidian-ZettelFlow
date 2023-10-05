import { HeadingCache, TFile } from "obsidian";
import { TextInputSuggest } from "./AbstractSuggester";
import { FileService, FrontmatterService } from "architecture/plugin";

export class HeadingSuggest extends TextInputSuggest<HeadingCache> {
    private file: TFile;
    constructor(
        public inputEl: HTMLInputElement,
        filePath: string,
    ) {
        super(inputEl);
        FileService.getFile(filePath, false).then((file) => {
            if (file) {
                this.file = file;
            }
        });
    }

    getSuggestions(input_str: string): HeadingCache[] {
        const all_headings = FrontmatterService.instance(this.file).get().headings;
        if (!all_headings) {
            return [];
        }

        const headings: HeadingCache[] = [];
        const lower_input_str = input_str.toLowerCase();
        all_headings.forEach((hc: HeadingCache) => {
            if (
                hc.heading.toLowerCase().contains(lower_input_str)
            ) {
                headings.push(hc);
            }
        });

        return headings;
    }

    renderSuggestion(hc: HeadingCache, el: HTMLElement): void {
        el.setText(hc.heading);
    }

    selectSuggestion(hc: HeadingCache): void {
        this.inputEl.value = JSON.stringify(hc);
        this.inputEl.trigger("input");
        this.close();
    }
}