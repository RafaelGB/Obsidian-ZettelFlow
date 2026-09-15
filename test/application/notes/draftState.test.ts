import { describe, it, expect } from "@jest/globals";
import {
    DRAFT_VERSION,
    MAX_DRAFTS,
    WizardDraft,
    findDraft,
    isResumable,
    readDraft,
    restoreDraft,
    serializeDraft,
    pruneDrafts,
    readDrafts,
    removeDraft,
    upsertDraft,
} from "application/notes/draftState";

function draft(canvasPath: string, savedAt = 1000, extra: Partial<WizardDraft> = {}): WizardDraft {
    return {
        version: DRAFT_VERSION,
        canvasPath,
        savedAt,
        title: "Atomicity",
        position: 3,
        targetFolder: "zettel",
        walked: [{ position: 0, nodeId: "a", title: "Type" }],
        paths: [[0, "steps/type.md"]],
        elements: [[1, { type: "prompt", id: "p1", result: "hello" }]],
        links: ["Another note"],
        ...extra,
    };
}

describe("a draft is what the wizard knew when you closed it (#410)", () => {
    it("reads back what it wrote", () => {
        const drafts = readDrafts([draft("flows/main.canvas")]);
        expect(drafts).toHaveLength(1);
        expect(drafts[0].title).toBe("Atomicity");
        expect(drafts[0].elements[0][1].result).toBe("hello");
    });

    it("offers nothing for an unknown version, and never throws", () => {
        expect(readDrafts([{ ...draft("a.canvas"), version: 99 }])).toEqual([]);
        expect(readDrafts([{ nonsense: true }])).toEqual([]);
        expect(readDrafts("not an array")).toEqual([]);
        expect(readDrafts(undefined)).toEqual([]);
        expect(readDrafts(null)).toEqual([]);
    });

    it("drops entries missing the fields a resume needs, keeping the rest", () => {
        const good = draft("good.canvas");
        const bad = { ...draft("bad.canvas"), canvasPath: 42 };
        expect(readDrafts([bad, good]).map((d) => d.canvasPath)).toEqual(["good.canvas"]);
    });

    it("finds the draft for a canvas and nothing for another", () => {
        const drafts = [draft("a.canvas"), draft("b.canvas")];
        expect(findDraft(drafts, "b.canvas")?.canvasPath).toBe("b.canvas");
        expect(findDraft(drafts, "c.canvas")).toBeUndefined();
    });

    it("keeps one draft per canvas — the newest wins", () => {
        const drafts = upsertDraft([draft("a.canvas", 1000)], draft("a.canvas", 2000), MAX_DRAFTS);
        expect(drafts).toHaveLength(1);
        expect(drafts[0].savedAt).toBe(2000);
    });

    it("drops the oldest once the cap is reached", () => {
        let drafts: WizardDraft[] = [];
        for (let i = 0; i < MAX_DRAFTS + 2; i++) {
            drafts = upsertDraft(drafts, draft(`c${i}.canvas`, 1000 + i), MAX_DRAFTS);
        }
        expect(drafts).toHaveLength(MAX_DRAFTS);
        expect(drafts.some((d) => d.canvasPath === "c0.canvas")).toBe(false);
        expect(drafts.some((d) => d.canvasPath === `c${MAX_DRAFTS + 1}.canvas`)).toBe(true);
    });

    it("forgets a draft once its note is created", () => {
        const drafts = removeDraft([draft("a.canvas"), draft("b.canvas")], "a.canvas");
        expect(drafts.map((d) => d.canvasPath)).toEqual(["b.canvas"]);
    });

    it("stops offering a draft older than the maximum age", () => {
        const now = 10_000_000;
        const maxAgeMs = 1000;
        const kept = pruneDrafts([draft("fresh.canvas", now - 500), draft("stale.canvas", now - 5000)], {
            now,
            maxAgeMs,
            canvasExists: () => true,
        });
        expect(kept.map((d) => d.canvasPath)).toEqual(["fresh.canvas"]);
    });

    it("stops offering a draft whose canvas is gone", () => {
        const kept = pruneDrafts([draft("gone.canvas", 1000), draft("here.canvas", 1000)], {
            now: 1000,
            maxAgeMs: 10_000,
            canvasExists: (path) => path === "here.canvas",
        });
        expect(kept.map((d) => d.canvasPath)).toEqual(["here.canvas"]);
    });

    it("does not offer a draft with nothing in it", () => {
        expect(
            isResumable(draft("a.canvas", 1000, { title: "", paths: [], elements: [], links: [], walked: [] }))
        ).toBe(false);
        expect(isResumable(draft("a.canvas"))).toBe(true);
        // A typed title alone is work worth keeping.
        expect(
            isResumable(draft("a.canvas", 1000, { paths: [], elements: [], links: [], walked: [] }))
        ).toBe(true);
    });
});

describe("a draft round-trips the work, and restores results without re-running them (#410)", () => {
    const snapshot = {
        canvasPath: "flows/main.canvas",
        savedAt: 12345,
        title: "Atomicity",
        position: 4,
        targetFolder: "zettel/ideas",
        walked: [
            { position: 0, nodeId: "root", title: "Type" },
            { position: 1, nodeId: "n2", title: "Source" },
        ],
        paths: new Map([
            [1, "steps/source.md"],
            [0, "steps/type.md"],
        ]),
        elements: new Map<number, { type: string; id: string; result: unknown }>([
            [2, { type: "prompt", id: "p", result: "a thought" }],
        ]),
        links: ["Related note"],
        onCreation: [{ type: "calculateMaturity", id: "m" }],
    };

    it("serializes into something readDraft accepts, unchanged", () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const draft = serializeDraft(snapshot as any);
        expect(readDraft(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
    });

    it("keeps step order stable regardless of insertion order", () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const draft = serializeDraft(snapshot as any);
        expect(draft.paths.map(([position]) => position)).toEqual([0, 1]);
    });

    it("puts everything back into a fresh note, and calls no action", () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const draft = serializeDraft(snapshot as any);
        const calls: string[] = [];
        const note = {
            setTitle: (title: string) => calls.push(`title:${title}`),
            setTargetFolder: (folder?: string) => calls.push(`folder:${folder}`),
            addPath: (path: string | undefined, position: number) => calls.push(`path:${position}:${path}`),
            addFinalElement: (element: unknown, position: number) =>
                calls.push(`element:${position}:${(element as { result: string }).result}`),
            addLink: (basename?: string) => calls.push(`link:${basename}`),
            addOnCreation: (actions: unknown[]) => calls.push(`oncreation:${actions.length}`),
        };

        restoreDraft(draft, note);

        expect(calls).toEqual([
            "title:Atomicity",
            "folder:zettel/ideas",
            "path:0:steps/type.md",
            "path:1:steps/source.md",
            "element:2:a thought",
            "link:Related note",
            "oncreation:1",
        ]);
    });

    it("restores a draft with no folder without clearing the note's own", () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const draft = serializeDraft({ ...snapshot, targetFolder: "" } as any);
        const folders: unknown[] = [];
        restoreDraft(draft, {
            setTitle: () => undefined,
            setTargetFolder: (folder?: string) => folders.push(folder),
            addPath: () => undefined,
            addFinalElement: () => undefined,
            addLink: () => undefined,
            addOnCreation: () => undefined,
        });
        expect(folders).toEqual([]);
    });
});

describe("a draft remembers the linked note (#419, AC-6)", () => {
    const satellite = {
        template: "steps/permanent.md",
        title: "{{title}} — idea",
        relation: { type: "inspired-by" as const, direction: "satellite-to-main" as const },
    };

    it("round-trips the declaration", () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const written = serializeDraft({ ...snapshotWith(satellite) } as any);
        const read = readDraft(JSON.parse(JSON.stringify(written)));
        expect(read?.satellite).toEqual(satellite);
    });

    it("keeps loading a draft written before the field existed", () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const written = serializeDraft(snapshotWith(undefined) as any);
        expect("satellite" in written).toBe(false);
        expect(readDraft(JSON.parse(JSON.stringify(written)))).toBeDefined();
        expect(DRAFT_VERSION).toBe(1);
    });

    it("puts the declaration back on resume, without re-running anything", () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const written = serializeDraft(snapshotWith(satellite) as any);
        const calls: unknown[] = [];
        restoreDraft(written, {
            setTitle: () => undefined,
            setTargetFolder: () => undefined,
            addPath: () => undefined,
            addFinalElement: () => undefined,
            addLink: () => undefined,
            addOnCreation: () => undefined,
            setSatellite: (declaration: unknown) => calls.push(declaration),
        });
        expect(calls).toEqual([satellite]);
    });
});

function snapshotWith(satellite: unknown) {
    return {
        canvasPath: "flows/main.canvas",
        savedAt: 1,
        title: "Luhmann 1992",
        position: 2,
        targetFolder: "zettel",
        walked: [],
        paths: new Map(),
        elements: new Map(),
        links: [],
        onCreation: [],
        ...(satellite ? { satellite } : {}),
    };
}
