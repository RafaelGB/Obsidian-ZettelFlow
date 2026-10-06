import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";
import { greetingKey } from "architecture/components/core/home/HomeModeRenderer";

const src = readFileSync(
    join(__dirname, "..", "..", "..", "..", "..", "src", "architecture", "components", "core", "home", "HomeModeRenderer.ts"),
    "utf8"
);

/**
 * **Home that feels like home** (#703, epic #701). Home was a dashboard of tiles — a counter of
 * thinking days, a "what to do next" list, three eyebrow tiles and nine sections behind *Show
 * everything*. It is a page in Think's family now; these hold the shape.
 */
describe("Home is a page in Think's family (#703)", () => {
    it("draws into the family page, with Think's composer right there", () => {
        expect(src).toContain('familyPage(host, "home")');
        expect(src).toContain("renderComposer(hello,");
        // The composer writes a thought — no modal, no Quick capture dialog on the front door.
        expect(src).not.toContain("quick-capture");
        expect(src).not.toMatch(/new \w+Modal\(/);
    });

    it("greets you for the moment of day, and never counts your days (§XII)", () => {
        expect(greetingKey(5)).toBe("home_greet_night");
        expect(greetingKey(9)).toBe("home_greet_morning");
        expect(greetingKey(15)).toBe("home_greet_afternoon");
        expect(greetingKey(21)).toBe("home_greet_evening");
        expect(src).not.toContain("thinkingDays");
        expect(src).not.toMatch(/streak/i);
        for (const locale of [en, es] as Record<string, string>[]) {
            expect("home_thinking_days" in locale).toBe(false);
        }
    });

    it("has subtracted the dashboard: no Refresh, no fold, no tiles, no list of what to do next", () => {
        for (const gone of ["home_refresh_button", "showEverything", "dashboard-card", "renderNextTile", "renderGraphTeaser", "renderFold"]) {
            expect({ gone, present: src.includes(gone) }).toEqual({ gone, present: false });
        }
    });

    it("leads with where you left off, what came back, one idea, and your questions — in that order", () => {
        const order = ["this.renderLeftOff(page)", "this.renderCameBack(page)", "this.renderIdea(page)", "this.renderQuestions(page)"];
        const at = order.map((call) => src.lastIndexOf(call));
        expect(at.every((i) => i > -1)).toBe(true);
        expect([...at].sort((a, b) => a - b)).toEqual(at);
    });

    it("updates itself on every vault change instead of asking you to refresh", () => {
        for (const event of ['vault.on("create"', 'metadataCache.on("resolved"', 'vault.on("rename"', 'vault.on("delete"']) {
            expect(src).toContain(event);
        }
    });

    it("navigates, and writes nothing but the thought you keep", () => {
        expect(src).toContain("openLinkText");
        expect(src).not.toMatch(/FileService|FrontmatterService|vault\.create|vault\.modify|processFrontMatter/);
        expect(src).not.toContain(".innerHTML");
        expect(src).not.toMatch(/\.style\./);
    });
});
