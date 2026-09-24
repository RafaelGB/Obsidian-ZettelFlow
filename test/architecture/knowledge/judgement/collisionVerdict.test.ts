import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import {
    COLLISION_SUBJECT_PREFIX,
    collisionVerdict,
    ruledOutCollisions,
} from "architecture/knowledge/judgement/collisionVerdict";
import { gapVerdict, ruledOutGaps } from "architecture/knowledge/judgement/gapVerdict";
import type { Judgement } from "architecture/knowledge/judgement";

// test/architecture/knowledge/judgement → 4 ups → repo root
const ROOT = join(__dirname, "..", "..", "..", "..");
const SRC = join(ROOT, "src");

const at = (entry: Omit<Judgement, "at">, when = 1): Judgement => ({ at: when, ...entry });

function sources(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) sources(full, out);
        else if (/\.tsx?$/.test(entry)) out.push(full);
    }
    return out;
}

/**
 * Nothing there is a finding (#568, epic #559).
 *
 * The same act as #534's *not related*, about the opposite object: a pair that almost touches, and
 * a pair nowhere near each other. So it is the same shape — and the shape is extracted rather than
 * copied, because a ruled-out set that disagreed with the one Home reads would make a pair vanish
 * from the front door for ever.
 */
describe("a collision you ruled on stops being drawn (#568)", () => {
    it("canonicalises the pair, so one pair is one entry", () => {
        expect(COLLISION_SUBJECT_PREFIX).toBe("collision:");
        const one = collisionVerdict("b.md", "a.md");
        const other = collisionVerdict("a.md", "b.md");
        expect(one).toEqual(other);
        expect(one).toEqual({
            path: "a.md",
            subject: "collision:b.md",
            origin: "derived",
            verdict: "rejected",
        });
    });

    it("never puts both paths in the subject", () => {
        // `|` is a legal filename character on macOS and Linux, so a two-path subject cannot be
        // parsed back — and `JudgementLog.record` scope-filters on `path`, which a two-path subject
        // would sail past.
        expect(collisionVerdict("a.md", "b.md").subject).not.toContain("|");
        expect(collisionVerdict("a.md", "b.md").path).not.toContain("|");
    });

    it("reads the record back, in either direction", () => {
        const ruled = ruledOutCollisions([at(collisionVerdict("a.md", "b.md"))]);
        expect(ruled.size).toBe(1);
        expect(ruled.has("a.md", "b.md")).toBe(true);
        expect(ruled.has("b.md", "a.md")).toBe(true);
        expect(ruled.has("a.md", "c.md")).toBe(false);
        expect([...ruled.pairs()]).toEqual([{ a: "a.md", b: "b.md" }]);
    });

    it("is idempotent: saying it twice changes nothing", () => {
        const twice = [at(collisionVerdict("a.md", "b.md"), 1), at(collisionVerdict("b.md", "a.md"), 2)];
        expect(ruledOutCollisions(twice).size).toBe(1);
    });

    it("ignores every other kind of verdict, including a gap about the same pair", () => {
        // Two different judgements about two different objects. A gap you ruled out is not a
        // collision you found nothing in, and reading one as the other would silently widen both.
        const history = [
            at(gapVerdict("a.md", "b.md")),
            at({ path: "a.md", subject: "claim:a.md", origin: "human", verdict: "accepted" }),
            at({ path: "a.md", subject: "collision:b.md", origin: "derived", verdict: "accepted" }),
        ];
        expect(ruledOutCollisions(history).size).toBe(0);
        expect(ruledOutGaps(history).has("a.md", "b.md")).toBe(true);
    });

    it("degrades to nothing ruled out rather than throwing on a hand-edited record", () => {
        const junk = [
            at({ path: "", subject: "collision:b.md", origin: "derived", verdict: "rejected" }),
            at({ path: "a.md", subject: "collision:", origin: "derived", verdict: "rejected" }),
            at({ path: "a.md", subject: "collision:a.md", origin: "derived", verdict: "rejected" }),
        ];
        expect(ruledOutCollisions(junk).size).toBe(0);
    });
});

/**
 * One filter, honoured by every reader (#568 AC-8).
 *
 * A verdict only the panel respected would be worse than none: the pair would be back from another
 * door and the button would look broken. So the set is built where it is applied, and the scan says
 * where that is.
 */
describe("the filter is built where it is applied (#568)", () => {
    it("is called in exactly the three places that may know about it", () => {
        // The **call**, not the name: `knowledgeApi.ts` names it in the table of exports it
        // declines, which is the opposite of using it.
        const users = sources(SRC)
            .filter((file) => readFileSync(file, "utf8").includes("ruledOutCollisions("))
            .map((file) => file.replace(SRC, "").replace(/\\/g, "/"))
            .sort();
        expect(users).toEqual([
            "/architecture/knowledge/judgement/collisionVerdict.ts",
            "/architecture/knowledge/map/drawCollision.ts",
            "/architecture/plugin/judgement/JudgementLog.ts",
        ]);
    });

    it("keeps the pair machinery in one file, not two", () => {
        const gap = readFileSync(join(SRC, "architecture/knowledge/judgement/gapVerdict.ts"), "utf8");
        // #534's own suite is deliberately unmodified: it is the contract this extraction kept.
        expect(gap).toContain("pairVerdict(GAP_SUBJECT_PREFIX");
        expect(gap).toContain("ruledOutPairs(history, GAP_SUBJECT_PREFIX)");
        expect(gap).not.toContain("PAIR_SEPARATOR");
    });
});
