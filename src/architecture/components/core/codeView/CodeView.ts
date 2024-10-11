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
    editorJit: NodeJS.Timeout | null;

    data: string;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewData() {
        return this.data;
    }

    setViewData(data: unknown): void {
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
        this.parentDiv = this.contentEl.createDiv();
        this.data = await FileService.getContent(file);

        this.editor = EditService.instance(file)
        this.view = dispatchEditor(
            this.parentDiv,
            this.data,
            (update) => {
                if (this.editorJit) clearTimeout(this.editorJit);
                this.editorJit = setTimeout(() => {
                    this.data = update.state.doc.toString();
                    this.editor
                        .setContent(this.data)
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
        await super.onClose();
        this.editor.save();
        this.view.destroy();
        this.parentDiv.remove();
    }

    async onUnloadFile(file: TFile) {
        await super.onUnloadFile(file);
        this.view.destroy();
    }
}