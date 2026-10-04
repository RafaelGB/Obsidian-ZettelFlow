import { TAbstractFile, TFolder } from "obsidian";
import { TextInputSuggest } from "./AbstractSuggester";
import { ObsidianApi } from "architecture/plugin/ObsidianAPI";

export class FolderSuggest extends TextInputSuggest<TFolder> {
    /**
     * @param onSelect called with the chosen path, after the input event — for a field that commits
     * on a choice rather than on every keystroke (#659).
     */
    constructor(inputEl: HTMLInputElement, private readonly onChoose?: (path: string) => void) {
        super(inputEl);
    }

    getSuggestions(inputStr: string): TFolder[] {
        const abstractFiles = ObsidianApi.vault().getAllLoadedFiles();
        const folders: TFolder[] = [];
        const lowerCaseInputStr = inputStr.toLowerCase();

        abstractFiles.forEach((folder: TAbstractFile) => {
            if (
                folder instanceof TFolder &&
                folder.path.toLowerCase().contains(lowerCaseInputStr)
            ) {
                folders.push(folder);
            }
        });

        return folders;
    }

    renderSuggestion(file: TFolder, el: HTMLElement): void {
        el.setText(file.path);
    }

    selectSuggestion(file: TFolder, _evt: MouseEvent | KeyboardEvent): void {
        this.inputEl.value = file.path;
        this.inputEl.trigger("input");
        this.close();
        this.onChoose?.(file.path);
    }
}