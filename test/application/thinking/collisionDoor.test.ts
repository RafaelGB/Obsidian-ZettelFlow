import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { drawCollision } from "architecture/knowledge/map/drawCollision";
import { MOVE_VERBS, effectOf } from "application/thinking/move";
import { idea, buildModel } from "../../actions/knowledge/support/knowledgeFixture";

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

const LAB = code(read("src/architecture/components/core/lab/LabRenderer.ts"));
const MOVES = code(read("src/starters/zcomponents/MoveCommandsComponent.ts"));

const model = buildModel([
    idea("hubA.md", "permanent", [{ to: "a1.md" }, { to: "a2.md" }]),
    idea("a1.md", "permanent", []),
    idea("a2.md", "permanent", []),
    idea("hubB.md", "permanent", [{ to: "b1.md" }, { to: "b2.md" }]),
    idea("b1.md", "permanent", []),
    idea("b2.md", "permanent", []),
]);

/**
 * The door that already exists (#569, epic #559).
 *
 * A collision reached only from inside the thinking space is a feature you have to remember. The
 * gesture that means exactly this is already on every note — *Make a move… → analogy* — and the
 * point of this issue is how little it takes: **nothing in the move vocabulary changes.**
 */
describe("analogy on a note brings something far away (#569)", () => {
    it("changes nothing about the verb", () => {
        // `analogy` already opens the thinking space framed about the note (#499), and `commit()`
        // already records the move when the thought is written (#500). The spec's phrasing invites
        // an edit to the component; this is the assertion that it did not happen.
        expect(MOVE_VERBS).toHaveLength(11);
        expect(effectOf("analogy", "note")).toBe("space");
        expect(MOVES).not.toContain("analogy");
        expect(MOVES).not.toContain("collision");
        expect(MOVES).not.toContain("addCommand(");
    });

    it("opens onto a pair when the space is entered framed", () => {
        expect(LAB).toContain('this.frame === "analogy" && this.about');
        expect(LAB).toContain("this.anchor = this.about");
        expect(LAB).toContain("{ from: this.anchor }");
    });

    it("keeps the note you came from on one side of every draw", () => {
        for (let seed = 1; seed <= 50; seed++) {
            const pair = drawCollision(model, { seed, distance: "far", from: "a1.md" });
            if (!pair) continue;
            expect(pair.a === "a1.md" || pair.b === "a1.md").toBe(true);
            expect(pair.a).not.toBe(pair.b);
        }
    });

    it("lets the anchor go when the panel is closed", () => {
        expect(LAB).toContain("this.anchor = undefined;");
    });

    it("records one move, whichever door you came through", () => {
        // One declaration and exactly one call site: `rememberFramed` is the single recorder, at
        // commit time. Two doors, one path.
        expect((LAB.match(/this\.rememberFramed\(/g) ?? [])).toHaveLength(1);
        expect(LAB).toContain("this.frame = undefined;");
    });

    it("offers the move only where a note is knowledge", () => {
        expect(MOVES).toContain("isKnowledge(");
        expect(MOVES).toContain("scopeExcludedPaths(this.plugin.settings)");
    });

    it("adds no fifth move to the Lab", () => {
        // Fork, challenge, connect, leave — and the collision is an **operator**, not a move. The
        // Lab's own promise, and the thing this epic exists to not break.
        expect(LAB).not.toContain("lab_move_collide");
        expect(LAB).not.toContain('as: "collision"');
    });
});
