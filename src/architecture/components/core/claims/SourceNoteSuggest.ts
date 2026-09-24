import { TFile } from "obsidian";
import { ObsidianApi } from "architecture";
import { TextInputSuggest } from "architecture/settings/suggesters/AbstractSuggester";

/** How many notes the list offers at once. A suggester is a shortcut, not a browser. */
const LIMIT = 10;

/**
 * Pick the note a claim came from (#582).
 *
 * An **inline** suggester on an input, not a `SuggestModal`: the second line lives inside the claim
 * box, and a modal opening over a modal to fill one field is the kind of stack that makes an
 * optional line feel like a form. It is also what `obsidianmd/prefer-abstract-input-suggest` asks
 * for, and this project already wraps that API (`TextInputSuggest`).
 *
 * Picking writes `[[Basename]]`, which `ClaimSourceSchema` classifies as a **link** source once the
 * link resolves; anything you type and do not pick is kept verbatim and classified as **text**. Both
 * are real answers to *where did this come from*.
 *
 * It is deliberately **not** scope-filtered: a reference note legitimately lives in a folder the
 * knowledge model excludes, and refusing to cite it would be the tool arguing with your vault.
 */
export class SourceNoteSuggest extends TextInputSuggest<TFile> {
    getSuggestions(input: string): TFile[] {
        const query = input.toLowerCase().replace(/^\[+/, "").trim();
        const notes = ObsidianApi.vault().getMarkdownFiles();
        if (query.length === 0) return notes.slice(0, LIMIT);
        return notes.filter((file) => file.basename.toLowerCase().includes(query)).slice(0, LIMIT);
    }

    renderSuggestion(file: TFile, el: HTMLElement): void {
        el.setText(file.basename);
    }

    selectSuggestion(file: TFile): void {
        this.inputEl.value = `[[${file.basename}]]`;
        this.inputEl.trigger("input");
        this.close();
    }
}
