import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

// test/architecture/components → 3 ups → repo root
const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const LAB = read("src/architecture/components/core/lab/LabRenderer.ts");
const COMMANDS = read("src/starters/zcomponents/MoveCommandsComponent.ts");
const LOG = read("src/architecture/plugin/thinking/MoveLog.ts");
const CAPTURE = read("src/zettelkasten/modals/QuickCaptureModal.ts");
const MOVE = read("src/application/thinking/move.ts");

/**
 * **A move you did not make is not a move** (#500, epic #497).
 *
 * Once a framed verb opens a space, *when* does the move get recorded? On the gesture is the
 * obvious answer and it is wrong: you would open a composer, think better of it, close it — and
 * your history would claim you challenged that note. It would also force the move to be
 * **mutated later** to name what it produced, and a log that rewrites itself is a log you cannot
 * trust.
 */

function code(source: string): string {
    return source
        .split("\n")
        .filter((line) => {
            const trimmed = line.trim();
            return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
        })
        .join("\n");
}

function methodBody(source: string, signature: string): string {
    const at = source.indexOf(signature);
    if (at === -1) return "";
    const rest = source.slice(at);
    const end = rest.indexOf("\n    }");
    return end === -1 ? rest : rest.slice(0, end);
}

describe("the gesture records nothing (#500)", () => {
    it("a framed verb opens the space and writes no move", () => {
        const perform = methodBody(code(COMMANDS), "private perform(");
        const opens = perform.slice(0, perform.indexOf("recordMoveOn"));
        expect(opens).toContain("activateSurface");
        expect(opens).not.toContain("MoveLog");
        expect(opens).not.toContain("record(");
    });

    it("a verb that only records still records now — there is nothing else coming", () => {
        expect(methodBody(code(COMMANDS), "private perform(")).toContain("recordMoveOn(verb, path);");
    });
});

describe("writing is the act (#500)", () => {
    const commit = methodBody(code(LAB), "private async commit()");

    it("records the framed move against the note, naming the thought it produced", () => {
        expect(commit).toContain("this.rememberFramed(framed, this.about, made.id)");
        const framed = methodBody(code(LAB), "private rememberFramed(");
        expect(framed).toContain("this.write(entry.primitive, entry.verb, note, thought)");
    });

    it("records the framed move *instead of* the Lab's own, never both", () => {
        // A framed thought about a note is not also a fork of a thought. Two moves for one act
        // would double every entry in the replay.
        expect(commit).toContain("} else if (relation) {");
    });

    it("consumes the frame, so a second thought records nothing more", () => {
        expect(commit.indexOf("this.frame = undefined;")).toBeLessThan(commit.indexOf("rememberFramed"));
    });
});

describe("the log is append-only (#500)", () => {
    it("exposes no way to change a move that was already written", () => {
        // The rejected design was: record on the gesture, patch `produced` in later. A log that
        // rewrites itself is a log you cannot trust.
        expect(code(LOG)).not.toMatch(/\b(update|patch|amend|setProduced)\s*\(/);
        // `getInstance` is `public static` and does not match, which is fine: what this pins is
        // the instance surface, and the point is that nothing on it writes twice to one move.
        const methods = [...code(LOG).matchAll(/public (\w+)\(/g)].map((m) => m[1]);
        expect(methods.sort()).toEqual(["all", "flush", "forSubject", "init", "record", "remove", "reset"]);
    });
});

describe("capture finally means something (#500)", () => {
    it("quick capture records externalize · capture", () => {
        expect(code(CAPTURE)).toContain('primitive: "externalize", verb: "capture"');
        expect(code(CAPTURE)).toContain("subject: made.id");
    });
});

describe("and there is nowhere left to write a reason (#500)", () => {
    it("the record has no field for one", () => {
        // The epic asked for a capped line on `set-aside`. Writing it made the case against:
        // it needs a second modal in a path whose whole rule is that nothing asks you to justify
        // a move, and the reason is a thought everywhere else. A field nobody fills is drift.
        expect(code(MOVE)).not.toContain("because?");
        expect(code(MOVE)).not.toContain("BECAUSE_LIMIT");
    });

    it("and nothing prompts for one", () => {
        for (const source of [code(COMMANDS), code(LAB)]) {
            expect(source).not.toMatch(/because/);
        }
    });
});
