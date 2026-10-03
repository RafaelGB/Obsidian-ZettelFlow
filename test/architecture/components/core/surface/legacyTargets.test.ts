import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import {
    LEGACY_OPEN_TARGETS,
    LEGACY_VIEW_TARGETS,
    isViewTarget,
    relocateMode,
    type LegacyTarget,
} from "architecture/components/core/surface/legacyTargets";
import { SURFACES, defaultMode } from "architecture/components/core/surface/surfaceRegistry";

/** The standalone views a door may lead to instead of a surface mode (#640). */
const STANDALONE = ["zettelflow-note"];
const THIS_NOTE = { view: "zettelflow-note" };

const isValidTarget = (t: LegacyTarget) =>
    isViewTarget(t)
        ? STANDALONE.includes(t.view)
        : SURFACES.some((s) => s.viewType === t.surface && s.modes.some((m) => m.id === t.mode));

describe("legacy back-compat targets (#272, AC-2)", () => {
    it("maps all 12 retired opener commands to a valid (surface, mode) or view", () => {
        const commands = Object.keys(LEGACY_OPEN_TARGETS);
        expect(commands).toHaveLength(12);
        for (const cmd of commands) expect(isValidTarget(LEGACY_OPEN_TARGETS[cmd])).toBe(true);
    });

    it("maps all 13 redirect view types to a valid (surface, mode) or view — never self-redirecting home", () => {
        // Twelve since #484: `zettelflow-graph` joined the list when its surface went away, so a
        // workspace saved before the merge reopens Explore instead of an empty pane.
        const types = Object.keys(LEGACY_VIEW_TARGETS);
        expect(types).toHaveLength(13);
        expect(types).toContain("zettelflow-graph");
        expect(types).not.toContain("zettelflow-home");
        for (const type of types) expect(isValidTarget(LEGACY_VIEW_TARGETS[type])).toBe(true);
    });

    it("every graph door lands on Explore, with the graph lens (#484, #487)", () => {
        // Nobody loses a binding when a surface goes away, or when one moves house: five ids
        // kept, all repointed.
        const explore = { surface: "zettelflow-explore", mode: "explore", lens: "graph" };
        for (const id of ["show-knowledge-map", "show-concept-nav"]) {
            expect(LEGACY_OPEN_TARGETS[id]).toEqual(explore);
        }
        expect(LEGACY_VIEW_TARGETS["zettelflow-graph"]).toEqual(explore);
        // The direct doors keep their ids and ask for the same state.
        const menu = readFileSync(
            join(__dirname, "..", "..", "..", "..", "..", "src", "starters", "zcomponents", "ZettelFlowMenuComponent.ts"),
            "utf8"
        );
        for (const id of ["show-graph", "explore-in-3d", "ask-your-graph"]) expect(menu).toContain(`id: "${id}"`);
        expect(menu).not.toContain('"zettelflow-graph"');
        expect(menu.match(/lens: "graph"/g) ?? []).toHaveLength(2);
    });

    it("hands a stale Discovery/ask leaf over to Explore rather than showing the wrong list (#487)", () => {
        expect(relocateMode("zettelflow-discovery", "ask")).toMatchObject({
            surface: "zettelflow-explore",
            mode: "explore",
        });
        // Its other modes moved too (#504): two to Home, two to the note's own view.
        expect(relocateMode("zettelflow-discovery", "connections")).toMatchObject({ surface: "zettelflow-home" });
        expect(relocateMode("zettelflow-discovery", "challenges")).toEqual(THIS_NOTE);
        expect(relocateMode("zettelflow-discovery", "nonsense")).toBeNull();
        // …and the host actually consults it, rather than falling back to the first mode.
        const host = readFileSync(
            join(__dirname, "..", "..", "..", "..", "..", "src", "architecture", "components", "core", "surface", "ModeHostView.ts"),
            "utf8"
        );
        expect(host).toContain("relocateMode(this.getViewType(), mode)");
    });

    it("every retired-view-backed mode is reachable by at least one alias command", () => {
        const aliasedModes = new Set(
            Object.values(LEGACY_OPEN_TARGETS)
                .filter((t) => !isViewTarget(t))
                .map((t) => (isViewTarget(t) ? t.view : `${t.surface}:${t.mode}`))
        );
        for (const surface of SURFACES) {
            for (const mode of surface.modes) {
                if (!mode.sourceView) continue; // net-new modes (e.g. Explore) have no retired alias command
                expect(aliasedModes.has(`${surface.viewType}:${mode.id}`)).toBe(true);
            }
        }
    });
});

describe("This note's doors lead to its own view (#640 FR-23/24, AC-10)", () => {
    it("sends the four commands that opened the Timeline to This note", () => {
        for (const id of ["show-evolution-timeline", "show-notes-history", "show-evidence-map", "resurface-related-notes"]) {
            expect({ id, target: LEGACY_OPEN_TARGETS[id] }).toEqual({ id, target: THIS_NOTE });
        }
    });

    it("sends the retired views it absorbed to This note", () => {
        for (const type of ["zettelflow-evolution-timeline", "zettelflow-evidence-map", "zettelflow-resurface"]) {
            expect({ type, target: LEGACY_VIEW_TARGETS[type] }).toEqual({ type, target: THIS_NOTE });
        }
    });

    it("hands a Health leaf saved on the Timeline mode, and Discovery's two note modes, to This note", () => {
        expect(relocateMode("zettelflow-health", "timeline")).toEqual(THIS_NOTE);
        expect(relocateMode("zettelflow-discovery", "forgotten")).toEqual(THIS_NOTE);
        expect(relocateMode("zettelflow-discovery", "challenges")).toEqual(THIS_NOTE);
    });

    it("the Health surface no longer has a Timeline mode", () => {
        const health = SURFACES.find((surface) => surface.viewType === "zettelflow-health");
        expect(health?.modes.map((mode) => mode.id)).toEqual(["tend", "momentum", "agency"]);
    });
});

describe("Health's first mode is Tend, and every door to the old one lands there (#644 AC-1/AC-2)", () => {
    const TEND = { surface: "zettelflow-health", mode: "tend" };
    const en = readFileSync(join(__dirname, "..", "..", "..", "..", "..", "src", "architecture", "lang", "locale", "en.ts"), "utf8");
    const es = readFileSync(join(__dirname, "..", "..", "..", "..", "..", "src", "architecture", "lang", "locale", "es.ts"), "utf8");

    it("opens on Tend, called Tend / Cuidar", () => {
        expect(defaultMode("zettelflow-health")).toBe("tend");
        expect(en).toContain("surface_mode_tend: 'Tend',");
        expect(es).toContain("surface_mode_tend: 'Cuidar',");
    });

    it("relocates a saved health leaf, both commands and both retired views to Tend", () => {
        expect(relocateMode("zettelflow-health", "health")).toEqual(TEND);
        expect(LEGACY_OPEN_TARGETS["show-slipbox-health"]).toEqual(TEND);
        expect(LEGACY_OPEN_TARGETS["show-knowledge-dashboard"]).toEqual(TEND);
        expect(LEGACY_VIEW_TARGETS["zettelflow-slipbox-health"]).toEqual(TEND);
        expect(LEGACY_VIEW_TARGETS["zettelflow-knowledge-dashboard"]).toEqual(TEND);
    });

    it("switches a renamed mode in place instead of reopening the same view type", () => {
        const host = readFileSync(
            join(__dirname, "..", "..", "..", "..", "..", "src", "architecture", "components", "core", "surface", "ModeHostView.ts"),
            "utf8"
        );
        expect(host).toContain("moved.surface === this.getViewType()");
    });
});
