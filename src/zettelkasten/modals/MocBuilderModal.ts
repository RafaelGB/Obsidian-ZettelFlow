import { c, log } from "architecture";
import { t } from "architecture/lang";
import { FileService } from "architecture/plugin/services/FileService";
import { FrontmatterService } from "architecture/plugin/services/FrontmatterService";
import { MocLink, mergeMocRegion } from "application/notes/mocMerge";
import { MemberSource, MocQuery, resolveMembers } from "application/notes/mocMembership";
import { App, ButtonComponent, Modal, Notice, Setting, TFile, getAllTags } from "obsidian";

/** Frontmatter marker that flags a note as a ZettelFlow-managed structure note. */
const STRUCTURE_NOTE_PROPERTY = "zettelflowStructureNote";

type SelectionMode = "query" | "manual";

/**
 * Builds or updates a map-of-content note. The set of member notes is resolved either from a
 * tag/folder query or from a comma-separated list of note names, previewed, and then written
 * into a machine-managed region so re-runs never clobber the user's own prose. The body is
 * written exactly once per run (a single create or a single modify).
 */
export class MocBuilderModal extends Modal {
    private mode: SelectionMode = "query";
    private tag = "";
    private folder = "";
    private manual = "";
    private targetName = "";

    private resolvedLinks: MocLink[] | null = null;
    private willCreate = true;

    private queryContainer!: HTMLElement;
    private manualContainer!: HTMLElement;
    private previewEl!: HTMLElement;
    private confirmButton?: ButtonComponent;

    constructor(app: App) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass(c("moc-builder"));
        contentEl.createEl("h2", { text: t("moc_modal_title") });

        new Setting(contentEl).addDropdown((dropdown) => {
            dropdown.addOption("query", t("moc_mode_query"));
            dropdown.addOption("manual", t("moc_mode_manual"));
            dropdown.setValue(this.mode);
            dropdown.onChange((value) => {
                this.mode = value as SelectionMode;
                this.updateModeVisibility();
                this.resetPreview();
            });
        });

        this.queryContainer = contentEl.createDiv({ cls: c("moc-builder-query") });
        new Setting(this.queryContainer)
            .setName(t("moc_tag_label"))
            .addText((text) => {
                text.setPlaceholder(t("moc_tag_placeholder"));
                text.setValue(this.tag);
                text.onChange((value) => {
                    this.tag = value;
                    this.resetPreview();
                });
            });
        new Setting(this.queryContainer)
            .setName(t("moc_folder_label"))
            .addText((text) => {
                text.setPlaceholder(t("moc_folder_placeholder"));
                text.setValue(this.folder);
                text.onChange((value) => {
                    this.folder = value;
                    this.resetPreview();
                });
            });

        this.manualContainer = contentEl.createDiv({ cls: c("moc-builder-manual") });
        new Setting(this.manualContainer)
            .setName(t("moc_manual_label"))
            .addTextArea((area) => {
                area.setPlaceholder(t("moc_manual_placeholder"));
                area.setValue(this.manual);
                area.onChange((value) => {
                    this.manual = value;
                    this.resetPreview();
                });
            });

        new Setting(contentEl)
            .setName(t("moc_target_label"))
            .addText((text) => {
                text.setPlaceholder(t("moc_target_placeholder"));
                text.setValue(this.targetName);
                text.onChange((value) => {
                    this.targetName = value;
                    this.resetPreview();
                });
            });

        new Setting(contentEl)
            .addButton((btn) => {
                btn.setButtonText(t("moc_preview_button"));
                btn.onClick(() => void this.doPreview());
            })
            .addButton((btn) => {
                this.confirmButton = btn;
                btn.setButtonText(t("moc_confirm_button")).setCta().setDisabled(true);
                btn.onClick(() => void this.doConfirm());
            });

        this.previewEl = contentEl.createDiv({ cls: c("moc-builder-preview") });

        this.updateModeVisibility();
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private updateModeVisibility(): void {
        this.queryContainer.toggleClass(c("is-hidden"), this.mode !== "query");
        this.manualContainer.toggleClass(c("is-hidden"), this.mode !== "manual");
    }

    private resetPreview(): void {
        this.resolvedLinks = null;
        this.previewEl.empty();
        this.confirmButton?.setDisabled(true);
    }

    private targetPath(): string {
        const name = this.targetName.trim() || t("moc_target_placeholder");
        return name.toLowerCase().endsWith(FileService.MARKDOWN_EXTENSION)
            ? name
            : `${name}${FileService.MARKDOWN_EXTENSION}`;
    }

    private buildMemberSources(): MemberSource[] {
        const cache = this.app.metadataCache;
        return this.app.vault.getMarkdownFiles().map((file) => {
            const fileCache = cache.getFileCache(file);
            const tags = fileCache ? getAllTags(fileCache) ?? [] : [];
            return { path: file.path, title: file.basename, tags };
        });
    }

    private resolveLinks(): MocLink[] {
        return this.mode === "manual" ? this.resolveManual() : this.resolveQuery();
    }

    private resolveQuery(): MocLink[] {
        const query: MocQuery = {
            tag: this.tag.trim() || undefined,
            folder: this.folder.trim() || undefined,
        };
        if (query.tag === undefined && query.folder === undefined) {
            return [];
        }
        const candidates = resolveMembers(this.buildMemberSources(), query, this.targetPath());
        return candidates.map((candidate) => ({
            path: stripMarkdownExtension(candidate.path),
            title: candidate.title,
        }));
    }

    private resolveManual(): MocLink[] {
        const names = this.manual
            .split(",")
            .map((name) => name.trim())
            .filter((name) => name.length > 0);
        if (names.length === 0) {
            return [];
        }

        const excludePath = this.targetPath();
        const byBasename = new Map<string, TFile>();
        for (const file of this.app.vault.getMarkdownFiles()) {
            const key = file.basename.toLowerCase();
            if (!byBasename.has(key)) {
                byBasename.set(key, file);
            }
        }

        const links: MocLink[] = [];
        const seen = new Set<string>();
        for (const name of names) {
            const key = name.toLowerCase().replace(/\.md$/i, "");
            const file = byBasename.get(key);
            if (!file || file.path === excludePath || seen.has(file.path)) {
                continue;
            }
            seen.add(file.path);
            links.push({ path: stripMarkdownExtension(file.path), title: file.basename });
        }
        links.sort((a, b) => a.title.localeCompare(b.title));
        return links;
    }

    private async doPreview(): Promise<void> {
        try {
            const links = this.resolveLinks();
            const existing = await FileService.getFile(this.targetPath(), false);
            this.resolvedLinks = links;
            this.willCreate = existing === null;
            this.renderPreview(links, this.willCreate);
            this.confirmButton?.setDisabled(links.length === 0);
        } catch (error) {
            log.error(`MocBuilderModal: preview failed — ${String(error)}`);
            new Notice(t("moc_error_notice"));
        }
    }

    private renderPreview(links: MocLink[], willCreate: boolean): void {
        this.previewEl.empty();

        if (links.length === 0) {
            this.previewEl.createDiv({
                cls: c("moc-builder-preview-empty"),
                text: t("moc_empty_notice"),
            });
            return;
        }

        this.previewEl.createDiv({
            cls: c("moc-builder-preview-summary"),
            text: willCreate
                ? t("moc_preview_create", String(links.length))
                : t("moc_preview_update", String(links.length)),
        });
        this.previewEl.createEl("h4", {
            cls: c("moc-builder-preview-heading"),
            text: t("moc_preview_members_heading"),
        });
        const list = this.previewEl.createEl("ul", { cls: c("moc-builder-preview-list") });
        for (const link of links) {
            list.createEl("li", { cls: c("moc-builder-preview-item"), text: link.title });
        }
    }

    private async doConfirm(): Promise<void> {
        const links = this.resolvedLinks;
        if (!links || links.length === 0) {
            log.warn("MocBuilderModal: confirm requested with an empty member set — nothing written");
            new Notice(t("moc_empty_notice"));
            return;
        }

        const path = this.targetPath();
        const heading = t("moc_heading_default");

        try {
            const existing = await FileService.getFile(path, false);
            let file: TFile;
            let created: boolean;

            if (existing === null) {
                const body = mergeMocRegion("", links, heading);
                file = await FileService.createFile(path, body, false);
                created = true;
            } else {
                const content = await FileService.getContent(existing);
                await FileService.modify(existing, mergeMocRegion(content, links, heading));
                file = existing;
                created = false;
            }

            await FrontmatterService.instance(file).setProperty(STRUCTURE_NOTE_PROPERTY, true);

            log.info(
                `MocBuilderModal: ${created ? "created" : "updated"} map "${path}" with ${links.length} links`
            );
            new Notice(t("moc_success_notice", String(links.length)));
            this.close();
        } catch (error) {
            log.error(`MocBuilderModal: write failed — ${String(error)}`);
            new Notice(t("moc_error_notice"));
        }
    }
}

function stripMarkdownExtension(path: string): string {
    return path.replace(/\.md$/i, "");
}
