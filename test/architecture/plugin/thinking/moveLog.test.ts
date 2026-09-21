import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { MoveLog, type MoveHost } from "architecture/plugin/thinking/MoveLog";
import { MOVE_CEILING, MOVES_PER_SUBJECT, type Move } from "application/thinking/move";

/**
 * **A move leaves a fact** (#491, epic #489).
 *
 * `JudgementLog` with a different payload and one extra promise: **nothing records itself**. The
 * allow-list that enforces that lives in `moveSeam.test.ts`; what is here is everything the log
 * owes its callers — it never throws, it never fires before the plugin exists, it never grows
 * without bound, and a corrupt blob on disk costs you the log rather than the plugin.
 */

function host(over: Partial<MoveHost["settings"]> = {}): MoveHost & { saved: number } {
    const settings = {
        moves: { log: [] as Move[] },
        thoughtLabPath: "_zf/thinking",
        ...over,
    } as MoveHost["settings"];
    const made = {
        settings,
        saved: 0,
        saveSettings() {
            made.saved++;
        },
    };
    return made;
}

// Ids are injected rather than generated: jest's environment hands `uuid4()` a deterministic
// RNG, so two calls return the same string and a log keyed on it would silently collapse two
// moves into one. Injecting is also what the write record already does, for the same reason.
let seq = 0;
const entry = (over: Partial<Move> = {}) => ({
    id: `m${++seq}`,
    primitive: "perturb" as const,
    verb: "challenge",
    subject: "a.md",
    ...over,
});

describe("it is safe before there is a plugin (#491)", () => {
    beforeEach(() => MoveLog.getInstance().reset());

    it("records nothing, and does not throw, before init", () => {
        // getOwnPlugin() returns nothing during enable (#374); a log that assumed otherwise would
        // take the plugin down with it on every reload.
        expect(() => MoveLog.getInstance().record(entry())).not.toThrow();
        expect(MoveLog.getInstance().all()).toEqual([]);
    });
});

describe("what it persists, and when (#491)", () => {
    beforeEach(() => MoveLog.getInstance().reset());

    it("collapses a burst into one save", () => {
        jest.useFakeTimers();
        const owner = host();
        MoveLog.getInstance().init(owner);
        for (let n = 0; n < 10; n++) MoveLog.getInstance().record(entry({ subject: `n${n}.md` }));
        expect(owner.settings.moves.log).toHaveLength(10);
        expect(owner.saved).toBe(0);
        jest.runAllTimers();
        expect(owner.saved).toBe(1);
        jest.useRealTimers();
    });

    it("degrades a corrupt blob to an empty log rather than throwing", () => {
        const owner = host({ moves: { log: "not an array" } as never });
        MoveLog.getInstance().init(owner);
        expect(MoveLog.getInstance().all()).toEqual([]);
        expect(() => MoveLog.getInstance().record(entry())).not.toThrow();
    });

    it("drops an unknown verb on read and keeps the rest", () => {
        const owner = host({
            moves: {
                log: [
                    { id: "1", at: 1, primitive: "perturb", verb: "challenge", subject: "a.md" },
                    { id: "2", at: 2, primitive: "perturb", verb: "steelman", subject: "a.md" },
                    { id: "3", at: 3, primitive: "nonsense", verb: "challenge", subject: "a.md" },
                ] as never,
            },
        });
        MoveLog.getInstance().init(owner);
        expect(MoveLog.getInstance().all().map((m) => m.id)).toEqual(["1"]);
    });

    it("drops a field the type never declared, so a body cannot arrive from disk", () => {
        const owner = host({
            moves: {
                log: [
                    { id: "1", at: 1, primitive: "perturb", verb: "challenge", subject: "a.md", body: "the note text" },
                ] as never,
            },
        });
        MoveLog.getInstance().init(owner);
        expect(MoveLog.getInstance().all()[0]).not.toHaveProperty("body");
    });
});

describe("the knowledge scope, and its one exception (#491)", () => {
    beforeEach(() => MoveLog.getInstance().reset());

    it("refuses a subject in an excluded folder", () => {
        const owner = host({ excludedPaths: ["Archive"] } as never);
        MoveLog.getInstance().init(owner);
        MoveLog.getInstance().record(entry({ subject: "Archive/old.md" }));
        expect(MoveLog.getInstance().all()).toEqual([]);
    });

    it("records a thought in the thinking folder, which the model excludes on purpose", () => {
        // The thinking folder is kept out of the *model* so a raw thought is never an orphan or
        // debt. It is not kept out of your own history — a thought is exactly the thing whose
        // moves you want, and dropping them would be the feature failing in its own home.
        const owner = host();
        MoveLog.getInstance().init(owner);
        MoveLog.getInstance().record(entry({ subject: "_zf/thinking/2026-01-02.md" }));
        expect(MoveLog.getInstance().all()).toHaveLength(1);
    });
});

describe("it stays bounded, and it can be undone (#491)", () => {
    beforeEach(() => MoveLog.getInstance().reset());

    it("prunes on append so the log can never exceed its ceiling", () => {
        const owner = host();
        MoveLog.getInstance().init(owner);
        for (let n = 0; n < MOVES_PER_SUBJECT + 10; n++) MoveLog.getInstance().record(entry());
        expect(MoveLog.getInstance().all().length).toBeLessThanOrEqual(MOVES_PER_SUBJECT);
        expect(MOVE_CEILING).toBeGreaterThan(MOVES_PER_SUBJECT);
    });

    it("removes one by id, leaving the others", () => {
        const owner = host();
        MoveLog.getInstance().init(owner);
        const first = MoveLog.getInstance().record(entry({ subject: "a.md" }));
        MoveLog.getInstance().record(entry({ subject: "b.md" }));
        MoveLog.getInstance().remove(first?.id ?? "");
        expect(MoveLog.getInstance().all().map((m) => m.subject)).toEqual(["b.md"]);
    });

    it("reads one subject's history without the others", () => {
        const owner = host();
        MoveLog.getInstance().init(owner);
        MoveLog.getInstance().record(entry({ subject: "a.md" }));
        MoveLog.getInstance().record(entry({ subject: "b.md" }));
        expect(MoveLog.getInstance().forSubject("a.md")).toHaveLength(1);
    });
});

describe("it never writes into the shared default (#491)", () => {
    it("replaces the container rather than mutating it", () => {
        // Settings load with a shallow `Object.assign` over the defaults, so an install with no
        // `moves` key on disk shares `DEFAULT_SETTINGS.moves` by reference. Mutating `.log` in
        // place would write into the module-level default, survive a disable/enable, and come
        // back as somebody else's history.
        MoveLog.getInstance().reset();
        const shared = { log: [] as Move[] };
        const owner = host({ moves: shared });
        MoveLog.getInstance().init(owner);
        MoveLog.getInstance().record(entry());
        expect(shared.log).toEqual([]);
        expect(owner.settings.moves.log).toHaveLength(1);
    });
});
