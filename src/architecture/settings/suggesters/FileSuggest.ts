import { TAbstractFile, TFile } from "obsidian";
import { TextInputSuggest } from "./AbstractSuggester";
import { ObsidianApi } from "architecture";
import { FileService, FILE_EXTENSIONS } from "architecture/plugin";

export class FileSuggest extends TextInputSuggest<TFile> {
    private extensions = FILE_EXTENSIONS.BASIC;
    constructor(
        public inputEl: HTMLInputElement,
        private folderPath: string,
    ) {
        super(inputEl);
    }

    get_folder(): string {
        return this.folderPath
    }

    getSuggestions(input_str: string): TFile[] {
        const all_files = FileService.getTfilesFromFolder(input_str, this.extensions);
        if (!all_files) {
            return [];
        }

        const files: TFile[] = [];
        const lower_input_str = input_str.toLowerCase();
        all_files.forEach((file: TAbstractFile) => {
            if (
                file instanceof TFile &&
                file.path.toLowerCase().contains(lower_input_str)
            ) {
                files.push(file);
            }
        });

        return files;
    }

    renderSuggestion(file: TFile, el: HTMLElement): void {
        el.setText(file.basename);
    }

    selectSuggestion(file: TFile): void {
        this.inputEl.value = file.path;
        this.inputEl.trigger("input");
        this.close();
    }

    filePathsRecordSuggester(): Record<string, string> {
        const filePaths: Record<string, string> = {}
        ObsidianApi.vault().getMarkdownFiles().forEach(file => { filePaths[file.path] = file.basename });
        return filePaths;
    }

    setExtensions(extensions: string[]): void {
        this.extensions = extensions;
    }
}