import { c } from "architecture";
import { FileService, MarkdownService } from "architecture/plugin";
import ZettelFlow from "main";
import { Component, Modal, setIcon } from "obsidian";

export class CommunityMarkdownModal extends Modal {
    private compiledMarkdown = true;
    constructor(
        private plugin: ZettelFlow,
        private content: string,
        private title: string,
        private description: string,
        private filename: string
    ) {
        super(plugin.app);
    }

    onOpen() {
        this.modalEl.addClass(c("modal"));
        this.renderContent();
    }

    private async renderContent() {
        this.contentEl.empty();
        const mdTemplateFolder = this.plugin.settings.communitySettings.markdownTemplateFolder;

        const span = activeDocument.createElement("span", {});
        // Header with title and subtitle with the mode
        const navbar = this.contentEl.createDiv({ cls: c("modal-navbar") });

        navbar.createEl("h2", { text: this.title })
        navbar.createEl("p", { text: this.description });
        // Separator
        navbar.appendChild(span);

        const navbarButtonGroup = navbar.createDiv({ cls: c("navbar-button-group") });

        // Is the file already installed?
        const potentialFile = await FileService.getFile(`${mdTemplateFolder}/${this.filename}`, false);
        if (potentialFile) {

            // Add a button to save the step into the clipboard
            const downloadMdButton = navbarButtonGroup.createEl("button", {
                placeholder: "Remove", title: "Remove the markdown file"
            }, el => {
                el.addClass("mod-cta");
                el.addEventListener("click", async () => {
                    // Remove the file from the Vault
                    await FileService.deleteFile(potentialFile);
                    this.renderContent();

                });
            });
            setIcon(downloadMdButton.createDiv(), "trash-2");
        } else {
            // Add a button to save the step into the clipboard
            const downloadMdButton = navbarButtonGroup.createEl("button", {
                placeholder: "Download", title: "Download the markdown file"
            }, el => {
                el.addClass("mod-cta");
                el.addEventListener("click", async () => {
                    await FileService.createFile(`${mdTemplateFolder}/${this.filename}`, this.content, true);
                    this.renderContent();
                });
            });
            setIcon(downloadMdButton.createDiv(), "download");
        }

        // Toggle the markdown rendering
        const toggleMarkdownButton = navbarButtonGroup.createEl("button", {
            placeholder: this.compiledMarkdown ? "Change to markdown" : "Change to preview",
            title: this.compiledMarkdown ? "Change to markdown" : "Change to preview"
        }, el => {
            el.addClass("mod-cta");
            el.addEventListener("click", () => {
                this.compiledMarkdown = !this.compiledMarkdown;
                this.renderContent();
            });
        });
        setIcon(toggleMarkdownButton.createDiv(), this.compiledMarkdown ? "file-text" : "eye");

        const comp = new Component();
        const mdContent = this.contentEl.createDiv({ cls: c("markdown-content") });
        if (this.compiledMarkdown) {
            MarkdownService.render(this.app, this.content, mdContent, "/", comp);
        } else {
            mdContent.createEl("pre", { text: this.content });
        }
    }

    onClose() {
        let { contentEl } = this;
        contentEl.empty();
    }
}