import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { applyClaim, applySource, declaredSources, SOURCE_EDIT_INDEX } from "application/claims";

// test/application/claims → 3 ups → repo root
const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/**
 * Comments stripped. A rule about what the code must not reach has to be judged on the code — the
 * doc comment explaining *why* `setProperty(SOURCE_KEYS[0])` was wrong says the words, and would
 * otherwise fail the test it describes. (Fifth time this trap has been sprung in this repo.)
 */
function code(source: string): string {
    return source
        .split(String.fromCharCode(10))
        .filter((line) => {
            const trimmed = line.trim();
            return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
        })
        .join(String.fromCharCode(10));
}

/**
 * Where a claim came from (#582, epic #558).
 *
 * #561 gave the claim a door and left this half in YAML, with a consequence nobody had felt before:
 * a claim with no source **is** `unsourced`, and that carries weight in the knowledge debt. The door
 * asked for a sentence, got one, and answered with a penalty it never mentioned.
 */
describe("the source goes on the note, and nothing else moves (#582)", () => {
    it("writes one key on a note that had none", () => {
        const frontmatter: Record<string, unknown> = {};
        expect(applySource(frontmatter, "[[Team topologies]]")).toBe(true);
        expect(frontmatter).toEqual({ source: "[[Team topologies]]" });
        expect(SOURCE_EDIT_INDEX).toBe(0);
    });

    it("replaces the first of a list and keeps the rest — the data loss this fixes", () => {
        const frontmatter: Record<string, unknown> = { source: ["[[A]]", "[[B]]", "[[C]]"] };
        expect(applySource(frontmatter, "[[D]]")).toBe(true);
        expect(frontmatter.source).toEqual(["[[D]]", "[[B]]", "[[C]]"]);
    });

    it("writes under the key the note already uses", () => {
        // `SOURCE_KEYS` has two members. A note declaring `sources:` must not sprout a `source:`.
        const frontmatter: Record<string, unknown> = { sources: ["[[A]]"] };
        expect(applySource(frontmatter, "[[B]]")).toBe(true);
        expect(frontmatter).toEqual({ sources: ["[[B]]"] });
        expect("source" in frontmatter).toBe(false);
    });

    it("writes nothing at all for a blank line", () => {
        const frontmatter: Record<string, unknown> = { claim: "kept", source: "[[A]]" };
        const before = JSON.parse(JSON.stringify(frontmatter));
        expect(applySource(frontmatter, "   ")).toBe(false);
        expect(applySource(frontmatter, "")).toBe(false);
        expect(frontmatter).toEqual(before);
    });

    it("reads what the note declares, under either key", () => {
        expect(declaredSources({ source: "[[A]]" })).toEqual(["[[A]]"]);
        expect(declaredSources({ sources: ["[[A]]", "  [[B]]  "] })).toEqual(["[[A]]", "[[B]]"]);
        expect(declaredSources({ source: "[[A]]", sources: ["[[B]]"] })).toEqual(["[[A]]", "[[B]]"]);
        expect(declaredSources({ source: ["", 7, "ok"] })).toEqual(["ok"]);
        expect(declaredSources({})).toEqual([]);
        expect(declaredSources(undefined)).toEqual([]);
    });

    it("keeps the claim and the source independent", () => {
        const frontmatter: Record<string, unknown> = { title: "t" };
        applyClaim(frontmatter, "microservices move complexity");
        applySource(frontmatter, "https://example.org/paper");
        expect(Object.keys(frontmatter)).toEqual(["title", "claim", "source"]);
        expect(frontmatter.source).toBe("https://example.org/paper");
    });
});

/**
 * One writer (#582 AC-7).
 *
 * There were **three** before this: the `AttachSource` action, the new door, and Cultivate's source
 * move, which wrote the key directly and clobbered any list already there. The field is built in one
 * place, and this is the scan that keeps it that way.
 */
describe("there is one source writer in the product (#582)", () => {
    it("builds the field in exactly one place", () => {
        const logic = read("src/actions/attachSource/attachSourceLogic.ts");
        expect((logic.match(/export function sourceField/g) ?? [])).toHaveLength(1);
        expect(read("src/application/claims/sourceEdit.ts")).toContain("sourceField(raw)");
    });

    it("no longer sets the source key straight from Cultivate", () => {
        const cultivation = code(read("src/architecture/plugin/services/CultivationService.ts"));
        expect(cultivation).toContain("applySource(");
        expect(cultivation).not.toContain("setProperty(SOURCE_KEYS");
    });

    it("writes the claim and the source in one update, so they are one undo", () => {
        const stated = code(read("src/architecture/plugin/claims/statedClaim.ts"));
        const update = stated.slice(stated.indexOf("FrontmatterService.instance(file).update"));
        expect(update).toContain("applyClaim(frontmatter, text)");
        expect(update).toContain("applySource(frontmatter, source)");
        // One batch, as before: the sentence and where it came from are one thing you said.
        expect((stated.match(/withWriteBatch\(\{/g) ?? [])).toHaveLength(1);
    });

    it("offers the line without asking for it", () => {
        const modal = code(read("src/architecture/components/core/claims/ClaimDoorModal.ts"));
        expect(modal).toContain("claim_door_source_placeholder");
        expect(modal).toContain("declaredSourcesOf(this.file)");
        expect(modal).toContain("new SourceNoteSuggest(source)");
        expect(modal).not.toContain("el.style.");
        // Nothing here marks it required, missing or incomplete.
        expect(modal).not.toMatch(/required|missing|incomplete/i);
    });

    it("picks a note inline, because a modal over a modal is a form", () => {
        const suggest = code(read("src/architecture/components/core/claims/SourceNoteSuggest.ts"));
        expect(suggest).toContain("extends TextInputSuggest<TFile>");
        expect(suggest).toContain("[[${file.basename}]]");
        expect(suggest).not.toContain("SuggestModal");
    });
});
