import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { buildHome } from "architecture/knowledge/home/home";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

const ROOT = join(__dirname, "..", "..", "..", "..");
const SRC = join(ROOT, "src");
const NOW = 1_000_000_000_000;

/**
 * **What to do next, in one place** (#507, epic #504).
 *
 * `findDiscoveries` was rendered twice — on Home as suggested connections, and as Discovery's
 * Connections mode — and Home had it first. `openQuestions` was rendered once, in Discovery, and
 * is the same kind of thing: not a filter over your vault but an answer to *what should I do
 * next*, which is the question Home exists for.
 */

function sources(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...sources(full));
        else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(full);
    }
    return out;
}

describe("Home knows what is unanswered (#507)", () => {
    it("carries the open questions, capped like every other section", () => {
        const many = Array.from({ length: 9 }, (_, n) =>
            idea(`q${n}.md`, "permanent", [], { claims: [{ text: `question:: is it ${n}?` }] })
        );
        const home = buildHome(buildModel(many), { thinkingDays: 1, now: NOW });
        expect(home.openQuestions.length).toBeLessThanOrEqual(5);
    });

    it("says nothing when a vault has nothing unanswered", () => {
        const home = buildHome(buildModel([idea("a.md", "permanent")]), { thinkingDays: 0, now: NOW });
        expect(home.openQuestions).toEqual([]);
    });
});

describe("and it shows each thing once (#507)", () => {
    it("computes suggested connections in exactly one place in the model layer", () => {
        // Two *surfaces* rendered `findDiscoveries` before this — Home and Discovery's mode —
        // and Home had it first. The renderer count is asserted in #508, which deletes the other
        // one; what belongs here is that Home does not compute it twice. The dashboard and the
        // scripting API are different consumers, not duplicate surfaces.
        const callers = sources(SRC)
            .map((path) => ({ rel: path.slice(SRC.length + 1).replace(/\\/g, "/"), code: readFileSync(path, "utf8") }))
            .filter((file) => /findDiscoveries\(/.test(file.code))
            .map((file) => file.rel)
            .filter((rel) => rel.startsWith("architecture/knowledge/home/"));
        expect(callers).toEqual(["architecture/knowledge/home/home.ts"]);
    });

    it("renders the questions section only when there is something in it", () => {
        const renderer = readFileSync(
            join(SRC, "architecture", "components", "core", "home", "HomeModeRenderer.ts"),
            "utf8"
        );
        expect(renderer).toContain("if (questions.length === 0) return;");
        // Home is the front door: a model shape from an older build degrades to one missing
        // section, never to a blank surface.
        expect(renderer).toContain("this.home.openQuestions ?? []");
    });
});

describe("it states, and never scores (#507)", () => {
    it("says nothing about how many are open, or for how long", () => {
        // §XII: Home is the surface most likely to start keeping score. "14 unanswered" is a
        // count; "still unanswered after three weeks" is a reproach.
        const REPROACH = [/\bstill\b/i, /\bovedue\b/i, /\byou have\b/i, /\btodavía\b/i, /\bllevas\b/i, /\bpendiente desde\b/i];
        for (const [name, locale] of [["en", en], ["es", es]] as const) {
            const value = (locale as Record<string, string>).home_section_open_questions;
            expect({ name, offends: REPROACH.some((p) => p.test(value)) }).toEqual({ name, offends: false });
        }
    });
});
