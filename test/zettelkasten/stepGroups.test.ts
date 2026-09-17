import { describe, it, expect } from "@jest/globals";
import { readdirSync } from "fs";
import { join } from "path";
import {
    HANDLER_GROUP,
    STEP_GROUPS,
    STEP_GROUP_HEADING,
    isGroupExpanded,
} from "zettelkasten/modals/handlers/stepGroups";
import type { StepBuilderInfo } from "zettelkasten";

const HANDLERS_DIR = join(__dirname, "..", "..", "src", "zettelkasten", "modals", "handlers");

function info(extra: Partial<StepBuilderInfo> = {}): StepBuilderInfo {
    return { type: "text", root: false, actions: [], label: "", ...extra } as StepBuilderInfo;
}

describe("every setting has a home, and the map cannot rot (#425)", () => {
    it("places every handler in the chain exactly once", () => {
        // The map is data, so a new handler that forgets to declare its group fails here rather
        // than rendering at the bottom of the dialog where nobody looks for it.
        const handlers = readdirSync(HANDLERS_DIR)
            .filter((name) => /^[A-Z].*Handler\.tsx?$/.test(name))
            .map((name) => name.replace(/\.tsx?$/, ""));

        expect(handlers.length).toBeGreaterThan(8);
        for (const handler of handlers) {
            expect(Object.keys(HANDLER_GROUP)).toContain(handler);
            expect(STEP_GROUPS).toContain(HANDLER_GROUP[handler]);
        }
    });

    it("gives every group a heading", () => {
        for (const group of STEP_GROUPS) {
            expect(STEP_GROUP_HEADING[group]).toMatch(/^step_group_/);
        }
    });
});

describe("a group opens when it holds something (#425)", () => {
    it("always opens the two you came for", () => {
        expect(isGroupExpanded("asks", info())).toBe(true);
        expect(isGroupExpanded("writes", info())).toBe(true);
    });

    it("keeps the rest closed on an empty step", () => {
        expect(isGroupExpanded("when", info())).toBe(false);
        expect(isGroupExpanded("where", info())).toBe(false);
        expect(isGroupExpanded("shown", info())).toBe(false);
    });

    it("never hides a configured trigger from the person who configured it", () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(isGroupExpanded("when", info({ trigger: { event: "create" } as any }))).toBe(true);
        expect(isGroupExpanded("when", info({ wait: { mode: "confirm" } }))).toBe(true);
        expect(isGroupExpanded("when", info({ root: true }))).toBe(true);
        expect(isGroupExpanded("when", info({ optional: true }))).toBe(true);
    });

    it("opens where and shown only when they hold real values", () => {
        expect(isGroupExpanded("where", info({ targetFolder: "  " }))).toBe(false);
        expect(isGroupExpanded("where", info({ targetFolder: "Sources" }))).toBe(true);
        expect(isGroupExpanded("shown", info({ label: "Fuente" }))).toBe(true);
        expect(isGroupExpanded("shown", info({ phase: "PROCESS" }))).toBe(true);
        expect(isGroupExpanded("shown", info({ childrenHeader: "Pick one" }))).toBe(true);
    });
});
