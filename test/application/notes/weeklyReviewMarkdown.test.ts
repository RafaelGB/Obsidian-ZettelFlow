import { describe, it, expect } from "@jest/globals";
import { renderWeeklyReviewMarkdown, WeeklyReviewLabels } from "application/notes/weeklyReviewMarkdown";
import type { WeeklyReview } from "architecture/knowledge/review/weeklyReview";

const labels: WeeklyReviewLabels = {
    title: "Weekly review",
    clean: "A quiet week — nothing needs attention.",
    sections: {
        created: "Ideas created",
        orphans: "Orphans",
        forgotten: "Forgotten",
        important: "Important but unreviewed",
    },
    actions: {
        open: "Next: open them.",
        connect: "Next: connect them.",
        review: "Next: review them.",
    },
};

describe("renderWeeklyReviewMarkdown (#160, AC-2)", () => {
    it("renders non-empty sections with labels, counts, wikilinks and an action line", () => {
        const review: WeeklyReview = {
            windowDays: 7,
            sections: [
                { key: "created", count: 2, paths: ["a.md", "b.md"], action: "review" },
                { key: "orphans", count: 0, paths: [], action: "connect" },
                { key: "forgotten", count: 1, paths: ["old.md"], action: "review" },
                { key: "important", count: 0, paths: [], action: "review" },
            ],
        };
        const md = renderWeeklyReviewMarkdown(review, labels, "2026-08-12");

        expect(md).toContain("# Weekly review — 2026-08-12");
        expect(md).toContain("## Ideas created (2)");
        expect(md).toContain("- [[a]]");
        expect(md).toContain("- [[b]]");
        expect(md).toContain("## Forgotten (1)");
        expect(md).toContain("- [[old]]");
        expect(md).toContain("_Next: review them._");
        // empty sections omitted
        expect(md).not.toContain("Orphans");
        expect(md).not.toContain("Important but unreviewed");
    });

    it("renders the clean-week line when every section is empty", () => {
        const empty: WeeklyReview = {
            windowDays: 7,
            sections: [
                { key: "created", count: 0, paths: [], action: "review" },
                { key: "orphans", count: 0, paths: [], action: "connect" },
                { key: "forgotten", count: 0, paths: [], action: "review" },
                { key: "important", count: 0, paths: [], action: "review" },
            ],
        };
        const md = renderWeeklyReviewMarkdown(empty, labels, "2026-08-12");
        expect(md).toContain("A quiet week — nothing needs attention.");
        expect(md).not.toContain("##");
    });
});
