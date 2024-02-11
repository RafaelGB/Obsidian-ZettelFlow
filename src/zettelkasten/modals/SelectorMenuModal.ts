import { App, MarkdownFileInfo, MarkdownView, Modal } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import ZettelFlow from "main";
import { buildSelectorMenu } from "application/components/noteBuilder";
import { Flow } from "architecture/plugin/canvas";
import { buildTutorial } from "application/components/noteBuilder/SelectorMenu";
import { log } from "architecture";
export class SelectorMenuModal extends Modal {
    private root: Root;
    private editorMode: boolean;
    constructor(app: App, private plugin: ZettelFlow, private flow?: Flow, private markdownView?: MarkdownView | MarkdownFileInfo) {
        super(app);
        this.editorMode = markdownView !== undefined && markdownView.editor !== undefined;
    }
    onOpen(): void {
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

    onEditorBuild(content: string): void {
        if (this.markdownView && this.markdownView.editor) {
            log.debug('Inserting content into the editor', this.markdownView);
            const editor = this.markdownView.editor;
            const position = editor.getCursor();
            // Add the template to the editor
            editor.replaceRange(content, { line: position.line, ch: position.ch }, { line: position.line, ch: position.ch });
        }
    }

    isEditor(): boolean {
        return this.editorMode;
    }

    getMarkdownView(): MarkdownView | MarkdownFileInfo | undefined {
        return this.markdownView;
    }

}