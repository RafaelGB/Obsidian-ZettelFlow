import { describe, it, expect, jest } from "@jest/globals";
import { renderThought, type Thought } from "application/thinking/thought";
import { afterReview } from "application/thinking/highlightReview";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 6);

/** Think's folder, as the metadata cache and the disk both see it. */
const files: { path: string; front: Record<string, unknown>; content: string }[] = [];

jest.mock("architecture/plugin/ObsidianAPI", () => ({
    ObsidianApi: {
        getOwnPlugin: () => ({ settings: { thoughtLabPath: "Lab" } }),
        vault: () => ({
            getMarkdownFiles: () => files.map((f) => ({ path: f.path, basename: f.path, stat: { ctime: 0 } })),
            cachedRead: async (file: { path: string }) => files.find((f) => f.path === file.path)?.content ?? "",
        }),
        metadataCache: () => ({
            getFileCache: (file: { path: string }) => ({
                frontmatter: { zfThought: files.find((f) => f.path === file.path)?.front },
            }),
        }),
    },
}));

import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";

function add(thought: Thought): void {
    const front: Record<string, unknown> = { id: thought.id, at: thought.at };
    if (thought.about) front.about = thought.about;
    if (thought.quote) front.quoteExact = thought.quote.exact;
    if (thought.revises) {
        front.revisesOf = thought.revises.of;
        front.revisesQuote = thought.revises.quote;
    }
    if (thought.review) {
        front.reviewStage = thought.review.stage;
        front.reviewDue = thought.review.due;
        if (thought.review.retired) front.reviewRetired = true;
    }
    files.push({ path: `Lab/${thought.at}-${thought.id}.md`, front, content: renderThought(thought) });
}

function mark(id: string, at: number): Thought {
    return { id, at, text: "", links: [], about: "Notes/a.md", quote: { exact: `passage ${id}`, prefix: "", suffix: "" } };
}

describe("the doors ask the cache, the cards read the files (#678)", () => {
    it("says nothing is due when nothing is", () => {
        files.length = 0;
        add(mark("new", NOW - DAY));
        add({ id: "plain", at: NOW - 30 * DAY, text: "a thought", links: [] });
        expect(ThoughtStore.getInstance().anyHighlightDue(NOW)).toBe(false);
    });

    it("finds what is due and deals it in order, leaving out what was let go", async () => {
        files.length = 0;
        add(mark("young", NOW - DAY));
        add(mark("old", NOW - 20 * DAY));
        add(mark("older", NOW - 40 * DAY));
        add(afterReview(mark("gone", NOW - 50 * DAY), "let-go", NOW - 10 * DAY));
        const store = ThoughtStore.getInstance();
        expect(store.anyHighlightDue(NOW)).toBe(true);
        expect((await store.dueHighlights(NOW)).map((t) => t.id)).toEqual(["older", "old"]);
    });

    it("tells the note's story which thought changed your mind, and about which passage (#679)", () => {
        files.length = 0;
        add(mark("h", NOW - 20 * DAY));
        add({
            id: "n",
            at: NOW,
            text: "a log, not a ledger",
            links: [],
            about: "Notes/a.md",
            respondsTo: { to: "h", as: "challenge" },
            revises: { of: "h", quote: "passage h" },
        });
        const refs = ThoughtStore.getInstance().about("Notes/a.md");
        expect(refs.map((r) => [r.id, r.quote, r.revises])).toEqual([
            ["h", "passage h", undefined],
            ["n", undefined, "passage h"],
        ]);
    });
});
