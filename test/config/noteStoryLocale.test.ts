import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";
import { monthHeading } from "architecture/components/core/noteCompanion/storyFormat";

const fill = (template: string, value: string) => template.replace("{0}", value);

/** The story reads naturally in both languages (#642 AC-7, AC-13). */
describe("the story's words (#642)", () => {
    it("says how long ago with a singular and a plural", () => {
        expect(fill(es.note_story_days_ago, "3")).toBe("hace 3 días");
        expect(fill(es.note_story_days_ago_one, "1")).toBe("hace 1 día");
        expect(fill(en.note_story_days_ago_one, "1")).toBe("1 day ago");
        expect(fill(en.note_story_more_snapshots_one, "1")).toBe("+1 more snapshot with no state change");
    });

    it("names the block and its chips", () => {
        expect(es.note_story_title).toBe("Historia");
        expect([es.note_story_chip_all, es.note_story_chip_decisions, es.note_story_chip_moves, es.note_story_chip_thoughts]).toEqual([
            "Todo",
            "Decisiones",
            "Movimientos",
            "Pensamientos",
        ]);
    });

    it("tells a return as before and now", () => {
        expect([en.evolution_timeline_return_then, en.evolution_timeline_return_now]).toEqual(["Before", "Now"]);
        expect([es.evolution_timeline_return_then, es.evolution_timeline_return_now]).toEqual(["Antes", "Ahora"]);
    });

    it("heads each month in the reader's language", () => {
        expect(monthHeading(2026, 9, "en")).toBe("October 2026");
        expect(monthHeading(2026, 9, "es")).toBe("octubre de 2026");
    });
});
