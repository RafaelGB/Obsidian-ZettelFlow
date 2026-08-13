import { HoverParent, HoverPopover, TFile, TextFileView, WorkspaceLeaf } from "obsidian";
import { dispatchEditor } from "./editor/Dispatcher";
import { EditService, FileService } from "architecture/plugin";
import { EditorView } from "codemirror";

export class CodeView extends TextFileView implements HoverParent {
    public static NAME = "ZettelFlowCodeView";
    public static EXTENSIONS = ["js"]
    file: TFile;
    hoverPopover: HoverPopover | null;

    view: EditorView;
    parentDiv: HTMLDivElement;

    editor: EditService;
    editorJit: number | null;

    data: string;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewData() {
        return this.data;
    }

    setViewData(data: unknown): void {
        if (data instanceof TFile) {
            // No action needed; view data is derived elsewhere
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
        this.parentDiv = this.contentEl.createDiv();
        this.data = await FileService.getContent(file);

        // Seed the edit service with the loaded content so a save is never issued with an
        // undefined body (which would reject the write / clobber the file).
        this.editor = EditService.instance(file).setContent(this.data);
        this.view = dispatchEditor(
            this.parentDiv,
            this.data,
            (update) => {
                if (this.editorJit) window.clearTimeout(this.editorJit);
                this.editorJit = window.setTimeout(() => {
                    this.editorJit = null;
                    this.data = update.state.doc.toString();
                    void this.editor
                        .setContent(this.data)
                        .save();
                }, 1000);
            });
        this.file = file;
    }

    /**
     * Flush a pending debounced save immediately, if any. Called before the view is torn down or
     * switched to another file so the (still-current) editor writes the outgoing file's content —
     * never a stale snapshot into the next file.
     */
    private flushPendingSave(): void {
        if (!this.editorJit) return;
        window.clearTimeout(this.editorJit);
        this.editorJit = null;
        this.data = this.view.state.doc.toString();
        void this.editor.setContent(this.data).save();
    }

    private initActions(): void {
        // TODO: linter button action
    }

    /**
    * Triggered when the associated view is closed
    */
    async onClose() {
        await super.onClose();
        this.flushPendingSave();
        this.view.destroy();
        this.parentDiv.remove();
    }

    async onUnloadFile(file: TFile) {
        await super.onUnloadFile(file);
        // Cancel/flush any pending save before the editor is reassigned to the next file, so the
        // outgoing file's content is never written into the incoming one.
        this.flushPendingSave();
        this.view.destroy();
    }
}