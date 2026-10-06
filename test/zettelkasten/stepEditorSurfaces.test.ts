import { describe, it, expect, beforeAll, afterAll, jest } from "@jest/globals";

// The step editor's import chain reaches the canvas patcher and its ESM-only JSONC parser.
jest.mock("tiny-jsonc", () => ({ __esModule: true, default: { parse: JSON.parse } }));
// The action cards are rendered by React into the "asks" group; here only where the container
// lands is under test, so the root is a recorder rather than a real React tree.
jest.mock("react-dom/client", () => ({
    createRoot: () => ({ render: () => undefined, unmount: () => undefined }),
}));
// The editor freezes the vault state while it is open; there is no vault here.
// (`architecture/plugin` is the suite-wide stand-in from test/__mocks__, extended here.)
jest.mock("architecture/plugin", () => ({
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ...jest.requireActual<object>("../__mocks__/architecture-plugin"),
    VaultStateManager: { INSTANCE: { freeze: () => undefined, defrost: () => undefined } },
}));
// The suggesters attach to real inputs; the fields are what is under test.
jest.mock("architecture/settings", () => ({ FileSuggest: class {}, FolderSuggest: class {}, PropertySuggest: class {} }));
// dnd-kit needs a browser; a card only reads these from it.
jest.mock("@dnd-kit/sortable", () => ({
    useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => undefined, transform: null, transition: undefined }),
}));

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Menu, Setting, __captureSettings } from "obsidian";
import { DomNode, installBrowserGlobals } from "../support/dashboardDom";
import { groupMeta } from "zettelkasten/modals/handlers/stepGroups";
import { CATEGORY_ICON, ACTION_CATEGORIES, actionsStore } from "architecture/api";
import { ActionAccordion } from "zettelkasten/modals/handlers/components/actionsManagment/ActionAccordion";
import { ActionAddMenu } from "zettelkasten/modals/handlers/components/actionsManagment/ActionAddMenu";
import { navbarAction } from "architecture/components/settings/navbar";
import { StepBuilderModal } from "zettelkasten/modals/StepBuilderModal";
import type { StepBuilderInfo } from "zettelkasten";

/**
 * **The step editor reads like the wizard** (#685, epic #676): what the step asks first, action
 * cards with human names, a labelled panel to add one, one heading level inside an action's form,
 * and a quiet header whose three bare accent icons became a named menu.
 */

const info = (extra: Partial<StepBuilderInfo> = {}): StepBuilderInfo =>
    ({ type: "text", root: false, actions: [], label: "", ...extra }) as StepBuilderInfo;

const plugin = {
    app: {},
    settings: {
        installedTemplates: { actions: {}, steps: {} },
        communitySettings: {},
        colourNodesByPhase: false,
        ribbonCanvas: "Flows/Zettelkasten.canvas",
    },
    saveSettings: async () => undefined,
};

const modalStub = { getPlugin: () => plugin, actionsChanged: () => undefined } as never;

beforeAll(() => {
    installBrowserGlobals();
    (globalThis as { createSpan?: unknown }).createSpan = (options?: unknown) => {
        const el = new DomNode().createSpan(options);
        el.parent = null;
        return el;
    };
});

describe("a closed group still says what it holds (#685)", () => {
    it("counts the actions, with the singular said as one", () => {
        expect(groupMeta("asks", info({ actions: [{}, {}] as never }))).toEqual({ key: "step_group_asks_meta", count: 2 });
        expect(groupMeta("asks", info())).toEqual({ key: "step_group_asks_meta_none" });
    });

    it("names the start and the folder, and says nothing it does not know", () => {
        expect(groupMeta("when", info({ root: true }))).toEqual({ key: "step_group_when_meta_root" });
        expect(groupMeta("when", info())).toBeUndefined();
        expect(groupMeta("where", info({ targetFolder: " Zettel " }))?.value).toBe("Zettel/");
        expect(groupMeta("shown", info({ label: "x" }))).toBeUndefined();
    });
});

describe("an action is a card with a human name (#685)", () => {
    const realKeys = actionsStore.getActionsKeys.bind(actionsStore);
    beforeAll(() => {
        jest.spyOn(actionsStore, "getActionsKeys").mockReturnValue(["prompt"]);
        jest.spyOn(actionsStore, "getAction").mockReturnValue({
            getLabel: () => "Ask for text",
            link: "https://example.org/Prompt",
            settings: () => undefined,
        } as never);
        jest.spyOn(actionsStore, "getIconOf").mockReturnValue("form-input");
    });
    afterAll(() => {
        jest.restoreAllMocks();
        void realKeys;
    });

    const card = () =>
        renderToStaticMarkup(
            React.createElement(ActionAccordion, {
                modal: modalStub,
                action: { id: "a1", type: "prompt", description: "The summary" } as never,
                index: 0,
                onRemove: () => undefined,
            })
        );

    it("names the action by what it does, not by its id", () => {
        const html = card();
        expect(html).toContain(">Ask for text<");
        expect(html).not.toContain(">prompt<");
    });

    it("keeps the description editable in place, and every control named", () => {
        const html = card();
        expect(html).toContain('value="The summary"');
        for (const label of ["Drag to rearrange", "Expand or collapse this action", "Remove this action", "Documentation for Ask for text"]) {
            expect(html).toContain(`aria-label="${label}"`);
        }
    });

    it("starts closed, its form kept rather than thrown away", () => {
        expect(card()).toMatch(/action-card-body"[^>]*hidden/);
    });
});

describe("adding an action is one labelled button (#685)", () => {
    it("says what it does instead of a bare plus", () => {
        const html = renderToStaticMarkup(
            React.createElement(ActionAddMenu, { modal: modalStub, onChange: () => undefined, existingActionIds: [] })
        );
        expect(html).toContain(">Add an action<");
        expect(html).toContain('data-icon="plus"');
    });

    it("gives every category a Lucide icon, never an emoji", () => {
        for (const category of ACTION_CATEGORIES) {
            expect(CATEGORY_ICON[category]).toMatch(/^[a-z-]+$/);
        }
    });
});

describe("an action's form has one heading level (#685)", () => {
    it("inside a step: a line about the action and two named controls, no second title", () => {
        const host = new DomNode();
        navbarAction(host as never, "Ask for text", "A text field.", { type: "prompt" } as never, modalStub);
        expect(host.querySelector("h2")).toBeNull();
        expect(host.querySelector("h3")).toBeNull();
        expect(host.byText("A text field.")).toBeDefined();
        const labels = host.querySelectorAll("button").map((b) => b.getAttribute("aria-label"));
        expect(labels).toEqual(["Copy this action", "Save as a template"]);
    });

    it("standing alone: the name is its title, and nothing to copy", () => {
        const host = new DomNode();
        navbarAction(host as never, "Ask for text", "A text field.", { type: "prompt" } as never, modalStub, true);
        expect(host.querySelector("h3")?.text).toBe("Ask for text");
        expect(host.querySelectorAll("button")).toHaveLength(0);
    });
});

describe("the step editor opens on what the step asks (#685)", () => {
    function open(extra: Partial<StepBuilderInfo> = {}) {
        const modal = new StepBuilderModal(plugin as never, { label: "Classify the note", ...extra });
        const contentEl = new DomNode();
        Object.assign(modal, { contentEl, modalEl: new DomNode() });
        modal.info.contentEl = contentEl as never;
        modal.setMode("create");
        modal.onOpen();
        return { modal, contentEl };
    }

    const settings: Setting[] = [];
    beforeAll(() => __captureSettings((setting) => settings.push(setting)));
    afterAll(() => {
        __captureSettings(null);
        jest.restoreAllMocks();
    });

    it("has a quiet header: the name, and a named menu instead of three bare icons", () => {
        const { contentEl } = open();
        const header = contentEl.oneByClass("step-editor-header");
        expect(header.querySelector("h2")?.text).toBe("Classify the note");
        const more = header.oneByClass("step-editor-more");
        expect(more.getAttribute("aria-label")).toBe("More");
        more.click({});
        expect(Menu.last?.items.map((item) => item.title)).toEqual([
            "Copy this step",
            "Apply a template…",
            "Save as a template",
        ]);
    });

    it("puts what the step asks first, holding the action cards", () => {
        const { contentEl } = open();
        const questions = contentEl.byClass("step-group-question").map((q) => q.text);
        expect(questions[0]).toBe("What does this step ask?");
        const asks = contentEl.byClass("step-group")[0];
        expect(asks.byClass("action-cards")).toHaveLength(1);
        expect(asks.oneByClass("step-group-meta").text).toBe("nothing yet");
    });

    it("writes the body first, and keeps the linked note's fields in the same group", () => {
        const { contentEl } = open();
        const writes = contentEl.byClass("step-group")[1];
        const body = writes.oneByClass("step-group-body");
        expect(body.children[0].classes.has("zettelkasten-flow__step-builder-body-slot")).toBe(true);
        expect(body.byClass("satellite-fields")).toHaveLength(1);
    });

    it("reads its words like a person: starts the flow, not root toggle", () => {
        settings.length = 0;
        open();
        const names = settings.map((setting) => setting.name);
        expect(names).toContain("Starts the flow");
        expect(names).not.toContain("Root toggle");
    });
});
