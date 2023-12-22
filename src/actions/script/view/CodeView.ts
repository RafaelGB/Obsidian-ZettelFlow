import { HoverParent, HoverPopover, Plugin, TFile, TextFileView, WorkspaceLeaf } from "obsidian";
import { dispatchEditor } from "../editor/Dispatcher";
import { EditService, FileService } from "architecture/plugin";

export class CodeView extends TextFileView implements HoverParent {
    public static NAME = "ZettelFlowCodeView";
    public static EXTENSIONS = ["js"]
    file: TFile;
    hoverPopover: HoverPopover | null;
    editorJit: NodeJS.Timeout | null;

    constructor(leaf: WorkspaceLeaf, private plugin: Plugin) {
        super(leaf);
    }

    getViewData(): string {
        throw new Error("Method not implemented.");
    }
    setViewData(data: unknown, clear: boolean): void {
        if (data instanceof TFile) {
        }
    }
    clear(): void {
        // Do nothing
    }

    getViewType(): string {
        return CodeView.NAME;
    }

    /**
     * Triggered when the associated view is loaded
     */
    onload(): void {
        super.onload();
        this.initActions();
    }

    /**
     * Triggered when the associated file is loaded
     * @param file 
     * @returns 
     */
    async onLoadFile(file: TFile) {
        await super.onLoadFile(file);
        const parentDiv = this.contentEl.createDiv();
        const code = await FileService.getContent(file);

        const editor = EditService.instance(file)
        dispatchEditor(
            parentDiv,
            code,
            (update) => {
                if (this.editorJit) clearTimeout(this.editorJit);
                this.editorJit = setTimeout(() => {
                    editor
                        .setContent(update.state.doc.toString())
                        .save();
                }, 1000);
            });
        this.file = file;
    }

    private initActions(): void {
        // TODO: linter button action
    }

    /**
    * Triggered when the associated view is closed
    */
    async onClose() {

    }
}