import { c, log } from "architecture";
import { t } from "architecture/lang";
import { FileService } from "architecture/plugin/services/FileService";
import {
    NoteSection,
    ParsedNote,
    SectionReplacement,
    buildAtomicNoteBody,
    deriveTitle,
    rewriteSourceBody,
} from "application/notes/atomicitySplit";
import { App, Modal, Notice, Setting, TFile } from "obsidian";

/** A section selected for splitting, with its collision-safe target path and content. */
interface SplitPlan {
    section: NoteSection;
    path: string;
    basename: string;
    content: string;
}

/**
 * Previews and performs an atomicity split: each top-level section of the source note is shown
 * with a proposed title and an include toggle. On confirm, one atomic note is created per selected
 * section (its content + a backlink to the source) and the source is rewritten so each split-out
 * section becomes a wikilink to its new note. Nothing is written until confirm; if any creation
 * fails, the created notes are rolled back and the source is left intact.
 */
export class AtomicitySplitModal extends Modal {
    private readonly excluded = new Set<NoteSection>();

    constructor(app: App, private readonly sourceFile: TFile, private readonly parsed: ParsedNote) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass(c("atomicity-split"));

        contentEl.createEl("h2", { text: t("atomicity_modal_title") });
        contentEl.createEl("p", { text: t("atomicity_modal_description") });

        const list = contentEl.createDiv({ cls: c("atomicity-split-list") });
        for (const section of this.parsed.sections) {
            new Setting(list).setName(section.title).addToggle((toggle) => {
                toggle.setValue(!this.excluded.has(section));
                toggle.onChange((value) => {
                    if (value) {
                        this.excluded.delete(section);
                    } else {
                        this.excluded.add(section);
                    }
                });
            });
        }

        new Setting(contentEl).addButton((btn) => {
            btn.setButtonText(t("atomicity_confirm_button"))
                .setCta()
                .onClick(() => void this.doSplit());
        });
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private async doSplit(): Promise<void> {
        const selected = this.parsed.sections.filter((section) => !this.excluded.has(section));
        if (selected.length === 0) {
            new Notice(t("atomicity_none_selected"));
            return;
        }

        const plans = await this.buildPlans(selected);
        const created: TFile[] = [];
        try {
            for (const plan of plans) {
                created.push(await FileService.createFile(plan.path, plan.content, false));
            }
        } catch (error) {
            await this.rollback(created);
            log.error(`AtomicitySplit: creating atomic notes failed — ${String(error)}`);
            new Notice(t("atomicity_error_notice"));
            return;
        }

        try {
            const replacements: SectionReplacement[] = plans.map((plan) => ({
                section: plan.section,
                linkBasename: plan.basename,
            }));
            await FileService.modify(this.sourceFile, rewriteSourceBody(this.parsed, replacements));
        } catch (error) {
            await this.rollback(created);
            log.error(`AtomicitySplit: rewriting the source note failed — ${String(error)}`);
            new Notice(t("atomicity_error_notice"));
            return;
        }

        log.info(`AtomicitySplit: created ${plans.length} atomic notes from "${this.sourceFile.path}"`);
        new Notice(t("atomicity_success_notice", String(plans.length)));
        this.close();
    }

    /** Computes collision-safe target paths and note bodies for the selected sections. */
    private async buildPlans(selected: NoteSection[]): Promise<SplitPlan[]> {
        const parentPath = this.sourceFile.parent?.path ?? "";
        const used = new Set<string>();
        const plans: SplitPlan[] = [];

        for (const section of selected) {
            const base = deriveTitle(section.heading) || this.sourceFile.basename;
            let candidate = base;
            let suffix = 2;
            while (used.has(candidate.toLowerCase()) || (await FileService.getFile(this.pathFor(parentPath, candidate), false)) !== null) {
                candidate = `${base} ${suffix++}`;
            }
            used.add(candidate.toLowerCase());
            plans.push({
                section,
                path: this.pathFor(parentPath, candidate),
                basename: candidate,
                content: buildAtomicNoteBody(section, this.sourceFile.basename, t("atomicity_backlink_prefix")),
            });
        }

        return plans;
    }

    private pathFor(parentPath: string, basename: string): string {
        const name = `${basename}${FileService.MARKDOWN_EXTENSION}`;
        return parentPath ? `${parentPath}${FileService.PATH_SEPARATOR}${name}` : name;
    }

    /** Best-effort removal of notes created earlier in a failed batch. */
    private async rollback(created: TFile[]): Promise<void> {
        for (const file of created) {
            try {
                await FileService.deleteFile(file);
            } catch (error) {
                log.warn(`AtomicitySplit: could not roll back "${file.path}" — ${String(error)}`);
            }
        }
    }
}
