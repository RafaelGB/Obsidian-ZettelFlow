import { moment as obsidianMoment, Notice } from "obsidian";
import type MomentFn from "moment";
import ZettelFlow from "main";
import { c } from "architecture";
import { t } from "architecture/lang";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";
import { ConfirmModal } from "architecture/components/settings";
import {
    batchesOf,
    clearWrites,
    KIND_LABEL_KEY,
    touchedProperties,
    type VaultWrite,
    type WriteBatch,
} from "application/writes/vaultWriteLog";
import { ORIGIN_LABEL_KEY, originName } from "application/writes/writeAttribution";
import { hasWork, planUndo, undoSummary, type UndoPlan } from "application/writes/undoPlan";
import {
    applyUndo,
    obsidianUndoVault,
    readVaultFacts,
    rememberUndone,
} from "architecture/plugin/writes/applyUndo";

const moment = obsidianMoment as unknown as typeof MomentFn;

type LocaleKey = Parameters<typeof t>[0];

/** How many batches are worth scrolling. Older ones are still in the record until it prunes. */
const SHOWN = 50;

/**
 * **What ZettelFlow changed** (#454, epic #451) — the *Recent* mode of the Home surface.
 *
 * This mode used to list the notes the wizard built, from a second list kept only for it. That
 * answered a third of the question: it never mentioned the satellite beside the note, the
 * frontmatter a hook set while you were elsewhere, or the canvas that moved when you gave it a
 * role. So the list it reads is now the [write record](../../../../application/writes/vaultWriteLog.ts),
 * and the separate history is gone — one list, and it is the complete one.
 *
 * What it adds is the thing a list of writes exists for: **taking one back**. A batch is what one
 * action did, so undoing it takes back the note *and* its satellite *and* the properties, together.
 * The undo is previewed, it never deletes (created notes go to Obsidian's trash), and it refuses —
 * naming the note — when the note changed after ZettelFlow wrote it.
 */
export class ChangeRenderer extends KnowledgeModeRenderer {
    constructor(container: HTMLElement, private readonly plugin: ZettelFlow) {
        super(container);
    }

    onload(): void {
        this.render();
    }

    onunload(): void {
        this.container.empty();
    }

    render(): void {
        const contentEl = this.container;
        contentEl.empty();

        const header = contentEl.createDiv({ cls: c("history-header") });
        header.createEl("h4", { text: t("changes_title"), cls: c("history-title") });

        const writes = this.plugin.settings.writeLog?.writes ?? [];
        if (writes.length > 0) {
            const clearBtn = header.createEl("button", {
                text: t("changes_clear"),
                cls: c("history-clear-button"),
            });
            this.registerDomEvent(clearBtn, "click", () => {
                // Clearing forgets the record, not the writes: nothing in the vault changes.
                this.plugin.settings.writeLog = { writes: clearWrites() };
                void this.plugin.saveSettings();
                this.render();
            });
        }

        contentEl.createDiv({ cls: c("changes-intro"), text: t("changes_intro") });

        const batches = batchesOf(writes);
        if (batches.length === 0) {
            contentEl.createDiv({ cls: c("history-empty"), text: t("changes_empty") });
            return;
        }

        const list = contentEl.createDiv({ cls: c("history-list") });
        for (const batch of batches.slice(0, SHOWN)) this.renderBatch(list, batch);
    }

    private renderBatch(container: HTMLElement, batch: WriteBatch): void {
        const row = container.createDiv({ cls: c("history-entry") });
        if (batch.undone) row.addClass(c("changes-undone"));

        const info = row.createDiv({ cls: c("history-entry-info") });
        const who = originName(batch.origin);
        info.createSpan({
            cls: c("changes-origin"),
            text: who ? t("changes_by", t(ORIGIN_LABEL_KEY[batch.origin.kind] as LocaleKey), who) : t(ORIGIN_LABEL_KEY[batch.origin.kind] as LocaleKey),
        });
        for (const write of batch.writes) this.renderWrite(info, write);

        row.createDiv({ cls: c("history-timestamp"), text: moment(batch.at).fromNow() });

        if (batch.undone) {
            row.createDiv({ cls: c("changes-state"), text: t("changes_already_undone") });
            return;
        }
        const undo = row.createEl("button", {
            text: t("changes_undo"),
            cls: c("changes-undo"),
            attr: { type: "button" },
        });
        this.registerDomEvent(undo, "click", () => this.confirmUndo(batch));
    }

    /** One line per write: what happened to which note, and — for properties — which ones. */
    private renderWrite(info: HTMLElement, write: VaultWrite): void {
        const name = write.path.split("/").pop() ?? write.path;
        const gone = !this.plugin.app.vault.getAbstractFileByPath(write.path);
        const line = info.createDiv({ cls: c("changes-line") });
        const nameEl = line.createSpan({ cls: c("history-note-name"), text: name });
        nameEl.setAttribute("title", gone ? t("changes_file_gone") : write.path);
        if (gone) nameEl.addClass(c("history-missing"));
        else this.registerDomEvent(nameEl, "click", () => void this.plugin.app.workspace.openLinkText(write.path, "", false));

        const properties = touchedProperties(write);
        line.createSpan({
            cls: c("changes-what"),
            text:
                properties.length > 0
                    ? t("changes_properties_set", properties.join(", "))
                    : t(KIND_LABEL_KEY[write.kind] as LocaleKey),
        });
    }

    /** Say what will happen, in counts and names, before anything happens. */
    private confirmUndo(batch: WriteBatch): void {
        const plan = planUndo(batch.writes, readVaultFacts(batch.writes));
        if (!hasWork(plan)) {
            new Notice(plan.blocked.length > 0 ? this.refusal(plan) : t("changes_nothing_to_undo"));
            return;
        }
        const counts = undoSummary(plan);
        const details = [
            counts.notes > 0 ? t("changes_preview_notes", String(counts.notes)) : "",
            counts.properties > 0 ? t("changes_preview_properties", String(counts.properties)) : "",
            counts.moves > 0 ? t("changes_preview_moves", String(counts.moves)) : "",
            counts.appends > 0 ? t("changes_preview_appends", String(counts.appends)) : "",
            ...plan.trash,
            ...plan.restore.map((entry) => entry.path),
            plan.blocked.length > 0 ? this.refusal(plan) : "",
        ].filter(Boolean);

        new ConfirmModal(
            this.plugin.app,
            plan.possible ? t("changes_undo_question") : t("changes_undo_partial_question"),
            plan.possible ? t("changes_undo") : t("changes_undo_partial"),
            t("changes_undo_cancel"),
            () => this.runUndo(batch, plan),
            details
        ).open();
    }

    /** Why some of it will not happen — the note, and when it changed. */
    private refusal(plan: UndoPlan): string {
        const first = plan.blocked[0];
        if (first.reason === "not-undoable") return t("changes_blocked_overwrite", first.path);
        if (first.reason === "property-changed") {
            return t("changes_blocked_property", first.key ?? "", first.path);
        }
        return t("changes_blocked_changed", first.path, moment(first.changedAt).fromNow());
    }

    private async runUndo(batch: WriteBatch, plan: UndoPlan): Promise<void> {
        const outcome = await applyUndo(plan, obsidianUndoVault);
        // Only a clean, complete undo writes the batch off: half of one is still standing.
        if (outcome.failed.length === 0 && plan.possible) rememberUndone(batch.batch, Date.now());
        new Notice(
            outcome.failed.length > 0
                ? t("changes_undo_partial_done", String(outcome.done), outcome.failed.join(", "))
                : t("changes_undo_done", String(outcome.done))
        );
        this.render();
    }
}
