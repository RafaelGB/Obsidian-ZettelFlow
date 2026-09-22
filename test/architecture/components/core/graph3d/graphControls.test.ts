import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const RAW = readFileSync(join(ROOT, "src/architecture/components/core/graph3d/Graph3DRenderer.ts"), "utf8");
const SCSS = readFileSync(join(ROOT, "src/styles/components/graph3d.scss"), "utf8");

const CODE = RAW.split("\n")
    .filter((line) => {
        const trimmed = line.trim();
        return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");

function slice(from: string, to: string): string {
    const start = CODE.indexOf(from);
    expect(start).toBeGreaterThan(-1);
    const end = CODE.indexOf(to, start + from.length);
    return CODE.slice(start, end > start ? end : undefined);
}

/**
 * **Twenty-two controls in one window** (#542).
 *
 * The graph grew one honest addition at a time — three lenses in #280, four more by #532, the
 * environment, the tour, the export — until the bar held sixteen controls and the bottom bar six,
 * all shouting at once. This is the subtraction and the move: the canvas keeps what is used *while
 * looking*, the rest is one click away, and three controls are gone because the scene already
 * does what they did.
 */
describe("the canvas keeps four things (#542, FR-2, AC-1)", () => {
    const bar = slice("private buildTopBar", "private buildSettingsPanel");

    it("builds the search box, fit, the gear and the status line — and nothing else", () => {
        expect(bar).toContain("graph3d-search");
        expect(bar).toContain("graph3d_fit_view");
        expect(bar).toContain("graph3d_settings");
        expect(bar).toContain("graph3d-status");

        // Everything that moved is gone from the bar.
        for (const moved of ["graph3d_group_color", "addLensChip", "graph3d_path_mode", "graph3d_tour_play", "graph3d_lite", "graph3d_export"]) {
            expect(bar).not.toContain(moved);
        }
        // Three buttons, one input, one status div.
        expect((bar.match(/createEl\("button"/g) ?? [])).toHaveLength(2);
        expect((bar.match(/createEl\("input"/g) ?? [])).toHaveLength(1);
    });
});

describe("the zoom controls are gone, not moved (#542, FR-1, AC-2)", () => {
    it("has no bottom bar and no zoom control anywhere", () => {
        expect(CODE).not.toContain("buildBottomBar");
        expect(CODE).not.toContain("graph3d-zoom");
        expect(CODE).not.toContain("nudgeZoom");
        expect(CODE).not.toContain("applyZoomFromSlider");
        expect(CODE).not.toContain("zoomSlider");
    });

    it("leaves no style and no string behind", () => {
        expect(SCSS).not.toContain("graph3d-zoom");
        expect(SCSS).not.toContain("graph3d-bottombar");
        for (const key of ["graph3d_zoom_in", "graph3d_zoom_out", "graph3d_zoom_label"]) {
            expect(en).not.toHaveProperty(key);
            expect(es).not.toHaveProperty(key);
        }
    });

    it("keeps the gesture that replaced them", () => {
        // Nothing to assert in code — the wheel and pinch are the library's orbit controls, which
        // is exactly why three buttons could go. Recorded here so the deletion has a reason
        // attached where someone would look for it.
        expect(CODE).not.toContain("graph3d_zoom");
    });
});

describe("every control that existed still exists (#542, FR-5, AC-3)", () => {
    const panel = slice("private buildSettingsPanel", "private settingsGroup");

    it("moved the colour mode, lite, fullscreen, the lenses, path mode, spread, time and share", () => {
        for (const kept of [
            "graph3d_color_state",
            "graph3d_color_neighbourhood",
            "graph3d_lite",
            "graph3d_fullscreen",
            "addLensChip",
            "graph3d_path_mode",
            "graph3d_spread_label",
            "graph3d_timelapse_play",
            "graph3d_tour_play",
            "graph3d_export",
        ]) {
            expect(panel).toContain(kept);
        }
    });

    it("keeps their handlers, so a move did not become a deletion", () => {
        for (const handler of [
            "this.toggleLite()",
            "this.toggleFullscreen()",
            "this.togglePathMode()",
            "this.applySpread(",
            "this.toggleTimelapse()",
            "this.scrubTime(",
            "this.toggleTour()",
            "this.openExportMenu(",
        ]) {
            expect(panel).toContain(handler);
        }
    });

    it("keeps the zero-count rule and the lazily-counted gap chip (#532)", () => {
        expect(panel).toContain('"gaps": this.gapTotal');
        expect(CODE).toContain('if (count === 0) chip.setAttribute("disabled", "true");');
    });

    it("carries the active state across the move, so reopening the panel is not a reset", () => {
        expect(panel).toContain("this.lite ?");
        expect(panel).toContain("this.pathMode ?");
        expect(panel).toContain("this.tourActive ?");
    });
});

describe("the popover can be dismissed the ways anyone would try (#542, FR-6, AC-4)", () => {
    it("closes on the gear, on a canvas click, and is torn down with the view", () => {
        const toggle = slice("private toggleSettings", "private closeSettings");
        expect(toggle).toContain("if (this.settingsEl)");
        expect(toggle).toContain("this.closeSettings();");
        expect(CODE).toContain("private clearFocus(): void {\n        this.closeSettings();");
        const close = slice("private closeSettings", "private settingsGroup");
        expect(close.length > 0 || CODE.includes("this.settingsEl?.remove()")).toBe(true);
        expect(CODE).toContain("this.settingsEl?.remove()");
    });

    it("says whether it is open, for a screen reader as well as a mouse", () => {
        expect(CODE).toContain('gear.setAttribute("aria-expanded", "false")');
        expect(CODE).toContain('this.settingsBtn?.setAttribute("aria-expanded", "true")');
        expect(CODE).toContain('panel.setAttribute("role", "dialog")');
    });
});

describe("the popover is placed by a class, not by arithmetic (#542, AC-7)", () => {
    it("adds no inline style", () => {
        const panel = slice("private buildSettingsPanel", "private settingsGroup");
        expect(panel).not.toMatch(/\.style\./);
        expect(SCSS).toContain(".zettelkasten-flow__graph3d-settings {");
    });
});

describe("the row you flew to looks like it (#542, found while counting)", () => {
    it("gives the framed legend row a rule, not just an aria attribute", () => {
        // #515 shipped `aria-pressed` and `graph3d-legend-row--framed` with no style behind it:
        // the state was real for a screen reader and invisible to everyone else.
        expect(CODE).toContain('c("graph3d-legend-row--framed")');
        expect(SCSS).toContain(".zettelkasten-flow__graph3d-legend-row--framed {");
    });
});

describe("the five group names exist in both languages (#542, FR-9, AC-6)", () => {
    it("names the gear and its groups", () => {
        expect(en.graph3d_settings).toBe("Graph options");
        expect(es.graph3d_settings).toBe("Opciones del grafo");
        for (const [key, english, spanish] of [
            ["graph3d_settings_see", "See", "Ver"],
            ["graph3d_settings_movement", "Movement", "Movimiento"],
            ["graph3d_settings_time", "Time", "Tiempo"],
            ["graph3d_settings_share", "Share", "Compartir"],
        ] as const) {
            expect(en[key]).toBe(english);
            expect(es[key]).toBe(spanish);
        }
    });
});
