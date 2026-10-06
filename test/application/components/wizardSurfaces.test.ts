import { describe, it, expect, beforeEach, jest } from "@jest/globals";

// The wizard's barrel reaches the canvas patcher, whose JSONC parser ships as ESM only; nothing
// here parses a canvas, so it stands in as the JSON it is a superset of.
jest.mock("tiny-jsonc", () => ({ __esModule: true, default: { parse: JSON.parse } }));
// The surfaces are what is under test, not the registries behind them: the action registry, the
// settings modals and the root step's loader stand in as the little the markup reads from them.
jest.mock("architecture/api", () => ({
    actionsStore: {
        getLabelOf: (type: string) => ({ prompt: "Ask for text", checkbox: "Ask yes or no" } as Record<string, string>)[type] ?? type,
        getIconOf: () => "text-cursor-input",
        getAction: () => ({ category: "manipulation" }),
    },
}));
jest.mock("architecture/components/settings", () => ({ ConfirmModal: class {} }));
jest.mock("application/components/noteBuilder/RootSelector", () => ({ RootSelector: () => null }));
// The wizard's store, reduced to the fields these surfaces read — the walk itself has its own
// suites; here only what it shows is under test.
jest.mock("application/components/noteBuilder/state/NoteBuilderState", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createWithEqualityFn } = require("zustand/traditional");
    const fresh = () => ({
        creationMode: true,
        title: "",
        invalidTitle: false,
        position: 0,
        previousArray: [] as number[],
        previousSections: new Map(),
        activeCanvasName: "",
        currentNode: undefined,
        currentAction: "",
        enableSkip: false,
        hiddenBranches: [],
        header: { title: "Select a flow" },
        section: { color: "", element: null },
        builder: {
            note: {
                getTargetFolder: () => "Zettel",
                hasPattern: () => false,
                getPattern: () => "",
                isTargetFolderLocked: () => true,
                getSatellite: () => undefined,
            },
        },
    });
    const store = createWithEqualityFn(() => ({
        ...fresh(),
        actions: {
            setTitle: (title: string) => store.setState({ title }),
            setInvalidTitle: () => undefined,
            jumpToStep: () => undefined,
            reset: () => store.setState(fresh()),
        },
    }));
    return { useNoteBuilderStore: store };
});
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
    accentColour,
    footerModel,
    foldedCrumbs,
    walkProgress,
} from "application/components/noteBuilder/presentation";
import { WizardFooter } from "application/components/noteBuilder/WizardFooter";
import { WalkStatus } from "application/components/noteBuilder/WalkStatus";
import { useNoteBuilderStore } from "application/components/noteBuilder/state/NoteBuilderState";
import { Select } from "application/components/select/Select";
import { Checkbox } from "architecture/components/core/checkbox/Checkbox";
import { ConfirmStep } from "architecture/components/core/confirmStep/ConfirmStep";
import { SelectorWrapper } from "actions/selector/components/SelectorComponent";
import { checkboxText } from "actions/checkbox/checkboxText";
import { Section } from "application/components/section/Section";
import type { NoteBuilderType, WrappedActionBuilderProps } from "application/components/noteBuilder/typing";
import type { FlowNode } from "architecture/plugin/canvas";

/**
 * A server render reads a zustand store's *initial* state (its server snapshot), and the store
 * reads it from its own closure. These renders stand in for a live wizard, so the state the test
 * sets is copied onto that initial object too.
 */
function seed(patch: Parameters<typeof useNoteBuilderStore.setState>[0]): void {
    useNoteBuilderStore.setState(patch);
    Object.assign(useNoteBuilderStore.getInitialState(), useNoteBuilderStore.getState());
}

const h = React.createElement;
const html = (element: React.ReactElement): string => renderToStaticMarkup(element);
const noop = (): void => undefined;

/** The opening tag of the first element carrying `cls`, for asserting on its attributes. */
function tagWith(markup: string, cls: string): string {
    const at = markup.indexOf(cls);
    if (at < 0) return "";
    const open = markup.lastIndexOf("<", at);
    return markup.slice(open, markup.indexOf(">", at) + 1);
}

describe("the header's progress is a bar only when the flow can stand behind it (#684)", () => {
    it("draws no bar without an estimate — the position alone, as #408 promised", () => {
        expect(walkProgress(3, undefined)).toEqual({ step: 3 });
    });

    it("is never full while a step is still being asked", () => {
        expect(walkProgress(1, 0).percent).toBe(50);
        expect(walkProgress(4, 0).percent).toBeLessThan(100);
        expect(walkProgress(2, 3)).toEqual({ step: 2, remaining: 3, percent: 30 });
    });

    it("survives nonsense rather than drawing it", () => {
        expect(walkProgress(0, -2)).toEqual({ step: 1 });
        expect(walkProgress(2, Number.NaN)).toEqual({ step: 2 });
    });
});

describe("the footer keeps every control in its place (#684)", () => {
    it("disables what does not apply instead of removing it", () => {
        expect(footerModel({ canGoBack: false, canSkip: false, hasContent: false, building: false })).toEqual({
            back: { enabled: false },
            skip: { shown: false },
            build: { enabled: false },
        });
    });

    it("offers nothing while the note is being built", () => {
        expect(footerModel({ canGoBack: true, canSkip: true, hasContent: true, building: true })).toEqual({
            back: { enabled: false },
            skip: { shown: false },
            build: { enabled: false },
        });
    });

    const footer = (overrides: Partial<Parameters<typeof WizardFooter>[0]>) =>
        html(
            h(WizardFooter, {
                canGoBack: true,
                canSkip: true,
                hasContent: true,
                building: false,
                onBack: noop,
                onSkip: noop,
                onBuild: noop,
                confirmSlot: noop,
                ...overrides,
            })
        );

    it("says every action in words", () => {
        const markup = footer({});
        expect(markup).toContain(">Back<");
        expect(markup).toContain(">Skip this step<");
        expect(markup).toContain(">Build with what I have<");
        expect(markup).toContain("wizard-footer-confirm");
    });

    it("keeps Skip in the layout, hidden, when the step cannot be skipped", () => {
        const skip = tagWith(footer({ canSkip: false }), "wizard-footer-skip");
        expect(skip).toContain("is-placeholder");
        expect(skip).toContain("disabled");
        expect(skip).toContain('aria-hidden="true"');
    });

    it("disables Back on the first step and Build with nothing answered", () => {
        const markup = footer({ canGoBack: false, hasContent: false });
        expect(tagWith(markup, "wizard-footer-back")).toContain("disabled");
        expect(tagWith(markup, "wizard-footer-build")).toContain("disabled");
    });

    it("shows the undo key next to the actions", () => {
        expect(footer({})).toContain("<kbd>Z</kbd>");
    });
});

describe("the step's Confirm is Obsidian's primary button, wherever it is drawn (#547, #684)", () => {
    it("renders in place, with its hint, when there is no footer to draw into", () => {
        const markup = html(h(ConfirmStep, { onConfirm: noop }));
        expect(markup).toContain('class="mod-cta"');
        expect(markup).toContain("Press Enter to confirm.");
    });
});

describe("a checkbox carries its words (#684)", () => {
    it("puts the box and its label in one label element", () => {
        const markup = html(h(Checkbox, { onConfirm: noop, confirmTooltip: "", label: "Ready to share", hint: "Writes shared to the note." }));
        expect(markup).toMatch(/<label class="[^"]*check-row[^"]*"><input type="checkbox"/);
        expect(markup).toContain("Ready to share");
        expect(markup).toContain("Writes shared to the note.");
    });

    it("says the author's label, else the property it writes", () => {
        expect(checkboxText({ label: "Ready to share", key: "shared" })).toBe("Ready to share");
        expect(checkboxText({ label: "  ", key: "shared" })).toBe("shared");
        expect(checkboxText({})).toBeUndefined();
    });
});

describe("an option's colour means the step it leads to (#684)", () => {
    const options = [
        { key: "a", label: "Concept", color: "var(--canvas-color-5)", actionTypes: [] },
        { key: "b", label: "Literature", color: "8, 185, 78", actionTypes: [] },
        { key: "c", label: "Question", color: "var(--embed-background)", actionTypes: [] },
    ];

    it("hands a preset colour over as a colour — never inside rgba(), where it was invalid", () => {
        expect(accentColour("var(--canvas-color-2)")).toBe("var(--canvas-color-2)");
        expect(accentColour("8, 185, 78")).toBe("rgb(8, 185, 78)");
        expect(accentColour("var(--embed-background)")).toBeUndefined();
    });

    it("paints an edge only for an option with a destination colour", () => {
        const markup = html(h(Select, { options, callback: noop }));
        expect(tagWith(markup, 'data-option-key="a"')).toContain("--zf-option-accent:var(--canvas-color-5)");
        expect(tagWith(markup, 'data-option-key="a"')).toContain("option-accented");
        expect(tagWith(markup, 'data-option-key="b"')).toContain("--zf-option-accent:rgb(8, 185, 78)");
        expect(tagWith(markup, 'data-option-key="c"')).not.toContain("option-accented");
        expect(markup).not.toContain("--canvas-color:");
    });

    it("marks a selector's default in words, not in a colour nobody gave it", () => {
        const props = {
            action: { type: "selector", id: "s1", options: [["x", "Draft"], ["y", "Final"]], defaultOption: "y" },
            callback: noop,
        } as unknown as WrappedActionBuilderProps;
        const markup = html(h(SelectorWrapper, props));
        expect(markup).not.toContain("--zf-option-accent");
        expect(tagWith(markup, 'data-option-key="y"')).toContain("option-active");
        expect(markup).toContain(">default<");
    });

    it("lets the footer Confirm take the active option", () => {
        const markup = html(h(Select, { options, callback: noop }));
        expect(markup).toContain('class="mod-cta"');
        expect(markup).toContain("Pick an option, then confirm.");
    });
});

describe("the breadcrumb folds a long walk instead of cutting the current step (#684)", () => {
    it("shows everything up to the fold", () => {
        expect(foldedCrumbs(3, false)).toEqual({ shown: [0, 1, 2], folded: 0 });
    });

    it("keeps the newest steps and counts the folded ones", () => {
        expect(foldedCrumbs(6, false)).toEqual({ shown: [4, 5], folded: 4 });
        expect(foldedCrumbs(6, true).folded).toBe(0);
    });
});

describe("one progress header (#684)", () => {
    const flow = {
        canvasPath: "Flows/Zettel.canvas",
        data: {
            nodes: [
                { id: "a", type: "file" },
                { id: "b", type: "file" },
                { id: "c", type: "file" },
            ],
            edges: [
                { id: "e1", fromNode: "a", toNode: "b" },
                { id: "e2", fromNode: "b", toNode: "c" },
            ],
        },
    };
    const props = {
        flow,
        plugin: {},
        modal: { getCanvasName: () => "Zettel" },
    } as unknown as NoteBuilderType;

    beforeEach(() => {
        useNoteBuilderStore.getState().actions.reset();
        seed({});
    });

    it("draws the position as a real bar, with the estimate in words", () => {
        seed({
            currentNode: { id: "a" } as FlowNode,
            previousArray: [],
            title: "Event sourcing",
        });
        const markup = html(h(WalkStatus, props));
        expect(markup).toContain('role="progressbar"');
        expect(markup).toContain("--zf-progress:");
        expect(markup).toContain("Step 1");
        expect(markup).toContain("about 2 left");
        expect(markup).toContain('value="Event sourcing"');
    });

    it("draws no bar when no estimate exists", () => {
        seed({ currentNode: undefined });
        const markup = html(h(WalkStatus, props));
        expect(markup).not.toContain('role="progressbar"');
        expect(markup).toContain("Step 1");
    });

    it("says where the note lands, in a chip, with a lock when the flow fixes the folder", () => {
        seed({ title: "Event sourcing" });
        const markup = html(h(WalkStatus, props));
        expect(markup).toContain("wizard-destination");
        expect(markup).toContain("Zettel/Event sourcing.md");
        expect(markup).toContain("Folder fixed by the flow");
    });

    it("marks a title the build refused", () => {
        seed({ invalidTitle: true });
        const input = tagWith(html(h(WalkStatus, props)), "wizard-title-input");
        expect(input).toContain("is-invalid");
        expect(input).toContain('aria-invalid="true"');
    });

    it("shows the edited note's name, not a field or a destination, when editing", () => {
        seed({ creationMode: false, title: "Old note" });
        const markup = html(h(WalkStatus, props));
        expect(markup).not.toContain("<input");
        expect(markup).not.toContain("wizard-destination");
        expect(markup).toContain(">Old note<");
    });

    it("folds a long walk behind one control that says how many steps it hides", () => {
        const titles = ["Kind", "Summary", "Topics", "Source", "Due"];
        seed({
            activeCanvasName: "Zettelkasten",
            previousArray: [0, 1, 2, 3, 4],
            previousSections: new Map(titles.map((title, index) => [index, { header: { title } }])),
            header: { title: "Ready?" },
        });
        const markup = html(h(WalkStatus, props));
        expect(markup).toContain('aria-label="Show the 3 earlier steps"');
        expect(markup).not.toContain(">Summary<");
        expect(markup).toContain(">Source<");
        expect(markup).toContain(">Due<");
        expect(markup).toContain('aria-current="step"');
    });
});

describe("the step has a heading (#684)", () => {
    const props = { flow: {}, plugin: {}, modal: {} } as unknown as NoteBuilderType;

    beforeEach(() => {
        useNoteBuilderStore.getState().actions.reset();
        seed({});
    });

    it("renders the question as an h2 with its phase in words", () => {
        seed({
            header: { title: "What kind of note is it?" },
            currentNode: { id: "a", phase: "CLASSIFY", color: "var(--canvas-color-2)" } as FlowNode,
            enableSkip: true,
            section: { color: "", element: h("div", { key: "step-a" }, "answer") },
        });
        const markup = html(h(Section, props));
        expect(markup).toMatch(/<h2 class="[^"]*step-title[^"]*">What kind of note is it\?<\/h2>/);
        expect(markup).toContain("Classify");
        expect(markup).toContain("Can be skipped");
        expect(markup).toContain("--zf-step-accent:var(--canvas-color-2)");
    });

    it("names the kind of answer an action step wants", () => {
        seed({
            header: { title: "Say it in your own words" },
            currentAction: "prompt",
            currentNode: { id: "b" } as FlowNode,
            section: { color: "", element: h("div", { key: "step-b" }) },
        });
        const markup = html(h(Section, props));
        expect(markup).toContain("Ask for text");
        expect(markup).not.toContain("--zf-step-accent");
    });

    it("drops the kicker while the note is being built", () => {
        seed({
            header: { title: "Creating the note…" },
            currentAction: "prompt",
            currentNode: { id: "b", phase: "DEVELOP" } as FlowNode,
            section: { color: "info", element: h("div", { key: "progress" }) },
        });
        expect(html(h(Section, props))).not.toContain("step-kicker");
    });
});
