import { Notice, TFile, type App } from "obsidian";
import { log } from "architecture/monitoring/Logger";
import { t } from "architecture/lang";
import { appendSource } from "application/claims";
import { FileService, type CreateFileResult } from "./FileService";
import type { InquiryOperation } from 'architecture/knowledge/inquiry/inquiryState';
import { FrontmatterService } from "./FrontmatterService";
import { StateTransitionService } from "./StateTransitionService";
import {
    DEFAULT_STATE_PROPERTY,
    LifecycleState,
    LifecycleStateSchema,
} from "architecture/knowledge/lifecycle";
import { buildLifecycleAliases } from "architecture/knowledge/lifecycleAliases";

/**
 * Applies a Cultivate move to an existing note (#309 S3) — the Workflow-Engine write path, kept out of
 * the Experience renderer. Each method performs one real, user-confirmed operation and reports a
 * Notice; the state advance reuses the sanctioned {@link StateTransitionService}. Failures are logged
 * and surfaced, never thrown into the UI. Offline.
 */
export class CultivationService {
    /** Inquiry outcomes are frozen, reviewed snapshots, not append operations on a source note. */
    saveInquiryOutcome(app: App, operation: InquiryOperation, allowed: (path: string) => boolean): Promise<CreateFileResult> {
        return FileService.createFileOnce(app.vault, operation, allowed);
    }
    private static instance: CultivationService;

    static getInstance(): CultivationService {
        if (!CultivationService.instance) CultivationService.instance = new CultivationService();
        return CultivationService.instance;
    }

    private fileFor(app: App, path: string): TFile | null {
        const file = app.vault.getAbstractFileByPath(path);
        return file instanceof TFile ? file : null;
    }

    private async appendToBody(file: TFile, text: string): Promise<void> {
        // Through the service's append (#454), so the record knows what was added and undo can
        // take exactly that back out again.
        await FileService.appendTo(file, text);
    }

    /**
     * Append a `[[wikilink]]` to the note body (a new outgoing connection).
     *
     * `quiet` is for a surface that says what happened inline, next to an undo (#640): it raises no
     * toast either way and answers whether the link was written. Failures are still logged.
     */
    async link(app: App, path: string, targetName: string, opts: { quiet?: boolean } = {}): Promise<boolean> {
        return this.write(
            app,
            path,
            (file) => this.appendToBody(file, `[[${targetName}]]`),
            "cultivate_linked_notice",
            targetName,
            opts.quiet === true
        );
    }

    /** Append a `question:: …` inline field to the note body. */
    async addQuestion(app: App, path: string, text: string): Promise<void> {
        await this.write(app, path, (file) => this.appendToBody(file, `question:: ${text}`), "cultivate_question_notice");
    }

    /** Append a counterpoint section to the note body. */
    async addCounterpoint(app: App, path: string, text: string): Promise<void> {
        const block = `## ${t("cultivate_counterpoint_heading")}\n${text}`;
        await this.write(app, path, (file) => this.appendToBody(file, block), "cultivate_counterpoint_notice");
    }

    /**
     * Set the note's source frontmatter (#155, corrected in #582).
     *
     * Through the shared `applySource` rather than `setProperty(SOURCE_KEYS[0], text)`, which
     * **clobbered an existing source list** — a note grounded in three references kept one. It also
     * writes under the key the note already uses, so a note declaring `sources:` no longer sprouts
     * a `source:` beside it.
     */
    async addSource(app: App, path: string, text: string, opts: { quiet?: boolean } = {}): Promise<boolean> {
        // Appends since #641: the old edit replaced the first entry of a list, so a note whose
        // `sources:` held a link to a note not written yet lost it to the new reference.
        return this.write(
            app,
            path,
            (file) =>
                FrontmatterService.instance(file).update((frontmatter) => {
                    appendSource(frontmatter, text);
                }),
            "cultivate_source_notice",
            undefined,
            opts.quiet === true
        );
    }

    /** Advance the note's lifecycle state via the sanctioned validated transition (emits its own Notice). */
    async advance(app: App, plugin: { settings?: { lifecycle?: { stateProperty?: string } } }, path: string, target: LifecycleState): Promise<void> {
        const file = this.fileFor(app, path);
        if (!file) {
            // Never a silent no-op (#546 C3): the note is gone and a click with no word is #544 again.
            log.error("[Cultivate] advance target is missing", path);
            new Notice(t("cultivate_apply_failed"));
            return;
        }
        try {
            const stateProperty = plugin.settings?.lifecycle?.stateProperty || DEFAULT_STATE_PROPERTY;
            const schema = new LifecycleStateSchema(stateProperty, buildLifecycleAliases());
            const accessor = FrontmatterService.instance(file);
            // `derived`: the session proposed the next valid state and you took it (#581).
            await StateTransitionService.getInstance().transition(
                accessor,
                stateProperty,
                schema,
                target,
                file.path,
                "derived"
            );
        } catch (error) {
            log.error("[Cultivate] advance failed", error);
            new Notice(t("cultivate_apply_failed"));
        }
    }

    private async write(
        app: App,
        path: string,
        op: (file: TFile) => Promise<void>,
        noticeKey: Parameters<typeof t>[0],
        noticeArg?: string,
        quiet = false
    ): Promise<boolean> {
        const file = this.fileFor(app, path);
        if (!file) {
            // Same rule as advance(): a missing target is a failure the user must hear about (#546 C3)
            // — from a toast, or from the quiet caller's own inline line.
            log.error("[Cultivate] move target is missing", path);
            if (!quiet) new Notice(t("cultivate_apply_failed"));
            return false;
        }
        try {
            await op(file);
            if (!quiet) new Notice(noticeArg === undefined ? t(noticeKey) : t(noticeKey, noticeArg));
            return true;
        } catch (error) {
            log.error("[Cultivate] move write failed", error);
            if (!quiet) new Notice(t("cultivate_apply_failed"));
            return false;
        }
    }
}
