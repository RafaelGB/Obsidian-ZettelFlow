import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

const SRC = join(__dirname, "..", "..", "src");
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8");

const MENU = read("starters", "zcomponents", "ZettelFlowMenuComponent.ts");
const EN = read("architecture", "lang", "locale", "en.ts");
const ES = read("architecture", "lang", "locale", "es.ts");
const REGISTRY = read("architecture", "components", "core", "surface", "surfaceRegistry.ts");
const COMMANDS = read("starters", "zcomponents", "SurfaceCommandsComponent.ts");

/**
 * Think, and a door on the ribbon (#479).
 *
 * The epic's claim is that this is where anything starts. Two things worked against it: the
 * surface was called *Lab* — which reads as somewhere advanced you go once you already have
 * something to test — and it was absent from the plugin's one front door.
 */
describe("the front door leads with thinking (#479)", () => {
    it("puts it first in the ribbon menu, above creating a note", () => {
        // The order is the claim: an idea starts as a thought, and a note is what it may become.
        const groups = MENU.slice(MENU.indexOf("GROUPS: MenuEntry[][]"));
        const think = groups.indexOf('command: "think"');
        const create = groups.indexOf('command: "open-workflow"');
        expect(think).toBeGreaterThan(-1);
        expect(think).toBeLessThan(create);
    });

    it("opens the surface through the same command everything else uses", () => {
        expect(COMMANDS).toContain('id: "think"');
    });
});

describe("the rename costs nobody their bindings (#479)", () => {
    it("keeps the command id", () => {
        // A hotkey someone bound must survive a label change.
        expect(COMMANDS).toContain('id: "think"');
        expect(MENU).toContain('command: "think"');
    });

    it("keeps the mode id, so deep links still land", () => {
        expect(REGISTRY).toContain('{ id: "lab", labelKey: "surface_mode_lab" }');
    });
});

describe("nothing a user reads says Lab any more (#479)", () => {
    it("has no string in either locale calling it that", () => {
        for (const [name, locale] of [["en", EN], ["es", ES]] as const) {
            const offenders = locale
                .split("\n")
                .filter((line) => /^\s{4}\w+:\s*'/.test(line))
                .filter((line) => /'[^']*\b(lab|laboratorio)\b[^']*'/i.test(line))
                .map((line) => line.trim());
            expect({ locale: name, offenders }).toEqual({ locale: name, offenders: [] });
        }
    });

    it("calls the surface by a verb, because the name is the invitation", () => {
        expect(EN).toContain("surface_mode_lab: 'Think',");
        expect(ES).toContain("surface_mode_lab: 'Pensar',");
    });
});
