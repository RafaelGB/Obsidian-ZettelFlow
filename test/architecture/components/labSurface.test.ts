import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const SRC = join(__dirname, "..", "..", "..", "src");
const LAB = readFileSync(join(SRC, "architecture", "components", "core", "lab", "LabRenderer.ts"), "utf8");
const COMMANDS = readFileSync(join(SRC, "starters", "zcomponents", "SurfaceCommandsComponent.ts"), "utf8");
const EN = readFileSync(join(SRC, "architecture", "lang", "locale", "en.ts"), "utf8");

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return sources(full);
        return /\.tsx?$/.test(entry) ? [full] : [];
    });
}

/**
 * The space, and the two properties that decide whether anyone uses it (#467).
 *
 * The four moves are behaviour and are covered by the pure model (#466). What has to be pinned
 * here is what a renderer can lose silently: that the way in costs nothing, and that this surface
 * never becomes a place that counts.
 */
describe("the way in costs nothing (#467)", () => {
    it("has one command that opens the lab mode directly", () => {
        expect(COMMANDS).toContain('id: "think"');
        expect(COMMANDS).toContain('activateSurface(this.plugin.app, "zettelflow-home", "lab")');
    });

    it("puts no modal, prompt or picker in the command's path", () => {
        // The whole promise is a blinking cursor. Anything that asks a question first breaks it.
        for (const asking of ["Modal", "prompt(", "Suggest"]) {
            expect(COMMANDS.includes(asking)).toBe(false);
        }
        expect(LAB.includes("Modal")).toBe(false);
    });

    it("focuses an empty thought as soon as it renders", () => {
        expect(LAB).toContain("area.focus()");
        expect(LAB).toContain("renderComposer");
    });

    it("saves on a debounce, on blur, and on close — leaving must never cost a sentence", () => {
        expect(LAB).toContain('registerDomEvent(area, "blur", () => this.flush())');
        expect(LAB).toMatch(/onunload\(\): void \{\s*this\.flush\(\);/);
    });
});

describe("the lab reaches no writer but its own (#467)", () => {
    it("writes only through ThoughtStore", () => {
        // The shape of #446's workbenchWritesNothing: a surface that could write elsewhere would
        // make a thought into knowledge by accident.
        for (const writer of ["FileService.", "FrontmatterService", "NoteBuilder", "vault().create", "vault().modify"]) {
            expect({ writer, used: LAB.includes(writer) }).toEqual({ writer, used: false });
        }
        expect(LAB).toContain("ThoughtStore.getInstance()");
    });

    it("offers four moves, and not a fifth", () => {
        // Everything else belongs to the operator engine in phase 2. A fifth here would start
        // the feature collection this epic exists to prevent.
        const moves = ["lab_fork", "lab_challenge", "lab_connect"];
        for (const move of moves) expect(LAB).toContain(move);
        // `leave` is not a button: it is what closing does, which is the point of it being free.
        expect(LAB.includes("lab_leave")).toBe(false);
    });
});

describe("the lab never counts (#467)", () => {
    it("renders no total, badge or pending list of thoughts", () => {
        const counting = /\b(thoughts|pending|unprocessed)\.length\b(?![^\n]*links)/;
        const rendered = LAB.split("\n").filter((line) => /createSpan|createDiv|setText|text:/.test(line));
        expect(rendered.filter((line) => counting.test(line))).toEqual([]);
    });

    it("uses no urgency or judgement word in any string it shows", () => {
        const keys = [
            "lab_intro",
            "lab_new_thought",
            "lab_no_folder",
            "lab_fork",
            "lab_challenge",
            "lab_connect",
            "lab_forked",
            "lab_challenges",
            "surface_mode_lab",
            "command_think",
        ];
        const forbidden = /\b(pending|overdue|waiting|remaining|unprocessed|should|must|promising|important|productive)\b/i;
        for (const key of keys) {
            const match = new RegExp(`${key}: '([^']*)'`).exec(EN);
            expect({ key, found: match !== null }).toEqual({ key, found: true });
            expect({ key, urgent: forbidden.test(match?.[1] ?? "") }).toEqual({ key, urgent: false });
        }
    });

    it("has no other surface counting thoughts either", () => {
        // A counter anywhere — a ribbon, a status bar, Home — would destroy the thing the Lab is
        // for, and it would not be in this file when it happened.
        const offenders = sources(SRC)
            .filter((path) => !path.includes(join("core", "lab")))
            .filter((path) => {
                const text = readFileSync(path, "utf8");
                return /thoughts\.length|thoughtCount|pendingThoughts/.test(text);
            })
            .map((path) => relative(SRC, path));
        expect(offenders).toEqual([]);
    });
});
