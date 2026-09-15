import { describe, it, expect } from "@jest/globals";
import {
    INITIAL_OPTION_LIST_STATE,
    OptionListItem,
    PAGE_SIZE,
    TYPEAHEAD_WINDOW_MS,
    optionDomId,
    reduceOptionListKey,
} from "application/components/select/optionListModel";

const OPTIONS: OptionListItem[] = [
    { key: "a", label: "Atomic note" },
    { key: "b", label: "Book" },
    { key: "c", label: "Concept" },
    { key: "d", label: "Diary" },
    { key: "e", label: "Evidence" },
    { key: "f", label: "Fleeting" },
    { key: "g", label: "Glossary" },
];

function press(key: string, active: number, at = 0, typeahead = "", typeaheadAt = 0) {
    return reduceOptionListKey(
        { activeIndex: active, typeahead, typeaheadAt },
        OPTIONS,
        { key, at }
    );
}

describe("the option list is a keyboard-operable listbox (#407)", () => {
    it("starts with nothing active", () => {
        expect(INITIAL_OPTION_LIST_STATE.activeIndex).toBe(-1);
    });

    it("moves down and wraps at the end", () => {
        expect(press("ArrowDown", -1).state.activeIndex).toBe(0);
        expect(press("ArrowDown", 0).state.activeIndex).toBe(1);
        expect(press("ArrowDown", OPTIONS.length - 1).state.activeIndex).toBe(0);
    });

    it("moves up and wraps at the start", () => {
        expect(press("ArrowUp", -1).state.activeIndex).toBe(OPTIONS.length - 1);
        expect(press("ArrowUp", 3).state.activeIndex).toBe(2);
        expect(press("ArrowUp", 0).state.activeIndex).toBe(OPTIONS.length - 1);
    });

    it("jumps to the extremes with Home and End", () => {
        expect(press("Home", 4).state.activeIndex).toBe(0);
        expect(press("End", 1).state.activeIndex).toBe(OPTIONS.length - 1);
    });

    it("moves by a page without wrapping", () => {
        expect(press("PageDown", 0).state.activeIndex).toBe(Math.min(PAGE_SIZE, OPTIONS.length - 1));
        expect(press("PageUp", 1).state.activeIndex).toBe(0);
        expect(press("PageDown", OPTIONS.length - 1).state.activeIndex).toBe(OPTIONS.length - 1);
    });

    it("activates with Enter and with Space, identically", () => {
        expect(press("Enter", 2).effect).toEqual({ kind: "activate", key: "c" });
        expect(press(" ", 2).effect).toEqual({ kind: "activate", key: "c" });
    });

    it("does not activate when nothing is active", () => {
        expect(press("Enter", -1).effect).toEqual({ kind: "none" });
    });

    it("jumps to the first option matching a typed prefix", () => {
        const first = press("d", -1, 1000);
        expect(first.state.activeIndex).toBe(3);
        expect(first.state.typeahead).toBe("d");
    });

    it("extends the typeahead inside the window and restarts outside it", () => {
        const inside = press("i", 3, 1000 + TYPEAHEAD_WINDOW_MS - 1, "d", 1000);
        expect(inside.state.typeahead).toBe("di");
        expect(inside.state.activeIndex).toBe(3);

        const outside = press("b", 3, 1000 + TYPEAHEAD_WINDOW_MS + 1, "d", 1000);
        expect(outside.state.typeahead).toBe("b");
        expect(outside.state.activeIndex).toBe(1);
    });

    it("keeps the active option when the typeahead matches nothing", () => {
        const result = press("z", 2, 1000);
        expect(result.state.activeIndex).toBe(2);
        expect(result.effect).toEqual({ kind: "none" });
    });

    it("asks to close the search field on Escape", () => {
        expect(press("Escape", 1).effect).toEqual({ kind: "close-search" });
    });

    it("leaves keys it does not own unhandled, so the modal still sees them", () => {
        expect(press("Tab", 1).handled).toBe(false);
        expect(press("F5", 1).handled).toBe(false);
        expect(press("ArrowDown", 1).handled).toBe(true);
    });

    it("survives an empty list", () => {
        const result = reduceOptionListKey(INITIAL_OPTION_LIST_STATE, [], { key: "ArrowDown", at: 0 });
        expect(result.state.activeIndex).toBe(-1);
        expect(result.effect).toEqual({ kind: "none" });
    });

    it("clamps an active index left over from a longer list", () => {
        const result = reduceOptionListKey(
            { activeIndex: 99, typeahead: "", typeaheadAt: 0 },
            OPTIONS,
            { key: "ArrowDown", at: 0 }
        );
        expect(result.state.activeIndex).toBe(0);
    });

    it("gives every option a stable dom id for aria-activedescendant", () => {
        expect(optionDomId("list-1", "a")).toBe(optionDomId("list-1", "a"));
        expect(optionDomId("list-1", "a")).not.toBe(optionDomId("list-1", "b"));
        expect(optionDomId("list-1", "a")).not.toBe(optionDomId("list-2", "a"));
    });
});
