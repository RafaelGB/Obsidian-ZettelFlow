import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { Component } from "obsidian";
import { DomNode, flush } from "../../../../support/dashboardDom";
import { NextStepBlock, type NextStepDeps } from "architecture/components/core/noteCompanion/blocks/nextStepBlock";
import { resetCompanionWrites } from "architecture/components/core/noteCompanion/companionWrites";
import type {
    CompanionContext,
    CompanionModel,
} from "architecture/components/core/noteCompanion/blocks/CompanionBlock";
import { companionSections, lifecycleStepper, type NextStepCard } from "architecture/knowledge/state";

const AC1: NextStepCard = {
    kind: "proposing",
    moves: [
        { token: "add-source", unsourced: 1 },
        { token: "connect" },
        { token: "advance-state", current: "fleeting", proposed: "literature" },
    ],
};

const model = (over: Partial<CompanionModel> = {}): CompanionModel => ({
    path: "zettel/A.md",
    title: "A",
    vitals: { linksIn: 0, linksOut: 0, claims: 1, sources: 0 },
    steps: lifecycleStepper("fleeting", true).steps,
    sections: companionSections(null, []),
    next: AC1,
    connect: [
        { path: "old/B.md", basename: "B", reasons: [{ kind: "tag", shared: ["pkm"] }] },
        { path: "old/C.md", basename: "C", reasons: [] },
    ],
    revision: 1,
    sourceKey: "source",
    linksOut: ["zettel/Linked.md"],
    ...over,
});

function setup(over: Partial<CompanionModel> = {}, depsOver: Partial<NextStepDeps> = {}) {
    const host = new DomNode();
    const deps = {
        addSourceTo: jest.fn(async () => ({ ok: true, batch: "b1" })),
        linkNotes: jest.fn(async () => ({ ok: true, batch: "b2" })),
        advanceTo: jest.fn(async () => ({ ok: true, batch: "b4", judgement: { at: 1 } as never, to: "literature" as const })),
        withdrawPromotion: jest.fn(),
        undoBatch: jest.fn(async () => ({ hadWork: true, done: 1, failed: [] as string[] })),
        pickNote: jest.fn(),
        pickMove: jest.fn(),
        thinkAbout: jest.fn(),
        openClaim: jest.fn(),
        cultivate: jest.fn(),
        flyFrom: jest.fn(),
        ...depsOver,
    };
    const block = new NextStepBlock(host as never, { settings: { lifecycle: { stateProperty: "status" } } }, deps as never);
    const ctxFor = (m: CompanionModel) =>
        ({
            app: { workspace: { trigger: jest.fn() } },
            screen: { kind: "note", model: m },
            pinned: false,
            owner: new Component(),
            pin: jest.fn(),
            follow: jest.fn(),
            refresh: jest.fn(),
            reveal: jest.fn(),
            open: jest.fn(),
            scrollTo: jest.fn(),
        }) as unknown as CompanionContext;
    block.load();
    block.update(ctxFor(model(over)));
    return { host, block, deps, ctxFor };
}

const text = (host: DomNode, name: string) => host.oneByClass(name).textContent;
const primary = (host: DomNode) => host.oneByClass("note-next-primary");

afterEach(() => {
    jest.useRealTimers();
    resetCompanionWrites();
});

describe("the next-step card (#641 FR-1..9, AC-1..4)", () => {
    it("says the fact and offers one primary action (AC-1)", () => {
        const { host } = setup();
        expect(text(host, "note-next-why")).toBe("Makes 1 claim with no source.");
        expect(primary(host).textContent).toBe("Add a source");
        expect(primary(host).hasClass("mod-cta")).toBe(true);
    });

    it("says once that nothing is pending, and draws nothing for a note the model does not know (AC-4)", () => {
        const complete = setup({ next: { kind: "complete" } });
        expect(text(complete.host, "note-next-complete")).toContain("Nothing is pending");
        expect(complete.host.byClass("note-next-primary")).toEqual([]);
        const absent = setup({ next: { kind: "absent" } });
        expect(absent.host.children).toEqual([]);
    });
});

describe("actions on this note (#890)", () => {
    it("is titled Actions on this note and offers no Mark an example, in any move's panel (AC-1, AC-2)", () => {
        const { host } = setup();
        expect(text(host, "note-next-eyebrow")).toBe("Actions on this note");
        expect(host.oneByClass("note-next").attrs["aria-label"]).toBe("Actions on this note");
        for (let i = 0; i < 3; i++) {
            host.byClass("note-next-step-button")[i].click();
            expect(host.byClass("note-next-panel")).toHaveLength(1);
            expect(host.oneByClass("note-next").textContent).not.toMatch(/example/i);
        }
    });

    it("lists the open steps together, each with its fact, the first one filled, and no carousel (Q2)", () => {
        const { host, deps } = setup();
        const whys = host.byClass("note-next-why").map((el) => el.textContent);
        expect(whys).toHaveLength(3);
        expect(whys[0]).toBe("Makes 1 claim with no source.");
        expect(new Set(whys).size).toBe(3);
        const steps = host.byClass("note-next-step-button");
        expect(steps.map((el) => el.textContent)).toEqual(["Add a source", "Connect", "Move to Literature"]);
        expect(host.findAll((el) => el.hasClass("mod-cta")).map((el) => el.textContent)).toEqual(["Add a source"]);
        expect(host.byClass("note-next-count")).toEqual([]);
        expect(host.byClass("note-next-another")).toEqual([]);

        steps[1].click();
        expect(host.byClass("note-next-panel")).toHaveLength(1);
        expect(host.byClass("note-next-candidate")).toHaveLength(2);
        expect(host.byClass("note-next-step-button").map((el) => el.attrs["aria-expanded"])).toEqual(["false", "true", "false"]);
        for (const dep of Object.values(deps)) expect(dep).not.toHaveBeenCalled();
    });

    it("lands an old add-example hand-over on the first item, closed, without an error (AC-10)", () => {
        const { host, block } = setup();
        expect(() => block.reveal("next", "add-example")).not.toThrow();
        expect(primary(host).textContent).toBe("Add a source");
        expect(host.byClass("note-next-panel")).toEqual([]);
        expect(host.oneByClass("note-next").hasClass("zettelkasten-flow__note-companion-highlight")).toBe(true);
    });

    it("opens the move picker on the companion's note, and answers a recorded move inline (AC-5)", () => {
        const { host, deps } = setup();
        const make = host.findAll((el) => el.tag === "button" && el.text === "Make a move…")[0];
        expect(make.hasClass("mod-cta")).toBe(false);
        make.click();
        expect(deps.pickMove).toHaveBeenCalledWith(expect.anything(), "zettel/A.md", expect.any(Function));
        const say = (deps.pickMove as jest.Mock).mock.calls[0][2] as (text: string) => void;
        say("Set aside — A");
        expect(text(host, "note-next-status")).toBe("Set aside — A");
        expect(host.byClass("note-next-undo")).toEqual([]);
    });

    it("opens Think, the claim box and Cultivate on the companion's note, the pinned one when pinned (AC-6..9)", () => {
        for (const path of ["zettel/A.md", "pinned/P.md"]) {
            const { host, deps } = setup({ path, next: { kind: "complete" } });
            for (const label of ["Think about this note", "Say what this note claims", "Cultivate this note"]) {
                const button = host.findAll((el) => el.tag === "button" && el.text === label)[0];
                expect(button.hasClass("mod-cta")).toBe(false);
                button.click();
            }
            expect(deps.thinkAbout).toHaveBeenCalledWith(expect.anything(), path);
            expect(deps.openClaim).toHaveBeenCalledWith(expect.anything(), path);
            expect(deps.cultivate).toHaveBeenCalledWith(expect.anything(), path);
        }
    });

    it("shows a stated claim and its wager's day read-only, and the entry edits it (Q5)", () => {
        const at = new Date(2026, 11, 1).getTime();
        const { host, deps } = setup({ claim: { text: "Debt grows unseen", wager: { expectation: "A rewrite", at } } });
        expect(text(host, "note-next-claim")).toBe("Debt grows unseen");
        expect(text(host, "note-next-wager")).toBe("You expect to know by 2026-12-01.");
        expect(host.oneByClass("note-next-claim").tag).not.toBe("input");
        expect(host.findAll((el) => el.tag === "button" && el.text === "Say what this note claims")).toEqual([]);
        host.findAll((el) => el.tag === "button" && el.text === "Edit what this note claims")[0].click();
        expect(deps.openClaim).toHaveBeenCalledWith(expect.anything(), "zettel/A.md");

        const none = setup();
        expect(none.host.byClass("note-next-claim")).toEqual([]);
    });

    it("keeps one filled button, and opens Think, the claim box and Cultivate from the pressed one (AC-12)", () => {
        const { host, deps } = setup();
        expect(host.findAll((el) => el.hasClass("mod-cta"))).toHaveLength(1);
        for (const label of ["Think about this note", "Say what this note claims", "Cultivate this note"]) {
            const button = host.findAll((el) => el.tag === "button" && el.text === label)[0];
            button.click();
            expect(deps.flyFrom).toHaveBeenLastCalledWith(button);
        }
        expect(deps.flyFrom).toHaveBeenCalledTimes(3);
    });

    it("hands the one filled button to the open panel's confirm, and takes it back on close (AC-12)", () => {
        const { host } = setup({
            next: { kind: "proposing", moves: [{ token: "advance-state", current: "fleeting", proposed: "literature" }] },
        });
        primary(host).click();
        const filled = host.findAll((el) => el.hasClass("mod-cta"));
        expect(filled).toHaveLength(1);
        expect(filled[0].parent?.parent?.hasClass("zettelkasten-flow__note-next-panel")).toBe(true);
        primary(host).click();
        expect(host.findAll((el) => el.hasClass("mod-cta"))).toEqual([primary(host)]);
    });
});

describe("each move, finished in place (#641 FR-10..13, AC-6..9)", () => {
    it("adds a source from the field, only when there is one to add", async () => {
        const { host, deps } = setup();
        primary(host).click();
        expect(text(host, "note-next-hint")).toBe("Goes in the note's source property.");
        const add = host.findAll((el) => el.tag === "button" && el.text === "Add")[0];
        expect(add.disabled).toBe(true);
        const input = host.oneByClass("note-next-input");
        input.value = "Cunningham 1992";
        input.fire("input");
        expect(add.disabled).toBe(false);
        input.fire("keydown", { key: "Enter" });
        await flush();
        expect(deps.addSourceTo).toHaveBeenCalledWith(expect.anything(), "zettel/A.md", "Cunningham 1992");
    });

    it("cancels without writing", () => {
        const { host, deps } = setup();
        primary(host).click();
        host.oneByClass("note-next-cancel").click();
        expect(host.byClass("note-next-panel")).toEqual([]);
        expect(deps.addSourceTo).not.toHaveBeenCalled();
    });

    it("connects to a nearby note, into the companion's note (AC-7)", async () => {
        const { host, deps } = setup({ next: { kind: "proposing", moves: [{ token: "connect" }] } });
        primary(host).click();
        expect(host.byClass("note-next-candidate")).toHaveLength(2);
        host.byClass("note-next-pick")[0].click();
        await flush();
        expect(deps.linkNotes).toHaveBeenCalledWith(expect.anything(), "zettel/A.md", "old/B.md");
    });

    it("always offers the note picker, and ignores a pick of the note itself or one it already links to (Q2)", async () => {
        const { host, deps } = setup({ next: { kind: "proposing", moves: [{ token: "connect" }] }, connect: [] });
        primary(host).click();
        expect(text(host, "note-next-hint")).toBe("No nearby notes yet.");
        host.oneByClass("note-next-choose").click();
        const onPick = (deps.pickNote as jest.Mock).mock.calls[0][1] as (path: string) => void;
        onPick("zettel/A.md");
        onPick("zettel/Linked.md");
        onPick("far/D.md");
        await flush();
        expect(deps.linkNotes).toHaveBeenCalledTimes(1);
        expect(deps.linkNotes).toHaveBeenCalledWith(expect.anything(), "zettel/A.md", "far/D.md");
    });

    it("says what advancing writes, and advances on confirm", async () => {
        const { host, deps } = setup({
            next: { kind: "proposing", moves: [{ token: "advance-state", current: "fleeting", proposed: "literature" }] },
        });
        primary(host).click();
        expect(text(host, "note-next-hint")).toBe("Sets status to literature. Recorded in the note's story as your decision.");
        host.findAll((el) => el.tag === "button" && el.text === "Move to Literature")[1].click();
        await flush();
        expect(deps.advanceTo).toHaveBeenCalledWith(expect.anything(), expect.anything(), "zettel/A.md");
    });
});

describe("after the click (#641 FR-14..19, AC-11..13, AC-15)", () => {
    async function linked(depsOver: Partial<NextStepDeps> = {}) {
        const s = setup({ next: { kind: "proposing", moves: [{ token: "connect" }] } }, depsOver);
        primary(s.host).click();
        s.host.byClass("note-next-pick")[0].click();
        await flush();
        return s;
    }

    it("answers inline with an undo, and the undo takes it back", async () => {
        const { host, deps } = await linked();
        expect(text(host, "note-next-status")).toContain("Linked to B.");
        host.oneByClass("note-next-undo").click();
        await flush();
        expect(deps.undoBatch).toHaveBeenCalledWith("b2");
        expect(text(host, "note-next-status")).toBe("Taken back.");
    });

    it("withdraws the verdict when a promotion is undone (Q1)", async () => {
        const { host, deps } = setup({
            next: { kind: "proposing", moves: [{ token: "advance-state", current: "fleeting", proposed: "literature" }] },
        });
        primary(host).click();
        host.findAll((el) => el.tag === "button" && el.text === "Move to Literature")[1].click();
        await flush();
        host.oneByClass("note-next-undo").click();
        await flush();
        expect(deps.withdrawPromotion).toHaveBeenCalledWith({ at: 1 });
    });

    it("does not claim to have undone what it could not", async () => {
        const { host } = await linked({ undoBatch: jest.fn(async () => ({ hadWork: false, done: 0, failed: [] })) as never });
        host.oneByClass("note-next-undo").click();
        await flush();
        expect(text(host, "note-next-status")).toBe("Could not take it back — the note changed since.");
    });

    it("says the step is still open only once the model has caught up, and it really is (FR-14)", async () => {
        const { host, block, ctxFor } = await linked();
        const same = model({ next: { kind: "proposing", moves: [{ token: "connect" }] } });
        block.update(ctxFor(same));
        expect(text(host, "note-next-status")).toContain("Linked to B.");
        block.update(ctxFor({ ...same, revision: 2 }));
        expect(text(host, "note-next-status")).toContain("This step is still open.");
    });

    it("moves on to the next open move when the write landed", async () => {
        const { host, block, ctxFor } = await linked();
        block.update(ctxFor(model({ revision: 2, next: { kind: "complete" } })));
        expect(text(host, "note-next-status")).toContain("Linked to B.");
        expect(host.byClass("note-next-complete")).toHaveLength(1);
    });

    it("drops the answer when another note is shown, and after thirty seconds", async () => {
        const { host, block, ctxFor } = await linked();
        block.update(ctxFor(model({ path: "zettel/Other.md" })));
        expect(host.byClass("note-next-status")).toEqual([]);

        const again = await linked();
        const at = Date.now();
        jest.spyOn(Date, "now").mockReturnValue(at + 31_000);
        again.block.update(again.ctxFor(model({ next: { kind: "proposing", moves: [{ token: "connect" }] } })));
        expect(again.host.byClass("note-next-status")).toEqual([]);
        (Date.now as jest.Mock).mockRestore();
    });

    it("says so inline when the note could not be written (AC-13)", async () => {
        const { host } = await linked({ linkNotes: jest.fn(async () => ({ ok: false })) as never });
        expect(text(host, "note-next-status")).toBe("Could not write to this note. Nothing was changed.");
        expect(host.byClass("note-next-undo")).toEqual([]);
    });
});

describe("arriving focused (#641 FR-21/22, AC-14)", () => {
    it("claims the next focus only", () => {
        const { block } = setup();
        expect(block.claims("next")).toBe(true);
        expect(block.claims("gaps")).toBe(false);
    });

    it("opens the asked-for move, scrolls to it and marks it once", () => {
        const { host, block } = setup();
        block.reveal("next", "connect");
        expect(primary(host).textContent).toBe("Connect");
        expect(host.byClass("note-next-panel")).toHaveLength(1);
        const card = host.oneByClass("note-next");
        // Through the view's own scroll container — never scrollIntoView (#639 runtime audit).
        expect(card.scrolls).toEqual([]);
        expect(card.hasClass("zettelkasten-flow__note-companion-highlight")).toBe(true);
    });

    it("lands on the first move, closed, when the note no longer has the one asked for", () => {
        const { host, block } = setup({ next: { kind: "proposing", moves: [{ token: "add-source", unsourced: 2 }] } });
        block.reveal("next", "connect");
        expect(primary(host).textContent).toBe("Add a source");
        expect(host.byClass("note-next-panel")).toEqual([]);
    });
});

describe("the card after the epic's review (#639)", () => {
    it("keeps what you are typing when the card redraws", () => {
        const { host, block, ctxFor } = setup();
        primary(host).click();
        const input = host.querySelector("input")!;
        input.value = "Ahrens 2017";
        input.fire("input");
        block.update(ctxFor(model({ revision: 2 })));
        expect(host.querySelector("input")!.value).toBe("Ahrens 2017");
    });

    it("never shows one note's answer, or its Undo, on another", async () => {
        let finish: (value: { ok: boolean; batch: string }) => void = () => undefined;
        const addSourceTo = jest.fn(() => new Promise<{ ok: boolean; batch: string }>((resolve) => (finish = resolve)));
        const { host, block, ctxFor } = setup({}, { addSourceTo } as never);
        primary(host).click();
        const input = host.querySelector("input")!;
        input.value = "A book";
        input.fire("input");
        host.findAll((el) => el.tag === "button" && el.text === "Add")[0].click();
        block.update(ctxFor(model({ path: "zettel/B.md", title: "B" })));
        finish({ ok: true, batch: "b1" });
        await flush();
        expect(host.byClass("note-next-status")).toEqual([]);
        expect(host.byClass("note-next-undo")).toEqual([]);
    });

    it("undoes once, however fast the clicks", async () => {
        const { host, deps } = setup();
        primary(host).click();
        const input = host.querySelector("input")!;
        input.value = "A book";
        input.fire("input");
        host.findAll((el) => el.tag === "button" && el.text === "Add")[0].click();
        await flush();
        const undo = host.oneByClass("note-next-undo");
        undo.click();
        expect(undo.disabled).toBe(true);
        undo.click();
        await flush();
        expect(deps.undoBatch).toHaveBeenCalledTimes(1);
    });

    it("says the write failed when it throws, and offers no undo", async () => {
        const { host } = setup({}, { addSourceTo: jest.fn(async () => Promise.reject(new Error("disk"))) } as never);
        primary(host).click();
        const input = host.querySelector("input")!;
        input.value = "A book";
        input.fire("input");
        host.findAll((el) => el.tag === "button" && el.text === "Add")[0].click();
        await flush();
        expect(text(host, "note-next-status")).toBe("Could not write to this note. Nothing was changed.");
        expect(host.byClass("note-next-undo")).toEqual([]);
    });

    it("takes the Undo away when its thirty seconds are up, even in an idle pane", async () => {
        jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick"] });
        const { host } = setup();
        primary(host).click();
        const input = host.querySelector("input")!;
        input.value = "A book";
        input.fire("input");
        host.findAll((el) => el.tag === "button" && el.text === "Add")[0].click();
        await flush();
        expect(host.byClass("note-next-undo")).toHaveLength(1);
        jest.advanceTimersByTime(30_000);
        expect(host.byClass("note-next-undo")).toEqual([]);
    });
});
