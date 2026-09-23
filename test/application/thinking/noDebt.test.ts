import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const SRC = join(__dirname, "..", "..", "..", "src");
const EN = readFileSync(join(SRC, "architecture", "lang", "locale", "en.ts"), "utf8");
const LAB = readFileSync(join(SRC, "architecture", "components", "core", "lab", "LabRenderer.ts"), "utf8");

/** Source with its comments removed, so a rule is judged on what runs, not on what explains it. */
function withoutComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return sources(full);
        return /\.tsx?$/.test(entry) ? [full] : [];
    });
}

/**
 * The Lab never generates debt (#469).
 *
 * This is the whole feature, and it is a **negative** one — which is why most of its weight lives
 * in this file rather than in the code it guards. Every tool's answer to "leave this alone" is an
 * inbox, and an inbox is a debt: a list that grows, counts itself, and greets you with how far
 * behind you are. A counter here would destroy the thing the Lab is for, and it would not be
 * added in `incubation.ts` when it happened — it would be added in a ribbon, or a status bar, or
 * Home.
 *
 * So the scan covers all of `src/`.
 */
describe("the Lab never counts at you (#469)", () => {
    it("has nothing anywhere counting thoughts", () => {
        const counting = /thoughts\.length|thoughtCount|pendingThoughts|incubated\.length|asideCount/;
        const offenders = sources(SRC)
            .filter((path) => {
                const text = readFileSync(path, "utf8");
                return counting.test(text);
            })
            .map((path) => relative(SRC, path));
        expect(offenders).toEqual([]);
    });

    it("puts no badge, ribbon or status-bar item anywhere near the Lab", () => {
        for (const surfacing of ["addStatusBarItem", "addRibbonIcon", "setBadge", "Notice("]) {
            expect({ surfacing, used: LAB.includes(surfacing) }).toEqual({ surfacing, used: false });
        }
    });

    it("opens the room you set things down in closed, and without saying how full it is", () => {
        // A door, not a queue. `showingAside` starts false and the label is a name, not a total.
        expect(LAB).toContain("private showingAside = false;");
        expect(LAB).toContain('t("lab_show_aside")');
        expect(LAB).not.toMatch(/lab_show_aside.*aside\.length/);
    });

    it("uses no word from the vocabulary of debt in anything it shows", () => {
        const keys = [
            "lab_set_aside",
            "lab_decided_against",
            "lab_reason_not_now",
            "lab_reason_decided_against",
            "lab_stuck_on",
            "lab_show_aside",
            "lab_hide_aside",
            "lab_appeared_since",
            "lab_pick_back_up",
        ];
        const debt =
            /\b(pending|overdue|waiting|remaining|unprocessed|backlog|inbox|due|should|must|need to|still|promising|important)\b/i;
        for (const key of keys) {
            const match = new RegExp(`${key}: '([^']*)'`).exec(EN);
            expect({ key, found: match !== null }).toEqual({ key, found: true });
            expect({ key, debt: debt.test(match?.[1] ?? "") }).toEqual({ key, debt: false });
        }
    });

    it("never reminds you: no timer, no interval, no scheduled return", () => {
        // Coming back is your move. A reminder is the system deciding it is time, which is the
        // one thing a refuge cannot do.
        for (const nagging of ["setInterval", "registerInterval", "scheduleReturn", "remindAt"]) {
            expect({ nagging, used: LAB.includes(nagging) }).toEqual({ nagging, used: false });
        }
    });

    it("says what appeared, and never what it is worth", () => {
        const incubation = readFileSync(join(SRC, "application", "thinking", "incubation.ts"), "utf8");
        // No ranking: `appearedSince` sorts by creation time and by nothing else.
        expect(incubation).toContain("sort((a, b) => a.created - b.created)");
        // Only the code: the prose explains at length what it deliberately does *not* do, and a
        // blunt substring scan would flag the explanation for containing the word.
        const code = withoutComments(incubation).toLowerCase();
        for (const judging of ["score", "rank", "relevance", "promising", "weight"]) {
            expect({ judging, used: code.includes(judging) }).toEqual({ judging, used: false });
        }
    });
});

/**
 * A lab that has grown must not become a backlog (#477).
 *
 * Every obvious way to make hundreds of thoughts usable is the wrong shape: a list of what to
 * process is an inbox, a count is a debt, a ranking of what looks promising is a judgement. The
 * only acceptable answer is a filter you pick up when you are looking for something.
 */
describe("finding is a tool, not a queue (#477)", () => {
    const EN_SRC = readFileSync(join(SRC, "architecture", "lang", "locale", "en.ts"), "utf8");

    it("starts empty, and an empty filter shows everything", () => {
        expect(LAB).toContain('private filter = "";');
        const thread = readFileSync(join(SRC, "application", "thinking", "thread.ts"), "utf8");
        expect(thread).toContain("if (!needle) return [...nodes];");
    });

    it("narrows and never reorders", () => {
        const thread = withoutComments(
            readFileSync(join(SRC, "application", "thinking", "thread.ts"), "utf8")
        );
        const filtering = thread.slice(thread.indexOf("export function filterThreads"));
        for (const ordering of [".sort(", "rank", "score", "relevance"]) {
            expect({ ordering, used: filtering.includes(ordering) }).toEqual({ ordering, used: false });
        }
    });

    it("keeps no saved filters — one you keep is a queue with a different name", () => {
        for (const saved of ["savedFilter", "recentFilters", "filterHistory", "suggestFilter"]) {
            expect({ saved, used: LAB.includes(saved) }).toEqual({ saved, used: false });
        }
    });

    it("uses no count, ranking or age warning in what it shows", () => {
        const keys = ["lab_filter_placeholder", "lab_filter_clear", "lab_filter_nothing", "lab_fold", "lab_unfold"];
        const queueish = /\b(pending|overdue|waiting|remaining|unprocessed|backlog|inbox|promising|stale|old|forgotten|should)\b/i;
        for (const key of keys) {
            const match = new RegExp(`${key}: '([^']*)'`).exec(EN_SRC);
            expect({ key, found: match !== null }).toEqual({ key, found: true });
            expect({ key, queueish: queueish.test(match?.[1] ?? "") }).toEqual({ key, queueish: false });
        }
    });

    it("treats folding as a view, not a decision to store", () => {
        // It survives a redraw and not a restart: nothing about how you looked at a thread
        // belongs on disk.
        expect(LAB).toContain("private readonly collapsed = new Set<string>();");
        const store = readFileSync(join(SRC, "architecture", "plugin", "thinking", "ThoughtStore.ts"), "utf8");
        expect(store.includes("collapsed")).toBe(false);
    });
});
