import { describe, it, expect } from "@jest/globals";
import { contextAnswers, previewHasContent, upcomingGroupTemplate } from "application/notes/previewLookahead";

describe("a group's own template, shown from the start of the group (#816 FR-1 – FR-4)", () => {
    const daily = { type: "file", path: "Templates/Daily Note Template.md" };

    it("is the one file node the group leads to", () => {
        expect(upcomingGroupTemplate({ type: "group" }, [daily], [])).toBe("Templates/Daily Note Template.md");
    });

    it("is nothing when the group offers a choice — never a guess", () => {
        expect(upcomingGroupTemplate({ type: "group" }, [daily, { type: "file", path: "Templates/Other.md" }], [])).toBeNull();
        expect(upcomingGroupTemplate({ type: "group" }, [daily, { type: "text" }], [])).toBeNull();
    });

    it("is nothing for a group with no file inside, a step that is not a group, or a script", () => {
        expect(upcomingGroupTemplate({ type: "group" }, [{ type: "text" }], [])).toBeNull();
        expect(upcomingGroupTemplate({ type: "group" }, [], [])).toBeNull();
        expect(upcomingGroupTemplate({ type: "text" }, [daily], [])).toBeNull();
        expect(upcomingGroupTemplate(undefined, [daily], [])).toBeNull();
        expect(upcomingGroupTemplate({ type: "group" }, [{ type: "file", path: "Scripts/rollover.js" }], [])).toBeNull();
    });

    it("is never shown twice: once the walk has it, the lookahead steps back (FR-3)", () => {
        expect(upcomingGroupTemplate({ type: "group" }, [daily], ["Templates/Daily Note Template.md"])).toBeNull();
    });
});

describe("Your answers: what you said that is not part of the note (#816 FR-7 – FR-11)", () => {
    it("lists answered context values, by label, in the order given", () => {
        expect(
            contextAnswers([
                { type: "number", zone: "context", key: "realWorkingHours", label: "Real working hours", hasUI: true, result: 7 },
                { type: "prompt", zone: "frontmatter", key: "purpose", label: "Purpose", hasUI: true, result: "Plan" },
                { type: "checkbox", zone: "context", key: "remoteWork", label: "Do you work at home last day?", hasUI: true, result: false },
                { type: "selector", zone: "context", key: "dayFeeling", hasUI: true, result: ["good", "calm"] },
            ])
        ).toEqual([
            { label: "Real working hours", value: "7" },
            { label: "Do you work at home last day?", value: "false" },
            { label: "dayFeeling", value: "good, calm" },
        ]);
    });

    it("leaves out what was not answered: a background or static value, an empty answer", () => {
        expect(
            contextAnswers([
                { type: "script", zone: "context", key: "rollover", hasUI: false, result: "x" },
                { type: "prompt", zone: "context", key: "fixed", hasUI: true, staticBehaviour: true, staticValue: "v", result: null },
                { type: "prompt", zone: "context", key: "blank", hasUI: true, result: "" },
                { type: "prompt", zone: "context", key: "none", hasUI: true, result: undefined },
            ])
        ).toEqual([]);
    });
});

describe("the empty state, only when there is truly nothing (#816 FR-12)", () => {
    const none = { title: "", paths: 0, crystallize: false, upcoming: null, elements: [] };

    it("is empty with nothing at all, and with only a background action that shows nothing", () => {
        expect(previewHasContent(none)).toBe(false);
        expect(previewHasContent({ ...none, elements: [{ type: "script", hasUI: false, result: null }] })).toBe(false);
    });

    it("has content with a title, a template, an upcoming template, a crystallize seed or a visible answer", () => {
        expect(previewHasContent({ ...none, title: "A" })).toBe(true);
        expect(previewHasContent({ ...none, paths: 1 })).toBe(true);
        expect(previewHasContent({ ...none, upcoming: "T.md" })).toBe(true);
        expect(previewHasContent({ ...none, crystallize: true })).toBe(true);
        expect(previewHasContent({ ...none, elements: [{ zone: "frontmatter", key: "purpose", result: "x" }] })).toBe(true);
        expect(previewHasContent({ ...none, elements: [{ zone: "context", key: "h", hasUI: true, result: 3 }] })).toBe(true);
        expect(previewHasContent({ ...none, elements: [{ type: "tags", staticBehaviour: true, staticValue: ["epic"] }] })).toBe(true);
    });
});
