import { describe, it, expect } from "@jest/globals";
import {
    computeWeeklyReview,
    ReviewSectionKey,
    DAY_MS,
} from "architecture/knowledge/review/weeklyReview";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

const NOW = 1_700_000_000_000;
const D = DAY_MS;

const model = buildModel([
    idea("new1.md", "permanent", [{ to: "new2.md" }], { created: NOW - 2 * D, modified: NOW - 2 * D }),
    idea("new2.md", "permanent", [], { created: NOW - 6 * D, modified: NOW - 6 * D }),
    idea("stale.md", "permanent", [], { created: NOW - 100 * D, modified: NOW - 100 * D }),
    idea("staler.md", "permanent", [], { created: NOW - 200 * D, modified: NOW - 200 * D }),
    idea("hub.md", "permanent", [{ to: "x1" }, { to: "x2" }, { to: "x3" }, { to: "x4" }, { to: "x5" }], {
        created: NOW - 100 * D,
        modified: NOW - 100 * D,
    }),
]);

const section = (key: ReviewSectionKey) =>
    computeWeeklyReview(model, NOW).sections.find((s) => s.key === key)!;

describe("computeWeeklyReview (#160, AC-1)", () => {
    it("lists ideas created within the rolling window", () => {
        expect(section("created").paths).toEqual(["new1.md", "new2.md"]);
        expect(section("created").action).toBe("review");
    });

    it("lists orphans (nothing links to them)", () => {
        expect(section("orphans").paths).toEqual(["hub.md", "new1.md", "stale.md", "staler.md"]);
        expect(section("orphans").action).toBe("connect");
    });

    it("lists forgotten notes oldest-first, past the staleness horizon", () => {
        expect(section("forgotten").paths).toEqual(["staler.md", "hub.md", "stale.md"]);
        expect(section("forgotten").action).toBe("review");
    });

    it("lists important-but-unreviewed (hubs that are also stale)", () => {
        expect(section("important").paths).toEqual(["hub.md"]);
        expect(section("important").action).toBe("review");
    });

    it("reports the window and is deterministic + read-only", () => {
        const review = computeWeeklyReview(model, NOW);
        expect(review.windowDays).toBe(7);
        expect(review).toEqual(computeWeeklyReview(model, NOW));
        expect(model.all()).toHaveLength(5);
    });

    it("honors the window and staleness boundaries", () => {
        const boundary = buildModel([
            idea("atNow.md", "permanent", [], { created: NOW, modified: NOW }),
            idea("atStart.md", "permanent", [], { created: NOW - 7 * D, modified: NOW }),
            idea("staleBoundary.md", "permanent", [], { created: 0, modified: NOW - 30 * D }),
        ]);
        const created = computeWeeklyReview(boundary, NOW).sections.find((s) => s.key === "created")!;
        const forgotten = computeWeeklyReview(boundary, NOW).sections.find((s) => s.key === "forgotten")!;
        expect(created.paths).toEqual(["atNow.md"]); // now inclusive, windowStart exclusive
        expect(forgotten.paths).toEqual([]); // modified === staleBefore is not yet forgotten
    });

    it("returns all-zero sections for an empty model", () => {
        const empty = computeWeeklyReview(buildModel([]), NOW);
        expect(empty.sections.every((s) => s.count === 0 && s.paths.length === 0)).toBe(true);
    });
});
