import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { LAB_KEYS } from "application/thinking/labKeys";
import { LAB_MOVE_VOCABULARY } from "application/thinking/move";

// test/architecture/components → 3 ups → repo root
const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const LAB = read("src/architecture/components/core/lab/LabRenderer.ts");
const MODAL = read("src/architecture/components/core/lab/CrystallizeModal.ts");
const CRYSTALLIZE = read("src/architecture/plugin/thinking/crystallizeThought.ts");

/**
 * **What the Lab already did was always a move** (#492, epic #489).
 *
 * The clearest evidence the epic *describes* the product rather than bolting a layer onto it: the
 * Lab's four thinking gestures start writing themselves down, **no new interface appears**, and
 * the Lab behaves exactly as it did. If retrofitting the theory had needed a refactor, the theory
 * would have been wrong.
 *
 * The renderer cannot be mounted in a node environment, so what is asserted here is structural —
 * where the recording happens, and everything it must **not** have changed. The recording rules
 * themselves are unit-tested in `move.test.ts` and `moveLog.test.ts`.
 */

/** The body of one method, so a rule can be about *where* something happens. */
function methodBody(source: string, signature: string): string {
    const at = source.indexOf(signature);
    if (at === -1) return "";
    const rest = source.slice(at);
    const end = rest.indexOf("\n    }");
    return end === -1 ? rest : rest.slice(0, end);
}

describe("the four gestures are written down (#492)", () => {
    it("records a branch or a challenge when the response is actually written", () => {
        // Not in `arm()`: arming only opens the composer. The move is the thing you did, never
        // the thing you were about to do.
        const commit = methodBody(LAB, "private async commit()");
        expect(commit).toContain("this.remember(");
        expect(commit).toContain('"challenge"');
        expect(commit).toContain('"fork"');
        expect(methodBody(LAB, "private arm(")).not.toContain("remember");
    });

    it("records one move for a whole thread set aside, not one per card", () => {
        const aside = methodBody(LAB, "private async aside(");
        expect(aside).toContain("this.remember(");
        expect(aside).toContain('"setAside"');
        expect(aside).toContain('"decidedAgainst"');
        expect((aside.match(/this\.remember\(/g) ?? [])).toHaveLength(1);
    });

    it("records crystallize with what it produced, once the note exists", () => {
        expect(MODAL).toContain("this.onDone(path)");
        const open = methodBody(LAB, "private openCrystallize()");
        expect(open).toContain('this.remember("crystallize"');
    });

    it("keeps the verdict and the operation apart", () => {
        // The judgement is "a human decided this chaos was an idea"; the move is "thinking became
        // knowledge, here, out of that thought". One answers whether it was accepted, the other
        // how it got here — collapsing them would lose the genealogy.
        expect(CRYSTALLIZE).toContain("JudgementLog.getInstance().record(");
        expect(CRYSTALLIZE).not.toContain("MoveLog");
    });

    it("inherits the lineage of whatever it acted on, with nothing to maintain", () => {
        const write = methodBody(LAB, "private write(");
        expect(write).toContain("forSubject(subject)");
        expect(write).toContain("from");
    });
});

describe("nothing about the Lab changed (#492)", () => {
    it("binds exactly the keys it bound before", () => {
        // The strongest statement that no interface was added: the key table is the interface.
        expect(LAB_KEYS.map((entry) => `${entry.shift ? "Shift+" : ""}${entry.key}:${entry.move}`)).toEqual([
            "j:next",
            "k:previous",
            "f:fork",
            "c:challenge",
            "l:connect",
            "x:pick",
            "y:crystallize",
            "s:setAside",
            "Shift+a:decidedAgainst",
            "Shift+d:discard",
            "escape:leave",
        ]);
    });

    it("already showed what produced a thought, so nothing was added to say it", () => {
        // A branch has read as a branch since #475: the ribbon is the acknowledgement the epic
        // asks for, and it is also the information. A second label would have been noise.
        expect(LAB).toContain("lab_challenges");
        expect(LAB).toContain("lab_forked");
        expect(LAB).toContain("lab-card-challenge");
    });

    it("records only from a gesture, never from a redraw", () => {
        // The Lab re-renders constantly. A recording inside a render path would write down moves
        // you never made — the same shape of bug as the composer that committed on a timer (#468).
        for (const method of ["private render()", "private redrawAfterAction()", "private refresh()"]) {
            expect({ method, records: methodBody(LAB, method).includes("remember(") }).toEqual({
                method,
                records: false,
            });
        }
    });
});

describe("the vocabulary decides, not the renderer (#492)", () => {
    it("refuses to record a Lab move that is not an act of thinking", () => {
        const remember = methodBody(LAB, "private remember(");
        expect(remember).toContain("LAB_MOVE_VOCABULARY[move]");
        expect(remember).toContain("if (!vocabulary) return;");
        expect(LAB_MOVE_VOCABULARY.discard).toBeNull();
        expect(LAB_MOVE_VOCABULARY.connect).toBeNull();
    });
});
