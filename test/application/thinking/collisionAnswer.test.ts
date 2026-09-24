import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { newThought, parseThought, renderThought } from "application/thinking/thought";

// test/application/thinking → 3 ups → repo root
const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

function code(source: string): string {
    return source
        .split(String.fromCharCode(10))
        .filter((line) => {
            const trimmed = line.trim();
            return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
        })
        .join(String.fromCharCode(10));
}

const PANEL = code(read("src/architecture/components/core/lab/CollisionPanel.ts"));
const LAB = code(read("src/architecture/components/core/lab/LabRenderer.ts"));
const STORE = code(read("src/architecture/plugin/thinking/ThoughtStore.ts"));

/**
 * A thought about two notes (#567, epic #559).
 *
 * An answer to a collision is about **both** halves of it, and both of their timelines have to say
 * so. `about` stayed what it always was — *the one note this thread came from* — and gained a
 * sibling, because widening it to a list would have retyped six readers to serve one feature.
 */
describe("a thought can be about two notes (#567)", () => {
    const made = () =>
        newThought({ text: "both are about feedback", id: "abcd1234", at: 1_700_000_000_000, about: "A.md", alsoAbout: "B.md" });

    it("round-trips through the file it is", () => {
        const file = renderThought(made());
        expect(file).toContain("about: A.md");
        expect(file).toContain("alsoAbout: B.md");
        const back = parseThought(file, "_ZettelFlow/lab/1700-abcd1234.md");
        expect(back.about).toBe("A.md");
        expect(back.alsoAbout).toBe("B.md");
    });

    it("leaves an ordinary thought exactly as it was", () => {
        const one = newThought({ text: "just a thought", id: "e5f6g7h8", at: 1, about: "A.md" });
        expect(one.alsoAbout).toBeUndefined();
        expect(renderThought(one)).not.toContain("alsoAbout");
        expect(parseThought(renderThought(one), "x.md").alsoAbout).toBeUndefined();
    });

    it("drops a blank second subject like a blank first one", () => {
        expect(newThought({ text: "t", id: "i", at: 1, about: "A.md", alsoAbout: "" }).alsoAbout).toBeUndefined();
    });

    it("is found from either note", () => {
        // The store compares both fields, so both timelines read a link that was already in the
        // data — no new recording path, and retroactive like the strand it feeds (#540).
        expect(STORE).toContain('front["about"] !== notePath && front["alsoAbout"] !== notePath');
        expect(STORE).toContain("alsoAbout?: string");
    });
});

/**
 * The panel answers nothing (#567 FR-3, and #497's rule).
 *
 * If the system could say what two distant notes share, there would be nothing left to do. So this
 * is asserted structurally: the panel has no door to anything that could produce an answer.
 */
describe("the panel poses, and never proposes (#567)", () => {
    it("reaches no AI, and no writer", () => {
        for (const forbidden of ["ZfAi", "zf.ai", "propose(", "FileService", "FrontmatterService", "MoveLog", "ThoughtStore"]) {
            expect({ forbidden, found: PANEL.includes(forbidden) }).toEqual({ forbidden, found: false });
        }
    });

    it("is built the Obsidian way, and moves nothing from JavaScript", () => {
        expect(PANEL).toContain("this.host.empty()");
        expect(PANEL).not.toContain("innerHTML");
        expect(PANEL).not.toContain("el.style.");
        expect(PANEL).not.toContain("setInterval");
    });

    it("shows two cards and one question, and says when there is nothing to show", () => {
        expect(PANEL).toContain('t("collision_title")');
        expect(PANEL).toContain('t("collision_nothing_far_enough")');
        expect(PANEL).toContain("is-active");
    });

    it("reads a model it was handed, never one it went looking for", () => {
        expect(PANEL).not.toContain("KnowledgeIndex");
        expect(PANEL).not.toContain("drawCollision(");
    });
});

/**
 * Arming, and the move that is not recorded yet (#567 FR-7, the #500 rule).
 *
 * A collision you looked at is not an act of thinking. The frame is `analogy` and the move is
 * written down when the **thought** is, through the path #499 already built.
 */
describe("the pair arms the composer, and writing is the act (#567)", () => {
    it("arms both subjects and the frame", () => {
        expect(LAB).toContain("this.alsoAbout = pair.b");
        expect(LAB).toContain('this.frame = "analogy"');
    });

    it("passes the second subject to the write, and inherits it on a response", () => {
        expect(LAB).toContain("alsoAbout: alsoSubject");
        expect(LAB).toContain("alsoSubjectOf(relation.to)");
    });

    it("records nothing when the pair merely appears", () => {
        const arm = LAB.slice(LAB.indexOf("private armPair("), LAB.indexOf("private forgetPair("));
        expect(arm).not.toContain("remember");
        expect(arm).not.toContain("MoveLog");
    });

    it("does not name one note when two are on screen", () => {
        expect(LAB).toContain("if (this.about && !this.colliding)");
    });

    it("touches neither note", () => {
        // The panel and the collision branch spell no vault write. The write seam's own guardrail
        // covers the rest of the product; this is the local promise.
        for (const forbidden of ["vault.create", "vault.modify", "processFrontMatter"]) {
            expect({ forbidden, found: LAB.includes(forbidden) }).toEqual({ forbidden, found: false });
        }
    });
});
