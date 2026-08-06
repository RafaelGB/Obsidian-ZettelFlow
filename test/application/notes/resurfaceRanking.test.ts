import { describe, it, expect } from "@jest/globals";
import {
    rankResurfacedNotes,
    pickDailySpark,
    ActiveNoteSignals,
    ResurfaceCandidate,
    DEFAULT_MAX_RESURFACED,
} from "application/notes/resurfaceRanking";

const DAY = 1000 * 60 * 60 * 24;
const NOW = 1_000_000_000_000;

function candidate(overrides: Partial<ResurfaceCandidate> & { path: string }): ResurfaceCandidate {
    return {
        basename: overrides.path.replace(/\.md$/, ""),
        tags: [],
        outgoingLinks: [],
        backlinks: [],
        lastOpenedOrModified: NOW - 100 * DAY,
        ...overrides,
    };
}

function active(overrides: Partial<ActiveNoteSignals> & { path: string }): ActiveNoteSignals {
    return {
        tags: [],
        outgoingLinks: [],
        backlinks: [],
        ...overrides,
    };
}

describe("rankResurfacedNotes", () => {
    it("ranks by overlap and never surfaces the active note or excluded paths (AC-4/AC-8)", () => {
        const result = rankResurfacedNotes({
            active: active({ path: "active.md", tags: ["physics", "science"], outgoingLinks: ["c.md"] }),
            candidates: [
                candidate({ path: "active.md", tags: ["physics", "science"] }), // the active note itself
                candidate({ path: "two-tags.md", tags: ["physics", "science"] }), // score 6
                candidate({ path: "one-tag.md", tags: ["physics"] }), // score 3
                candidate({ path: "linked.md", outgoingLinks: ["c.md"] }), // shared target c.md → link, score 2
                candidate({ path: "excluded.md", tags: ["physics", "science"] }),
                candidate({ path: "unrelated.md", tags: ["cooking"] }), // zero overlap
            ],
            now: NOW,
            excludePaths: ["excluded.md"],
        });

        expect(result.map((r) => r.path)).toEqual(["two-tags.md", "one-tag.md", "linked.md"]);
        expect(result.map((r) => r.path)).not.toContain("active.md");
        expect(result.map((r) => r.path)).not.toContain("excluded.md");
        expect(result.map((r) => r.path)).not.toContain("unrelated.md");
    });

    it("bounds the result to top-N (default and explicit max)", () => {
        const candidates = Array.from({ length: 12 }, (_, i) =>
            candidate({ path: `note-${i}.md`, tags: ["shared"] })
        );
        const a = active({ path: "active.md", tags: ["shared"] });

        expect(rankResurfacedNotes({ active: a, candidates, now: NOW })).toHaveLength(DEFAULT_MAX_RESURFACED);
        expect(rankResurfacedNotes({ active: a, candidates, now: NOW, max: 3 })).toHaveLength(3);
    });

    it("breaks ties toward the older (smaller lastOpenedOrModified) note (AC-7 recency tie-break)", () => {
        const result = rankResurfacedNotes({
            active: active({ path: "active.md", tags: ["shared"] }),
            candidates: [
                candidate({ path: "recent.md", tags: ["shared"], lastOpenedOrModified: NOW - 1 * DAY }),
                candidate({ path: "old.md", tags: ["shared"], lastOpenedOrModified: NOW - 400 * DAY }),
            ],
            now: NOW,
        });

        expect(result.map((r) => r.path)).toEqual(["old.md", "recent.md"]);
    });

    it("does not let recency dominate real overlap", () => {
        const result = rankResurfacedNotes({
            active: active({ path: "active.md", tags: ["a", "b"], outgoingLinks: ["x.md"] }),
            candidates: [
                // Very old but only one link relationship (score 2 + tiny recency)
                candidate({ path: "ancient-weak.md", outgoingLinks: ["x.md"], lastOpenedOrModified: 0 }),
                // Brand new but two shared tags (score 6)
                candidate({ path: "fresh-strong.md", tags: ["a", "b"], lastOpenedOrModified: NOW }),
            ],
            now: NOW,
        });

        expect(result.map((r) => r.path)).toEqual(["fresh-strong.md", "ancient-weak.md"]);
    });

    it("never surfaces a zero-overlap candidate even if it is very old", () => {
        const result = rankResurfacedNotes({
            active: active({ path: "active.md", tags: ["physics"] }),
            candidates: [candidate({ path: "ancient.md", tags: ["cooking"], lastOpenedOrModified: 0 })],
            now: NOW,
        });

        expect(result).toHaveLength(0);
    });

    it("reports a tag reason with the shared tag", () => {
        const [note] = rankResurfacedNotes({
            active: active({ path: "active.md", tags: ["a", "b"] }),
            candidates: [candidate({ path: "note.md", tags: ["b", "c"] })],
            now: NOW,
        });

        expect(note.reasons).toContainEqual({ kind: "tag", shared: ["b"] });
    });

    it("reports a link reason when the active note links to the candidate", () => {
        const [note] = rankResurfacedNotes({
            active: active({ path: "active.md", outgoingLinks: ["note.md"] }),
            candidates: [candidate({ path: "note.md" })],
            now: NOW,
        });

        expect(note.reasons).toContainEqual({ kind: "link", shared: [] });
    });

    it("reports a backlink reason when the candidate links to the active note", () => {
        const [note] = rankResurfacedNotes({
            active: active({ path: "active.md" }),
            candidates: [candidate({ path: "note.md", outgoingLinks: ["active.md"] })],
            now: NOW,
        });

        expect(note.reasons).toContainEqual({ kind: "backlink", shared: [] });
    });

    it("reports a shared-link reason with the shared target when both link to the same note", () => {
        const [note] = rankResurfacedNotes({
            active: active({ path: "active.md", outgoingLinks: ["third.md"] }),
            candidates: [candidate({ path: "note.md", outgoingLinks: ["third.md"] })],
            now: NOW,
        });

        expect(note.reasons).toContainEqual({ kind: "link", shared: ["third.md"] });
    });
});

describe("pickDailySpark", () => {
    it("returns the oldest notes first, bounded to count", () => {
        const result = pickDailySpark(
            [
                candidate({ path: "b.md", lastOpenedOrModified: NOW - 10 * DAY }),
                candidate({ path: "a.md", lastOpenedOrModified: NOW - 100 * DAY }),
                candidate({ path: "c.md", lastOpenedOrModified: NOW - 1 * DAY }),
            ],
            NOW,
            2
        );

        expect(result.map((c) => c.path)).toEqual(["a.md", "b.md"]);
    });

    it("excludes excludePaths", () => {
        const result = pickDailySpark(
            [
                candidate({ path: "a.md", lastOpenedOrModified: NOW - 100 * DAY }),
                candidate({ path: "b.md", lastOpenedOrModified: NOW - 50 * DAY }),
            ],
            NOW,
            5,
            ["a.md"]
        );

        expect(result.map((c) => c.path)).toEqual(["b.md"]);
    });

    it("surfaces zero-overlap notes (serendipity) — it does not require any relatedness", () => {
        const result = pickDailySpark(
            [candidate({ path: "unrelated.md", tags: ["cooking"], lastOpenedOrModified: 0 })],
            NOW,
            3
        );

        expect(result.map((c) => c.path)).toEqual(["unrelated.md"]);
    });

    it("breaks equal-age ties by basename", () => {
        const result = pickDailySpark(
            [
                candidate({ path: "beta.md", lastOpenedOrModified: NOW - 5 * DAY }),
                candidate({ path: "alpha.md", lastOpenedOrModified: NOW - 5 * DAY }),
            ],
            NOW,
            5
        );

        expect(result.map((c) => c.path)).toEqual(["alpha.md", "beta.md"]);
    });
});
