import { describe, it, expect, jest } from "@jest/globals";
import { Component } from "obsidian";
import { DomNode } from "../../../../support/dashboardDom";
import { StoryBlock, type StoryDeps } from "architecture/components/core/noteCompanion/blocks/storyBlock";
import type { CompanionContext } from "architecture/components/core/noteCompanion/blocks/CompanionBlock";
import { absoluteDay } from "architecture/components/core/noteCompanion/storyFormat";
import type { TimelineEvent } from "architecture/knowledge/state";

// Local-time constructors: "3 days ago" is the reader's calendar (#642).
const at = (y: number, m0: number, d: number, h = 12) => new Date(y, m0, d, h).getTime();
const NOW = at(2026, 9, 10);

const snap = (t: number, state = "fleeting", claims: string[] = []): TimelineEvent => ({ at: t, kind: "snapshot", snapshot: { at: t, state, claims } });
const judgement = (t: number): TimelineEvent => ({
    at: t,
    kind: "judgement",
    judgement: { at: t, path: "a.md", subject: "claim:x", origin: "human", verdict: "accepted" } as never,
});
const move = (t: number, produced?: string): TimelineEvent => ({
    at: t,
    kind: "move",
    move: { id: `m${t}`, at: t, verb: "challenge", primitive: "perturb", subject: "a.md", produced } as never,
});
const thought = (t: number, path = "_zf/thought.md"): TimelineEvent => ({ at: t, kind: "thought", thought: { id: `t${t}`, at: t, path } });
const ret = (t: number, said?: string, says?: string, verdict = "modified"): TimelineEvent => ({
    at: t,
    kind: "return",
    return: { verdict, said, says, judgement: { at: t } as never },
});
const promo = (t: number): TimelineEvent => ({ at: t, kind: "promotion", promotion: { to: "literature", judgement: { at: t } as never } });
const horizon = (t: number): TimelineEvent => ({ at: t, kind: "horizon", horizon: { at: t, expectation: "we will know" } });

const EXISTING = new Set(["_zf/thought.md"]);

function setup(events: TimelineEvent[], over: Partial<StoryDeps> = {}, historyKept = true) {
    const host = new DomNode();
    const vault = {
        getAbstractFileByPath: jest.fn((path: string) => (EXISTING.has(path) ? { path } : null)),
        create: jest.fn(),
        modify: jest.fn(),
        process: jest.fn(),
    };
    const app = { vault, workspace: { trigger: jest.fn(), openLinkText: jest.fn() } };
    const deps: StoryDeps = {
        read: jest.fn(() => ({ events, historyKept })),
        now: () => NOW,
        forget: jest.fn(),
        share: jest.fn(async () => undefined),
        ...over,
    };
    const block = new StoryBlock(host as never, deps);
    const ctx = (path = "a.md") =>
        ({
            app,
            screen: { kind: "note", model: { path } },
            pinned: false,
            owner: new Component(),
        }) as unknown as CompanionContext;
    block.load();
    block.update(ctx());
    return { host, block, ctx, deps, vault };
}

const kinds = (host: DomNode) =>
    host.byClass("note-story-ev").map((row) => [...row.classes].find((cls) => /note-story-ev--(?!decision)/.test(cls))?.split("--")[1]);

describe("the story's rows (#642 AC-6..8)", () => {
    const all = [
        snap(at(2026, 9, 1)),
        judgement(at(2026, 9, 2)),
        move(at(2026, 9, 3)),
        thought(at(2026, 9, 4)),
        ret(at(2026, 9, 5), "it said", "it says"),
        promo(at(2026, 9, 6)),
        horizon(at(2026, 9, 7, 0)),
    ];

    it("gives each kind its own icon and class, and marks what you decided", () => {
        const { host } = setup(all);
        expect(kinds(host)).toEqual(["horizon", "promotion", "return", "thought", "move", "judgement", "snapshot"]);
        const icons = host.byClass("note-story-ev").map((row) => row.oneByClass("note-story-icon").getAttribute("data-icon"));
        expect(new Set(icons).size).toBe(7);
        const decided = host
            .byClass("note-story-ev--decision")
            .map((row) => [...row.classes].find((cls) => /note-story-ev--(?!decision)/.test(cls))?.split("--")[1]);
        expect(decided.sort()).toEqual(["judgement", "promotion", "return"]);
    });

    it("says how long ago, with the day itself on hover and for assistive technology", () => {
        const { host } = setup([move(at(2026, 9, 7)), move(at(2026, 9, 9))]);
        const times = host.querySelectorAll("time");
        expect(times.map((time) => time.textContent)).toEqual(["yesterday", "3 days ago"]);
        expect(times[1].getAttribute("title")).toBe(absoluteDay(at(2026, 9, 7)));
        expect(times[1].getAttribute("aria-label")).toBe(times[1].getAttribute("title"));
    });

    it("tells a return as one before/now unit", () => {
        const { host } = setup([ret(at(2026, 9, 5), "it said", "it says")]);
        const diff = host.byClass("note-story-diff");
        expect(diff).toHaveLength(1);
        expect(diff[0].textContent).toBe("Beforeit saidNowit says");
    });

    it("invents no before that was not kept, and gives a withdrawal no now", () => {
        expect(setup([ret(at(2026, 9, 5), undefined, "it says")]).host.oneByClass("note-story-diff").textContent).toBe("Nowit says");
        expect(setup([ret(at(2026, 9, 5), "it said", undefined, "rejected")]).host.oneByClass("note-story-diff").textContent).toBe(
            "Beforeit said"
        );
    });

    it("keeps a snapshot's claim texts behind its disclosure", () => {
        const { host } = setup([snap(at(2026, 9, 5), "literature", ["first", "second"])]);
        const details = host.oneByClass("note-story-snapshot");
        expect(details.querySelector("summary")!.textContent).toContain("2 claims");
        expect(details.querySelector("summary")!.textContent).not.toContain("first");
        expect(details.oneByClass("note-story-claims").textContent).toBe("firstsecond");
    });

    it("names a discarded thought without linking it, and links the one that exists", () => {
        const { host } = setup([thought(at(2026, 9, 4), "_zf/gone.md"), thought(at(2026, 9, 5))]);
        const gone = host.oneByClass("note-story-produced-gone");
        expect(gone.getAttribute("role")).toBeNull();
        expect(host.oneByClass("note-story-produced").getAttribute("role")).toBe("link");
    });
});

describe("the story's states (#642 AC-9/10, FR-14..16)", () => {
    it("explains how a story starts when there is none", () => {
        const { host } = setup([]);
        expect(host.oneByClass("note-story-empty").textContent).toContain("A story starts the first time you decide");
        expect(host.findAll((el) => /No conceptual history/.test(el.text))).toEqual([]);
    });

    it("says once that the history is not kept, and still shows the moves", () => {
        const { host } = setup([move(at(2026, 9, 3))], {}, false);
        expect(kinds(host)).toEqual(["move"]);
        expect(host.findAll((el) => el.text.startsWith("The sentences themselves are not being kept"))).toHaveLength(1);
    });

    it("says it once beside the empty card when there is nothing else", () => {
        const { host } = setup([], {}, false);
        expect(host.byClass("note-story-not-kept")).toHaveLength(1);
        expect(host.byClass("note-story-empty")).toHaveLength(1);
    });

    it("says it could not read the story, and logs it", () => {
        const { host } = setup([], {
            read: () => {
                throw new Error("boom");
            },
        });
        expect(host.byClass("note-story-status")).toHaveLength(1);
        expect(host.byClass("note-story-ev")).toEqual([]);
    });

    it("has a title and no heading, refresh or toggle of its own", () => {
        const { host } = setup([move(at(2026, 9, 3))]);
        expect(host.oneByClass("note-story-title").textContent).toBe("Story");
        expect(host.findAll((el) => /^h[1-6]$/.test(el.tag))).toEqual([]);
        expect(host.findAll((el) => /Only my judgements|Refresh/.test(el.text))).toEqual([]);
    });
});

describe("chips, folds and the pinned day (#642 FR-5..8, FR-12)", () => {
    const events = [snap(at(2026, 9, 1)), snap(at(2026, 9, 2)), judgement(at(2026, 9, 3)), move(at(2026, 9, 4))];

    it("filters to what you decided, and goes back to All on another note", () => {
        const { host, block, ctx } = setup(events);
        const chip = (label: string) => host.byClass("note-story-chip").find((el) => el.textContent.startsWith(label))!;
        expect(host.byClass("note-story-chip").map((el) => el.textContent)).toEqual(["All", "Decisions1", "Moves1"]);
        chip("Decisions").click();
        expect(kinds(host)).toEqual(["judgement"]);
        expect(chip("Decisions").getAttribute("aria-pressed")).toBe("true");
        block.update(ctx("b.md"));
        expect(chip("All").getAttribute("aria-pressed")).toBe("true");
    });

    it("has no chip row for snapshots alone", () => {
        expect(setup([snap(at(2026, 9, 1))]).host.byClass("note-story-chips")).toEqual([]);
    });

    it("folds an unchanged run and opens it in place", () => {
        const { host } = setup([snap(at(2026, 9, 1)), snap(at(2026, 9, 2))]);
        const fold = host.oneByClass("note-story-fold");
        expect(fold.textContent).toBe("+1 more snapshot with no state change");
        fold.click();
        expect(kinds(host)).toEqual(["snapshot", "snapshot"]);
        expect(host.byClass("note-story-fold")).toEqual([]);
    });

    it("pins the day you expect to know by, as a date, above every filter", () => {
        const { host } = setup([...events, horizon(at(2026, 10, 1, 0))]);
        const pinned = host.oneByClass("note-story-pinned");
        expect(pinned.textContent).toContain(`You expect to know by ${absoluteDay(at(2026, 10, 1, 0))}`);
        expect(pinned.textContent).not.toMatch(/\bdays?\b/);
        host.byClass("note-story-chip").find((el) => el.textContent.startsWith("Moves"))!.click();
        expect(host.byClass("note-story-pinned")).toHaveLength(1);
        expect(kinds(host)).toEqual(["move"]);
    });
});

describe("the story writes nothing (#642 AC-11, FR-18/21)", () => {
    it("forgets a move in the move log and nowhere else", () => {
        const { host, deps, vault } = setup([move(at(2026, 9, 3))]);
        host.oneByClass("note-story-forget").click();
        expect(deps.forget).toHaveBeenCalledWith(`m${at(2026, 9, 3)}`);
        expect(deps.read).toHaveBeenCalledTimes(2);
        expect(vault.create).not.toHaveBeenCalled();
        expect(vault.modify).not.toHaveBeenCalled();
        expect(vault.process).not.toHaveBeenCalled();
    });

    it("filters and expands without touching the vault", () => {
        const { host, vault } = setup([snap(at(2026, 9, 1)), snap(at(2026, 9, 2)), move(at(2026, 9, 3))]);
        host.oneByClass("note-story-fold").click();
        host.byClass("note-story-chip")[1].click();
        expect(vault.create).not.toHaveBeenCalled();
        expect(vault.modify).not.toHaveBeenCalled();
    });
});

describe("share is offered when there is a story (#642 FR-20)", () => {
    it("offers Share this idea only with at least one event", () => {
        expect(setup([]).block.menuItems()).toEqual([]);
        const { block, deps } = setup([move(at(2026, 9, 3))]);
        const items = block.menuItems();
        expect(items.map((item) => item.label)).toEqual(["Share this idea"]);
        items[0].onClick();
        expect(deps.share).toHaveBeenCalledWith(expect.anything(), "a.md", expect.any(Array));
    });
});
