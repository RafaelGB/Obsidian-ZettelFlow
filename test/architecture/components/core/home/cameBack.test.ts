import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { cameBackOrder, dayKey } from "architecture/components/core/home/cameBack";

const NOW = new Date(2026, 9, 6, 10, 0, 0).getTime();
const claim = { path: "Notes/a.md", claim: "Most fleeting notes are questions", lastTouched: 1, kind: "claim" as const };
const STACK = readFileSync(
    join(__dirname, "..", "..", "..", "..", "..", "src", "architecture", "components", "core", "home", "CameBackStack.ts"),
    "utf8"
);

/** **Came back today** (#704): one quiet stack, answered in place. */
describe("came back today (#704)", () => {
    it("is empty on a day nothing came back", () => {
        expect(cameBackOrder({ highlightsDue: false, claim: null, letGo: new Set(), now: NOW })).toEqual([]);
    });

    it("leads with what you marked, then the one claim", () => {
        expect(cameBackOrder({ highlightsDue: true, claim: claim as never, letGo: new Set(), now: NOW }).map((i) => i.kind)).toEqual([
            "highlights",
            "claim",
        ]);
    });

    it("leaves out a claim you let go today, and brings it back tomorrow", () => {
        const letGo = new Set([`${dayKey(NOW)}:Notes/a.md`]);
        expect(cameBackOrder({ highlightsDue: false, claim: claim as never, letGo, now: NOW })).toEqual([]);
        const tomorrow = NOW + 24 * 60 * 60 * 1000;
        expect(cameBackOrder({ highlightsDue: false, claim: claim as never, letGo, now: tomorrow })).toHaveLength(1);
    });

    it("writes no judgement when you let it go — it is about your attention (§XII)", () => {
        const letGo = STACK.slice(STACK.indexOf("LET_GO.add("));
        const block = letGo.slice(0, letGo.indexOf("});"));
        expect(block).not.toMatch(/JudgementLog|record\(/);
        expect(STACK).not.toMatch(/FileService|FrontmatterService|vault\.(create|modify)/);
    });

    it("answers the highlights with Think's own review cards, not a copy of them", () => {
        expect(STACK).toContain("new ReviewCards(body, due, deps)");
        expect(STACK).toContain("onEnd: () => this.next()");
    });

    it("counts nothing — the depth shows, a number never does", () => {
        expect(STACK).not.toContain("tCount(");
        expect(STACK).not.toMatch(/items\.length\)/);
    });
});

describe("the stack, drawn (#704)", () => {
    it("shows the claim, lets it go for the day, and ends in one quiet line", async () => {
        const { DomNode } = await import("../../../../support/dashboardDom");
        const { CameBackStack } = await import("architecture/components/core/home/CameBackStack");
        const host = new DomNode();
        const stack = new CameBackStack(host as never, {} as never, { highlightsDue: false, claim: { ...claim, path: "Notes/b.md" } as never }, () => NOW);
        stack.load();
        expect(host.oneByClass("home-stack-quote").textContent).toBe("Most fleeting notes are questions");
        host.byText("Let it go").click();
        expect(host.oneByClass("home-stack-done").textContent).toContain("That is all for today.");
        // Let go today: a second stack the same day starts empty.
        const again = new DomNode();
        new CameBackStack(again as never, {} as never, { highlightsDue: false, claim: { ...claim, path: "Notes/b.md" } as never }, () => NOW).load();
        expect(again.byClass("home-stack-done")).toHaveLength(1);
    });
});
