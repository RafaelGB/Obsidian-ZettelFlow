import type { SettingGroupItem } from "obsidian";
import { c } from "architecture";
import { t, tCount } from "architecture/lang";
import { frameMeterOn, frameTraces, meteredRefreshMs, setFrameMeter, type MeteredTrace } from "architecture/monitoring/frameMeter";
import type { FrameFailure } from "architecture/monitoring/frameVerdict";
import { formatDuration } from "architecture/knowledge/state";

type LocaleKey = Parameters<typeof t>[0];

/**
 * **The frame meter** (#826), in Settings › Advanced beside *Timings from this vault*: a switch, and
 * what it measured, read when the row is drawn. For developers, and for an iPad, where nothing else can
 * time a gesture's frames. Off by default, for this session only: nothing is saved, nothing is
 * exported, and it is never on Health.
 */
const GESTURE_KEY: Record<string, LocaleKey> = {
    "page-drag": "frame_gesture_page_drag",
    "chapter-turn": "frame_gesture_chapter_turn",
    "shelf-drag": "frame_gesture_shelf_drag",
    "open-shot": "frame_gesture_open_shot",
    "close-shot": "frame_gesture_close_shot",
};

const FAILURE_KEY: Record<FrameFailure, LocaleKey> = {
    budget: "frame_fail_budget",
    "long-frame": "frame_fail_long",
    start: "frame_fail_start",
    layout: "frame_fail_layout",
    interrupt: "frame_fail_interrupt",
};

/** A gesture's name as a reader knows it, and how it was done (`leaf · held`, `spring`). */
function gestureLabel(key: string): string {
    const [kind, ...how] = key.split(":");
    const name = GESTURE_KEY[kind] ? t(GESTURE_KEY[kind]) : kind;
    return how.length > 0 ? `${name} · ${how.join(" · ")}` : name;
}

/** One line per gesture: its runs, its slowest frames across them, and whether every run held. */
export function frameMeterLines(read: () => ReadonlyMap<string, readonly MeteredTrace[]> = frameTraces): string[] {
    const lines: string[] = [];
    for (const [key, runs] of read()) {
        if (runs.length === 0) continue;
        const p95 = Math.max(...runs.map((run) => run.verdict.p95Ms));
        const worst = Math.max(...runs.map((run) => run.verdict.worstMs));
        const start = Math.max(...runs.map((run) => run.verdict.inputToMotionMs));
        const failures = [...new Set(runs.flatMap((run) => run.verdict.failures))];
        const held = failures.length === 0 ? t("frame_meter_within") : t("frame_meter_over", failures.map((f) => t(FAILURE_KEY[f])).join(", "));
        lines.push([gestureLabel(key), tCount(runs.length, "frame_meter_runs", String(runs.length)), t("frame_meter_line", formatDuration(p95), formatDuration(worst), formatDuration(start)), held].join(" · "));
    }
    return lines;
}

export function frameMeterSettingsItems(): SettingGroupItem[] {
    return [
        {
            name: t("frame_meter_name"),
            desc: t("frame_meter_desc"),
            render: (setting) => {
                setting.addToggle((toggle) =>
                    toggle.setValue(frameMeterOn()).onChange((on) => {
                        setFrameMeter(on);
                        draw();
                    })
                );
                const table = setting.descEl.createDiv({ cls: c("settings-frame-meter") });
                const draw = () => {
                    table.empty();
                    if (!frameMeterOn()) return;
                    const lines = frameMeterLines();
                    if (lines.length === 0) {
                        table.createDiv({ text: t("frame_meter_empty") });
                        return;
                    }
                    const refresh = meteredRefreshMs();
                    if (refresh) table.createDiv({ text: t("frame_meter_refresh", String(Math.round(1000 / refresh))) });
                    for (const line of lines) table.createDiv({ cls: c("settings-timing"), text: line });
                };
                draw();
            },
        },
    ];
}
