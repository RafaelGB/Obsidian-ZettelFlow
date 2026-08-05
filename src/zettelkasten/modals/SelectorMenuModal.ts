import { App, MarkdownFileInfo, MarkdownView, Modal, Platform, TFile } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import ZettelFlow from "main";
import { buildSelectorMenu } from "application/components/noteBuilder";
import { Flow } from "architecture/plugin/canvas";
import { buildTutorial } from "application/components/noteBuilder/SelectorMenu";
import { c, log } from "architecture";

export class SelectorMenuModal extends Modal {
    private root: Root;
    private editorMode: boolean;
    private embedded: boolean;
    constructor(
        app: App,
        private plugin: ZettelFlow,
        private flow?: Flow,
        private markdownView?: MarkdownView | MarkdownFileInfo
    ) {
        super(app);
        this.editorMode = markdownView !== undefined && markdownView.editor !== undefined;
    }
    enableEmbedded(enabled: boolean): SelectorMenuModal {
        this.embedded = enabled;
        return this;
    }

    enableEditor(enabled: boolean): SelectorMenuModal {
        this.editorMode = enabled;
        return this;
    }

    onOpen(): void {
        // Widen the modal so the companion pane sits beside the wizard (desktop, creation flow).
        if (this.flow && !Platform.isMobile && !this.isEditor()) {
            this.modalEl.addClass(c("note-builder-modal-wide"));
        }
        const child = this.contentEl.createDiv();
        this.root = createRoot(child);
        if (this.flow) {
            this.root.render(
                buildSelectorMenu(
                    {
                        plugin: this.plugin,
                        modal: this,
                        flow: this.flow,

                    }
                )
            );
        } else {
            this.root.render(
                buildTutorial(
                    {
                        plugin: this.plugin,
                        modal: this,
                    }
                )
            );
        }
    }

    onClose(): void {
        this.root.unmount();
    }

    onEditorBuild(content: string, modifications: Record<string, string> = {}): void {
        if (this.markdownView && this.markdownView.editor) {
            log.debug('Inserting content into the editor', this.markdownView);
            const editor = this.markdownView.editor;
            // Add the merged template content at the cursor.
            if (content) {
                const position = editor.getCursor();
                editor.replaceRange(content, { line: position.line, ch: position.ch }, { line: position.line, ch: position.ch });
            }
            // Also replace {{placeholder}} occurrences already present in the note body so
            // body-zone actions (e.g. prompt) work when editing an existing note, not only
            // when creating one (#75).
            const entries = Object.entries(modifications);
            if (entries.length > 0) {
                let doc = editor.getValue();
                for (const [key, value] of entries) {
                    doc = doc.replace(new RegExp(`{{${key}}}`, "g"), value);
                }
                editor.setValue(doc);
            }
        }
    }

    isEditor(): boolean {
        return this.editorMode;
    }

    isEmbedded(): boolean {
        return this.embedded;
    }

    getMarkdownView(): MarkdownView | MarkdownFileInfo | undefined {
        return this.markdownView;
    }

    getSourceFile(): TFile | undefined {
        return (this.markdownView as MarkdownView)?.file ?? undefined;
    }

    getCanvasName(): string {
        if (!this.flow) return "";
        const p = this.flow.canvasPath;
        const filename = p.split("/").pop() ?? p;
        return filename.replace(/\.[^.]+$/, "");
    }

}