import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { Component } from "obsidian";
import { DomNode, flush } from "../../../../support/dashboardDom";
import { NextStepBlock, type NextStepDeps } from "architecture/components/core/noteCompanion/blocks/nextStepBlock";
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
        markExample: jest.fn(async () => ({ ok: true, batch: "b3" })),
        advanceTo: jest.fn(async () => ({ ok: true, batch: "b4", judgement: { at: 1 } as never, to: "literature" as const })),
        withdrawPromotion: jest.fn(),
        undoBatch: jest.fn(async () => ({ hadWork: true, done: 1, failed: [] as string[] })),
        pickNote: jest.fn(),
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
        }) as unknown as CompanionContext;
    block.load();
    block.update(ctxFor(model(over)));
    return { host, block, deps, ctxFor };
}

const text = (host: DomNode, name: string) => host.oneByClass(name).textContent;
const primary = (host: DomNode) => host.oneByClass("note-next-primary");

afterEach(() => {
    jest.useRealTimers();
});

describe("the next-step card (#641 FR-1..9, AC-1..4)", () => {
    it("says the fact, offers one primary action, and counts the moves (AC-1)", () => {
        const { host } = setup();
        expect(text(host, "note-next-eyebrow")).toBe("Next step");
        expect(text(host, "note-next-why")).toBe("Makes 1 claim with no source.");
        expect(primary(host).textContent).toBe("Add a source");
        expect(primary(host).hasClass("mod-cta")).toBe(true);
        expect(text(host, "note-next-count")).toBe("1 of 3");
    });

    it("cycles through the moves without writing anything (AC-2)", () => {
        const { host, deps } = setup();
        const seen: string[] = [];
        for (let i = 0; i < 3; i++) {
            seen.push(primary(host).textContent);
            host.oneByClass("note-next-another").click();
        }
        expect(seen).toEqual(["Add a source", "Connect", "Move to Literature"]);
        expect(primary(host).textContent).toBe("Add a source");
        for (const dep of Object.values(deps)) expect(dep).not.toHaveBeenCalled();
    });

    it("drops the counter and Another step for a single move (AC-3)", () => {
        const { host } = setup({ next: { kind: "proposing", moves: [{ token: "connect" }] } });
        expect(host.byClass("note-next-count")).toEqual([]);
        expect(host.byClass("note-next-another")).toEqual([]);
    });

    it("says once that nothing is pending, and draws nothing for a note the model does not know (AC-4)", () => {
        const complete = setup({ next: { kind: "complete" } });
        expect(text(complete.host, "note-next-complete")).toContain("Nothing is pending");
        expect(complete.host.byClass("note-next-primary")).toEqual([]);
        const absent = setup({ next: { kind: "absent" } });
        expect(absent.host.children).toEqual([]);
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

    it("lists links out and links in as example candidates (Q3)", async () => {
        const { host, deps } = setup({
            next: { kind: "proposing", moves: [{ token: "add-example", linksOut: ["x/Out.md"], linksIn: ["x/In.md", "x/Out.md"] }] },
        });
        primary(host).click();
        expect(host.byClass("note-next-sublabel").map((el) => el.textContent)).toEqual(["Links out", "Links in"]);
        expect(host.byClass("note-next-name").map((el) => el.textContent)).toEqual(["Out", "In"]);
        host.byClass("note-next-pick")[1].click();
        await flush();
        expect(deps.markExample).toHaveBeenCalledWith(expect.anything(), "zettel/A.md", "x/In.md");
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
        expect(card.scrolls).toHaveLength(1);
        expect(card.hasClass("zettelkasten-flow__note-companion-highlight")).toBe(true);
    });

    it("lands on the first move, closed, when the note no longer has the one asked for", () => {
        const { host, block } = setup({ next: { kind: "proposing", moves: [{ token: "add-source", unsourced: 2 }] } });
        block.reveal("next", "connect");
        expect(primary(host).textContent).toBe("Add a source");
        expect(host.byClass("note-next-panel")).toEqual([]);
    });
});
