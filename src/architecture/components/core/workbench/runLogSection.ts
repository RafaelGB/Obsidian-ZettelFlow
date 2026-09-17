import { moment as obsidianMoment, Notice, Setting } from "obsidian";
import type MomentFn from "moment";
import { c, ObsidianApi } from "architecture";
import { t } from "architecture/lang";
import { FileService } from "architecture/plugin";
import {
    clampRetention,
    clearRuns,
    filterRuns,
    hookPropertyOf,
    MAX_RETENTION_DAYS,
    MIN_RETENTION_DAYS,
    surfacesInLog,
    type ScriptRun,
    type ScriptSurface,
} from "application/scripts/scriptRunLog";
import { SURFACE_LABEL_KEY } from "application/scripts/workbenchRun";

/** Obsidian re-exports moment without its call signature; the app's own tabs do the same cast. */
const moment = obsidianMoment as unknown as typeof MomentFn;

type LocaleKey = Parameters<typeof t>[0];

/**
 * **The run log** (#447, epic #443): everything the scripts in this vault have done lately,
 * wherever it came from — and the two actions that make a record useful: reopen the script it came
 * from, and run it again here with the same context.
 *
 * A section rather than a second window, and its own module rather than part of the workbench: the
 * bench must reach no writer at all (#446's guardrail), while the log legitimately writes one
 * setting — how long runs are kept, and clearing them.
 */

export interface RunLogHandlers {
    /** Put the bench back where a run was: its surface, its note, and its code when we have it. */
    onRerun: (surface: ScriptSurface, notePath: string, code?: string) => void;
    /** The log changed (cleared): the host re-renders. */
    onChanged: () => void;
}

/** View state, not settings: which slice of the log is on screen. */
const filters: { surface: ScriptSurface | ""; failuresOnly: boolean } = {
    surface: "",
    failuresOnly: false,
};

export function renderRunLog(contentEl: HTMLElement, handlers: RunLogHandlers): void {
    const plugin = ObsidianApi.getOwnPlugin();
    const runs = plugin?.settings.scriptLog?.runs ?? [];

    contentEl.createEl("h3", { text: t("run_log_title") });
    contentEl.createDiv({ cls: c("workbench-intro"), text: t("run_log_intro") });

    const controls = new Setting(contentEl).setName(t("run_log_filters"));
    controls.addDropdown((dropdown) => {
        dropdown.addOption("", t("run_log_all_surfaces"));
        for (const surface of surfacesInLog(runs)) {
            dropdown.addOption(surface, t(SURFACE_LABEL_KEY[surface] as LocaleKey));
        }
        dropdown.setValue(filters.surface).onChange((value) => {
            filters.surface = value as ScriptSurface | "";
            handlers.onChanged();
        });
    });
    controls.addToggle((toggle) =>
        toggle
            .setTooltip(t("run_log_failures_only"))
            .setValue(filters.failuresOnly)
            .onChange((value) => {
                filters.failuresOnly = value;
                handlers.onChanged();
            })
    );

    const list = contentEl.createDiv({ cls: c("run-log") });
    const shown = filterRuns(runs, {
        ...(filters.surface ? { surface: filters.surface } : {}),
        ...(filters.failuresOnly ? { failuresOnly: true } : {}),
    });
    if (shown.length === 0) {
        // The normal state of a healthy vault, said once and without ceremony.
        list.createDiv({ cls: c("workbench-note"), text: t("run_log_empty") });
    }
    for (const run of shown.slice(0, 100)) renderRun(list, run, handlers);

    renderLogControls(contentEl, runs.length, handlers);
}

function renderRun(list: HTMLElement, run: ScriptRun, handlers: RunLogHandlers): void {
    const row = list.createDiv({ cls: c("run-log-entry") });
    if (!run.ok) row.addClass(c("run-log-entry-failed"));

    const what = [
        t(SURFACE_LABEL_KEY[run.surface] as LocaleKey),
        run.origin.label ?? run.origin.ref ?? "",
        run.origin.notePath ?? "",
    ]
        .filter(Boolean)
        .join(" · ");
    row.createDiv({ cls: c("run-log-line"), text: `${moment(run.at).fromNow()} · ${what}` });
    row.createDiv({
        cls: c("run-log-detail"),
        text: run.ok
            ? t("run_log_ok", String(run.durationMs))
            : t("run_log_failed", run.error?.message ?? "", String(run.durationMs)),
    });

    const actions = row.createDiv({ cls: c("run-log-actions") });
    const rerun = actions.createEl("button", { text: t("run_log_rerun"), attr: { type: "button" } });
    rerun.addEventListener("click", () => reopen(run, handlers));

    const property = hookPropertyOf(run);
    if (run.surface === "library" && run.origin.ref) {
        const path = run.origin.ref;
        const open = actions.createEl("button", { text: t("run_log_open"), attr: { type: "button" } });
        open.addEventListener("click", () => void FileService.openFile(path));
    } else if (property) {
        row.createDiv({ cls: c("run-log-detail"), text: t("run_log_from_hook", property) });
    }
}

/**
 * Put the bench back where that run was. A note that is gone says so rather than opening a blank
 * run, and a hook's script is loaded because we can still find it.
 */
function reopen(run: ScriptRun, handlers: RunLogHandlers): void {
    if (run.origin.notePath && !ObsidianApi.vault().getFileByPath(run.origin.notePath)) {
        new Notice(t("run_log_note_gone", run.origin.notePath));
        return;
    }
    const property = hookPropertyOf(run);
    const hooks = ObsidianApi.getOwnPlugin()?.settings.hooks?.properties ?? {};
    const code = property ? hooks[property]?.script : undefined;
    const surface: ScriptSurface = run.surface === "workbench" ? "action" : run.surface;
    handlers.onRerun(surface, run.origin.notePath ?? "", code);
}

/** How long runs are kept, and the way to drop them all. */
function renderLogControls(contentEl: HTMLElement, total: number, handlers: RunLogHandlers): void {
    const plugin = ObsidianApi.getOwnPlugin();
    if (!plugin) return;
    const current = clampRetention(plugin.settings.scriptLog?.retentionDays);

    new Setting(contentEl)
        .setName(t("run_log_retention"))
        .setDesc(t("run_log_retention_desc"))
        .addSlider((slider) =>
            slider
                .setLimits(MIN_RETENTION_DAYS, MAX_RETENTION_DAYS, 1)
                .setValue(current)
                .onChange((value) => {
                    plugin.settings.scriptLog = {
                        runs: plugin.settings.scriptLog?.runs ?? [],
                        retentionDays: clampRetention(value),
                    };
                    void plugin.saveSettings();
                })
        )
        .addButton((button) =>
            button.setButtonText(t("run_log_clear")).onClick(() => {
                plugin.settings.scriptLog = { runs: clearRuns(), retentionDays: current };
                void plugin.saveSettings();
                new Notice(t("run_log_cleared", String(total)));
                handlers.onChanged();
            })
        );
}
