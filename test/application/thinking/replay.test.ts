import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { replayLines } from "application/thinking/replay";
import { movesFor, newMove, type Move } from "application/thinking/move";
import { timelineEvents } from "architecture/knowledge/timeline/timelineEvents";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";
import { SURFACES } from "architecture/components/core/surface/surfaceRegistry";

const ROOT = join(__dirname, "..", "..", "..");
const TIMELINE = readFileSync(
    join(ROOT, "src", "architecture", "components", "core", "timeline", "EvolutionTimelineRenderer.ts"),
    "utf8"
);

/**
 * **How you got here** (#494, epic #489).
 *
 * The replay is the epic's promise made visible, and the obvious implementation is the wrong one:
 * a panel with a table of verbs and timestamps is a log viewer, and a fifth place to look at
 * things. It lands on the timeline that already answers *how did this note change*, because
 * "what you did" is the same question.
 */

const DAY = 86_400_000;
const move = (id: string, at: number, verb = "challenge"): Move =>
    newMove({ id, at, primitive: "perturb", verb, subject: "a.md" });

describe("three strands, one stream (#494)", () => {
    const snapshots = [{ at: 2, path: "a.md", state: "permanent", claims: [], links: [] }] as never[];
    const judgements = [{ at: 2, path: "a.md", subject: "s", origin: "human", verdict: "accepted" }] as never[];

    it("merges moves with snapshots and judgements, in time order", () => {
        const events = timelineEvents(snapshots, judgements, [move("m", 1)]);
        expect(events.map((event) => event.kind)).toEqual(["move", "snapshot", "judgement"]);
    });

    it("breaks a tie the same way whatever order it was handed", () => {
        const at = [move("m", 2)];
        const forwards = timelineEvents(snapshots, judgements, at).map((e) => e.kind);
        const backwards = timelineEvents([...snapshots].reverse(), [...judgements].reverse(), at).map((e) => e.kind);
        expect(forwards).toEqual(backwards);
        expect(forwards).toEqual(["snapshot", "judgement", "move"]);
    });

    it("leaves a note with no moves exactly as it was", () => {
        // The third argument defaults to empty, which is why every existing caller and every
        // existing timeline test is untouched by this change.
        expect(timelineEvents(snapshots, judgements)).toEqual(timelineEvents(snapshots, judgements, []));
    });
});

describe("a story has paragraphs (#494)", () => {
    it("groups consecutive moves on one day into one dated line", () => {
        const base = Date.UTC(2026, 0, 2, 9);
        const lines = replayLines([
            move("a", base),
            move("b", base + 3600_000),
            move("c", base + 2 * 3600_000),
            move("d", base + DAY),
        ]);
        expect(lines).toHaveLength(2);
        expect(lines[0].moves.map((m) => m.id)).toEqual(["a", "b", "c"]);
        expect(lines[1].moves.map((m) => m.id)).toEqual(["d"]);
    });

    it("reads oldest first, whatever order it was given", () => {
        const base = Date.UTC(2026, 0, 2, 9);
        const shuffled = [move("c", base + DAY), move("a", base), move("b", base + 60_000)];
        expect(replayLines(shuffled).flatMap((line) => line.moves.map((m) => m.id))).toEqual(["a", "b", "c"]);
    });

    it("has nothing to say about an empty history", () => {
        expect(replayLines([])).toEqual([]);
    });
});

describe("it restates, and never concludes (#494)", () => {
    /**
     * A run of moves invites a conclusion, and this is the single most likely place for a helpful
     * sentence to arrive in six months. A note in a review will not stop it; this will.
     */
    const VERDICTS = [
        /\bproductive\b/i,
        /\bshallow\b/i,
        /\bwell[- ]developed\b/i,
        /\bstalled\b/i,
        /\bthorough\b/i,
        /\bdeberías\b/i,
        /\bsuperficial\b/i,
        /\bestancad/i,
    ];

    it("characterises no sequence, in either locale", () => {
        for (const [name, locale] of [["en", en], ["es", es]] as const) {
            const offenders = Object.entries(locale as Record<string, string>)
                .filter(([key]) => key.startsWith("move_") || key.startsWith("evolution_timeline_move"))
                .filter(([, value]) => VERDICTS.some((pattern) => pattern.test(value)))
                .map(([key, value]) => `${key}: ${value}`);
            expect({ locale: name, offenders }).toEqual({ locale: name, offenders: [] });
        }
    });

    it("the timeline counts nothing about the run", () => {
        // Counting transformations is still counting, and the manifesto refuses productivity
        // metrics. The moves are shown; the sequence is not scored.
        expect(TIMELINE).not.toMatch(/moves\.length\s*[><]/);
        expect(TIMELINE).not.toContain("moveScore");
    });
});

describe("it costs no new place to look (#494)", () => {
    it("adds no surface", () => {
        expect(SURFACES).toHaveLength(4);
    });

    it("renders the moves where the question already lives", () => {
        expect(TIMELINE).toContain("renderMove(");
        expect(TIMELINE).toContain("MoveLog.getInstance().forSubject(");
    });

    it("shows them even when snapshot recording is off", () => {
        // The timeline is opt-in because it stores claim *texts*. A move stores none, so the
        // reason for the opt-in does not reach it — and a user with snapshots off would
        // otherwise have moves and nowhere to read them.
        const recompute = TIMELINE.slice(TIMELINE.indexOf("private recompute()"));
        const disabled = recompute.slice(0, recompute.indexOf("this.events = timelineEvents"));
        expect(disabled).toContain("timeline.enabled()");
        expect(TIMELINE).toContain("MoveLog.getInstance().forSubject(active.path)");
    });

    it("lets you take a move back from where you can see it is wrong", () => {
        expect(TIMELINE).toContain("MoveLog.getInstance().remove(move.id)");
        // And taking it back touches the log, never the note.
        expect(TIMELINE).not.toMatch(/FileService|FrontmatterService/);
    });
});

describe("one story, across the boundary (#502)", () => {
    const TIMELINE_SRC = readFileSync(
        join(ROOT, "src", "architecture", "components", "core", "timeline", "EvolutionTimelineRenderer.ts"),
        "utf8"
    );

    it("names what a move produced, and opens it", () => {
        expect(TIMELINE_SRC).toContain("renderProduced(");
        expect(TIMELINE_SRC).toContain("evolution_timeline_move_produced");
        expect(TIMELINE_SRC).toContain("makeActivatable(span,");
    });

    it("names a discarded thought without linking it", () => {
        // The Lab is a place things are deliberately thrown away, and a dead link is worse than
        // a plain fact. Existence is checked before the entry is made activatable, not after a
        // click fails.
        expect(TIMELINE_SRC).toContain("this.app.vault.getAbstractFileByPath(path) !== null");
        expect(TIMELINE_SRC).toContain("evolution-timeline-produced-gone");
        expect(TIMELINE_SRC).toContain("if (exists) makeActivatable");
    });

    it("reads the loop in order, out to the thought and back into the note", () => {
        // `movesFor` matches on subject **or** produced, so both ends of the loop already land on
        // the note's timeline: this is rendering, not new data.
        const note = "Ideas/atomicity.md";
        const thought = "_zf/thinking/1-a.md";
        const out = newMove({ id: "m1", at: 1, primitive: "perturb", verb: "challenge", subject: note, produced: thought });
        const back = newMove({ id: "m2", at: 2, primitive: "crystallize", verb: "crystallize", subject: thought, produced: note });
        const events = timelineEvents([], [], movesFor(note, [back, out]));
        expect(events.map((event) => event.move?.id)).toEqual(["m1", "m2"]);
    });
});
