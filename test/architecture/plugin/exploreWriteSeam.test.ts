import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { createMapOfContent } from "architecture/plugin/explore/createMapOfContent";
import { rowFacts } from "architecture/knowledge/query/answer";
import { idea, buildModel } from "../../actions/knowledge/support/knowledgeFixture";

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const WRITER = read("src/architecture/plugin/explore/createMapOfContent.ts");
const PURE = read("src/application/explore/mapOfContent.ts");
const RENDERER = read("src/architecture/components/core/askGraph/AskGraphRenderer.ts");
const MODAL = read("src/architecture/components/core/askGraph/MapOfContentModal.ts");

/**
 * Comments stripped. A rule about what the code must not say has to be judged on the code: the
 * doc comment explaining *"nothing is summarised"* would otherwise fail the very test it
 * describes — a trap this repo has fallen into twice.
 */
function code(source: string): string {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");
}

/**
 * **Taking a selection somewhere, safely** (#486, epic #481).
 *
 * Explore is a read-only surface with exactly one write in it, and that write has to behave like
 * every other write in the plugin: through `FileService`, inside a batch, recorded, undoable, and
 * never overwriting. These are the structural assertions; the note's shape is tested purely in
 * `mapOfContent.test.ts`.
 */

describe("the one write goes through the one door (#486)", () => {
    it("creates through FileService inside a write batch, never the vault directly", () => {
        expect(WRITER).toContain("withWriteBatch(");
        expect(WRITER).toContain("FileService.createFile(");
        // The seam guardrail scans all of src/ for these, but stating it here says why it matters:
        // this is where the write record is taken, which is what makes the map undoable for free.
        expect(WRITER).not.toMatch(/vault\.(create|modify|delete|trash)\b/);
    });

    it("names an origin, so Recent can say what wrote the note", () => {
        expect(WRITER).toContain('ref: "map-of-content"');
        expect(WRITER).toContain('kind: "manual"');
    });

    it("never overwrites — a taken name gets a number", async () => {
        const taken = new Set(["Notes/state permanent.md"]);
        const written: string[] = [];
        const model = buildModel([idea("a.md", "permanent")]);
        // The write itself needs a vault; the naming decision does not, so it is checked here by
        // letting the create fail and reading which path it tried.
        const path = await createMapOfContent({
            matches: model.all(),
            terms: ["state:permanent"],
            facts: (each) => rowFacts(each, ["state:permanent"], model),
            factText: (fact) => `${fact.key} ${fact.value}`,
            name: "state:permanent",
            queryKey: "zfQuery",
            intro: "x",
            andMore: (n) => `${n}`,
            folder: "Notes",
            exists: (candidate) => {
                written.push(candidate);
                return taken.has(candidate);
            },
        });
        // No vault in this environment, so the write fails and returns undefined — what matters is
        // that it asked about the taken name first and moved on.
        expect(written[0]).toBe("Notes/state permanent.md");
        expect(written[1]).toBe("Notes/state permanent 2.md");
        expect(path).toBeUndefined();
    });
});

describe("the clipboard is only touched on purpose (#486)", () => {
    it("writes to it inside the copy handler and nowhere else", () => {
        const uses = RENDERER.match(/navigator\.clipboard/g) ?? [];
        expect(uses).toHaveLength(1);
        expect(RENDERER).toMatch(/explore_copy_links[\s\S]{0,200}navigator\.clipboard\.writeText/);
    });
});

describe("the map stays mechanical (#486)", () => {
    it("writes no conclusion: the pure module has no field a verdict could live in", () => {
        // §XII: a gathered list needs no accept/reject gate. A "what these have in common"
        // section would, and this is the test that notices it arriving.
        for (const word of ["summary", "summarise", "summarize", "insight", "conclusion", "theme"]) {
            const present = code(PURE).toLowerCase().includes(word);
            expect({ word, present }).toEqual({ word, present: false });
        }
    });

    it("reaches no AI and no network, from either side", () => {
        for (const source of [PURE, WRITER, MODAL]) {
            expect(source).not.toMatch(/\bfetch\(|requestUrl|ZfAi|openai|anthropic/i);
        }
    });

    it("offers no map of everything — the action needs a selection", () => {
        expect(RENDERER).toMatch(/if \(this\.terms\.length === 0\) return;/);
    });
});
