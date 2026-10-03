import { App, moment as obsidianMoment, setTooltip } from "obsidian";
import type MomentFn from "moment";
import { c, log } from "architecture";
import { t, tCount } from "architecture/lang";
import { DevelopmentJournal } from "architecture/plugin";
import { JudgementLog } from "architecture/plugin/judgement/JudgementLog";
import type { AgencyReading, Judgement } from "architecture/knowledge/state";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";
import { hoverPreview, makeActivatable } from "architecture/components/core/a11y";
import {
    practiceMix,
    practiceRecent,
    practiceStrip,
    type MixKind,
    type PracticeMix,
    type PracticeRecent,
} from "./practiceModel";

/** Obsidian re-exports moment without its call signature; the app's own tabs do the same cast. */
const moment = obsidianMoment as unknown as typeof MomentFn;

type LocaleKey = Parameters<typeof t>[0];
const DEBOUNCE_MS = 400;

const READING: Record<AgencyReading, LocaleKey> = {
    deciding: "practice_reading_deciding",
    mixed: "practice_reading_mixed",
    accepting: "practice_reading_accepting",
    unknown: "practice_reading_unknown",
};
const MIX_LABEL: Record<MixKind, LocaleKey> = {
    accepted: "practice_mix_accepted",
    changed: "practice_mix_changed",
    rejected: "practice_mix_rejected",
};
const VERDICT: Record<string, LocaleKey> = {
    accepted: "judgement_verdict_accepted",
    modified: "judgement_verdict_modified",
    rejected: "judgement_verdict_rejected",
    confirmed: "judgement_verdict_confirmed",
    challenged: "judgement_verdict_challenged",
};

/** Where the numbers come from — injectable, so the view is tested without the plugin's singletons. */
export interface PracticeDeps {
    dailyCounts(): Record<string, number>;
    judgements(): { enabled: boolean; entries: readonly Judgement[] };
    now(): number;
    openSettings(): void;
}

function defaultDeps(app: App): PracticeDeps {
    return {
        dailyCounts: () => DevelopmentJournal.getInstance().dailyCounts(),
        judgements: () => {
            const record = JudgementLog.getInstance();
            return { enabled: record.enabled(), entries: record.entries() };
        },
        now: () => Date.now(),
        openSettings: () => {
            app.setting.open();
            app.setting.openTabById("zettelflow");
        },
    };
}

/**
 * The **Practice** mode of the Health surface (#645, epic #639): what you have been doing — the
 * days you developed ideas, how you answered proposals, your latest decisions. It merges Momentum
 * and Agency, neither of which earned a mode alone.
 *
 * Facts, never a grade (§XII, D3): counts and plain sentences, no percentage, no index, no colour
 * that means good or bad. It reads; it writes nothing. No refresh button — it redraws when the
 * vault settles and every time you open the mode.
 */
export class PracticeRenderer extends KnowledgeModeRenderer {
    private readonly deps: PracticeDeps;
    private debounce: number | undefined;

    constructor(
        container: HTMLElement,
        private readonly app: App,
        deps: Partial<PracticeDeps> = {}
    ) {
        super(container);
        this.deps = { ...defaultDeps(app), ...deps };
    }

    onload(): void {
        this.registerEvent(
            this.app.metadataCache.on("resolved", () => {
                window.clearTimeout(this.debounce);
                this.debounce = window.setTimeout(() => this.render(), DEBOUNCE_MS);
            })
        );
        this.render();
    }

    onunload(): void {
        window.clearTimeout(this.debounce);
        this.container.empty();
    }

    render(): void {
        this.container.empty();
        // This draw's listeners go with this draw: it redraws on every settled vault change.
        const scope = this.scope("render");
        const root = this.container.createDiv({ cls: c("practice") });
        this.renderStrip(root);

        const record = this.deps.judgements();
        if (!record.enabled) {
            const off = root.createDiv({ cls: c("practice-recording-off") });
            off.createSpan({ text: t("practice_recording_off") });
            const open = off.createEl("button", { text: t("practice_recording_off_open"), attr: { type: "button" } });
            scope.registerDomEvent(open, "click", () => this.deps.openSettings());
            return;
        }
        this.renderMix(root, practiceMix(record.entries));
        this.renderRecent(root, practiceRecent(record.entries));
    }

    private section(root: HTMLElement, headingKey: LocaleKey): HTMLElement {
        const section = root.createDiv({ cls: c("practice-section") });
        section.createEl("h5", { cls: c("practice-heading"), text: t(headingKey) });
        return section;
    }

    /** Twelve weeks of days, a cell each — the journal's day→count tally, nothing more. */
    private renderStrip(root: HTMLElement): void {
        const section = this.section(root, "practice_strip_heading");
        let strip;
        try {
            strip = practiceStrip(this.deps.dailyCounts(), this.deps.now());
        } catch (error) {
            log.error(`[Practice] could not read the development journal: ${error instanceof Error ? error.message : String(error)}`);
            section.createDiv({ cls: c("practice-quiet"), text: t("practice_strip_error") });
            return;
        }
        if (strip.total === 0) {
            section.createDiv({ cls: c("practice-quiet"), text: t("practice_strip_empty") });
            return;
        }
        section.createDiv({
            cls: c("practice-subtitle"),
            text: tCount(strip.total, "practice_strip_total", String(strip.total)),
        });
        const grid = section.createDiv({
            cls: c("practice-strip"),
            attr: { role: "group", "aria-label": t("practice_strip_heading") },
        });
        for (const column of strip.columns) {
            const col = grid.createDiv({ cls: c("practice-week") });
            col.createDiv({
                cls: c("practice-month"),
                text: column.month ? moment(`${column.month}-01`).format("MMM") : "",
            });
            for (const cell of column.cells) {
                const label = tCount(cell.count, "practice_strip_cell", String(cell.count), cell.date);
                const el = col.createDiv({
                    cls: [c("practice-cell"), c(`practice-cell--l${cell.level}`)].join(" "),
                    attr: { role: "img", "aria-label": label },
                });
                setTooltip(el, label);
            }
        }
    }

    /** How you answered proposals, as counts and one proportional bar — never a percentage. */
    private renderMix(root: HTMLElement, mix: PracticeMix | null): void {
        const section = this.section(root, "practice_mix_heading");
        if (!mix) {
            section.createDiv({ cls: c("practice-quiet"), text: t("practice_mix_empty") });
            return;
        }
        section.createDiv({ cls: c("practice-subtitle"), text: tCount(mix.total, "practice_mix_total", String(mix.total)) });

        const legend = (["accepted", "changed", "rejected"] as const).map((kind) =>
            tCount(mix[kind], MIX_LABEL[kind], String(mix[kind]))
        );
        // The proportions are SVG geometry, not inline style: one unit of width per decision.
        const bar = section.createSvg("svg", {
            cls: c("practice-bar"),
            attr: {
                viewBox: `0 0 ${mix.total} 1`,
                preserveAspectRatio: "none",
                role: "img",
                "aria-label": legend.join(" · "),
            },
        });
        let x = 0;
        for (const segment of mix.segments) {
            bar.createSvg("rect", {
                cls: [c("practice-seg"), c(`practice-seg--${segment.kind}`)].join(" "),
                attr: { x, y: 0, width: segment.count, height: 1 },
            });
            x += segment.count;
        }

        const keys = section.createDiv({ cls: c("practice-legend") });
        (["accepted", "changed", "rejected"] as const).forEach((kind, index) => {
            const item = keys.createSpan({ cls: c("practice-legend-item") });
            item.createSpan({ cls: [c("practice-swatch"), c(`practice-swatch--${kind}`)].join(" ") });
            item.createSpan({ text: legend[index] });
        });
        section.createDiv({ cls: c("practice-reading"), text: t(READING[mix.reading]) });
    }

    /** The latest decisions, each opening its note. The rest of a note's history is its story. */
    private renderRecent(root: HTMLElement, rows: PracticeRecent[]): void {
        const section = this.section(root, "practice_recent_heading");
        if (rows.length === 0) {
            section.createDiv({ cls: c("practice-quiet"), text: t("practice_recent_empty") });
            return;
        }
        const list = section.createDiv({ cls: c("practice-list"), attr: { role: "list" } });
        for (const row of rows) {
            const item = list.createDiv({ cls: c("practice-row"), attr: { role: "listitem" } });
            const name = item.createSpan({
                cls: c("practice-name"),
                text: row.basename,
                attr: { "aria-label": t("practice_recent_open_note", row.basename) },
            });
            makeActivatable(name, () => void this.app.workspace.openLinkText(row.path, "", false));
            hoverPreview(this.app, name, row.path, this);
            item.createSpan({ cls: c("practice-chip"), text: t(VERDICT[row.verdict] ?? "judgement_verdict_accepted") });
            item.createSpan({ cls: c("practice-when"), text: moment(row.at).fromNow() });
        }
    }
}
