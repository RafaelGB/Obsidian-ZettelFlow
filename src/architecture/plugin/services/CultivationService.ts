import { Notice, TFile, type App } from "obsidian";
import { log } from "architecture/monitoring/Logger";
import { t } from "architecture/lang";
import { FileService } from "./FileService";
import { FrontmatterService } from "./FrontmatterService";
import { StateTransitionService } from "./StateTransitionService";
import {
    DEFAULT_STATE_PROPERTY,
    LifecycleState,
    LifecycleStateSchema,
} from "architecture/knowledge/lifecycle";
import { buildLifecycleAliases } from "architecture/knowledge/lifecycleAliases";
import { SOURCE_KEYS } from "architecture/knowledge/claims/keys";

/**
 * Applies a Cultivate move to an existing note (#309 S3) — the Workflow-Engine write path, kept out of
 * the Experience renderer. Each method performs one real, user-confirmed operation and reports a
 * Notice; the state advance reuses the sanctioned {@link StateTransitionService}. Failures are logged
 * and surfaced, never thrown into the UI. Offline.
 */
export class CultivationService {
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
        const content = await FileService.getContent(file);
        await FileService.modify(file, `${content.trimEnd()}\n\n${text}\n`);
    }

    /** Append a `[[wikilink]]` to the note body (a new outgoing connection). */
    async link(app: App, path: string, targetName: string): Promise<void> {
        await this.write(app, path, (file) => this.appendToBody(file, `[[${targetName}]]`), "cultivate_linked_notice", targetName);
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

    /** Set the note's `source` frontmatter. */
    async addSource(app: App, path: string, text: string): Promise<void> {
        await this.write(
            app,
            path,
            (file) => FrontmatterService.instance(file).setProperty(SOURCE_KEYS[0], text),
            "cultivate_source_notice"
        );
    }

    /** Advance the note's lifecycle state via the sanctioned validated transition (emits its own Notice). */
    async advance(app: App, plugin: { settings?: { lifecycle?: { stateProperty?: string } } }, path: string, target: LifecycleState): Promise<void> {
        const file = this.fileFor(app, path);
        if (!file) return;
        try {
            const stateProperty = plugin.settings?.lifecycle?.stateProperty || DEFAULT_STATE_PROPERTY;
            const schema = new LifecycleStateSchema(stateProperty, buildLifecycleAliases());
            const accessor = FrontmatterService.instance(file);
            await StateTransitionService.getInstance().transition(accessor, stateProperty, schema, target, file.path);
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
        noticeArg?: string
    ): Promise<void> {
        const file = this.fileFor(app, path);
        if (!file) return;
        try {
            await op(file);
            new Notice(noticeArg === undefined ? t(noticeKey) : t(noticeKey, noticeArg));
        } catch (error) {
            log.error("[Cultivate] move write failed", error);
            new Notice(t("cultivate_apply_failed"));
        }
    }
}
