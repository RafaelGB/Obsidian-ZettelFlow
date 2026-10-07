import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { DomNode } from "../../support/dashboardDom";

// The folder suggest reaches the live app; drawn under jest it only needs to exist and hand back
// the callback a chosen folder calls.
const chooseFolder: ((path: string) => void)[] = [];
jest.mock("architecture/settings", () => ({
    FolderSuggest: class {
        constructor(_input: unknown, onChoose?: (path: string) => void) {
            if (onChoose) chooseFolder.push(onChoose);
        }
    },
}));

import { renderScopeCard, __resetScopeCard, type ScopeCardDeps } from "config/modals/handlers/scope/scopeCard";
import { compileScope, type ScopeFacts } from "architecture/knowledge/scope/scopeEvaluate";
import { scopeCensus } from "architecture/knowledge/scope/scopeCensus";
import type { ScopeRules } from "architecture/knowledge/scope/scopeRules";

const f = (path: string, tags: string[] = [], frontmatter: Record<string, unknown> | null = null): ScopeFacts => ({ path, tags, frontmatter });

const VAULT: ScopeFacts[] = [
    f("Templates/Book template.md", ["#template"]),
    f("Templates/Weekly template.md"),
    f("Notes/Recipes template.md", ["#template"]),
    f("Notes/Half-thought.md", ["#draft"]),
    f("Notes/Keeper.md", ["#template", "#evergreen"]),
    f("Notes/Map.md", [], { type: "moc" }),
    f("Notes/Idea.md", ["#idea"], { type: "note", status: "archived" }),
    f("_ZettelFlow/lab/thought.md"),
];
const SYSTEM = ["_ZettelFlow/folders", "_ZettelFlow/lab"];

function harness(initial: ScopeRules = { leaveOut: [], keep: [] }, overrides: Partial<ScopeCardDeps> = {}) {
    let rules: ScopeRules = initial;
    const host = new DomNode() as unknown as HTMLElement & DomNode;
    const commit = jest.fn(async (next: ScopeRules) => {
        rules = next;
    });
    const sheets: { host: DomNode; dismissed: () => void }[] = [];
    const deps: ScopeCardDeps = {
        rules: () => rules,
        compiled: () => compileScope(rules, SYSTEM),
        facts: () => VAULT,
        system: () => ({ folders: SYSTEM, thinking: "_ZettelFlow/lab" }),
        folderExists: (path) => ["Templates", "Notes"].includes(path),
        commit,
        isPhone: false,
        openSheet: (draw, dismissed) => {
            const sheetHost = new DomNode();
            sheets.push({ host: sheetHost, dismissed });
            draw(sheetHost as unknown as HTMLElement);
            return { redraw: () => draw(sheetHost as unknown as HTMLElement), finish: jest.fn() };
        },
        ...overrides,
    };
    const render = () => renderScopeCard(host, deps);
    render();
    const button = (label: string, within: DomNode = host): DomNode => {
        const found = within.find((el) => el.tag === "button" && (el.textContent === label || el.getAttribute("aria-label") === label));
        if (!found) throw new Error(`no "${label}" button`);
        return found;
    };
    const text = () => host.textContent;
    return { host, deps, commit, render, button, text, rules: () => rules, sheets };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
    __resetScopeCard();
    chooseFolder.length = 0;
});

describe("the kept-out card says how much counts (FR-10, FR-11)", () => {
    it("with no rules: every note counts, and ZettelFlow's own folders are named, with nothing to remove", () => {
        const h = harness();
        expect(h.host.oneByClass("scope-summary-line").textContent).toBe("7 of 8 notes count as knowledge");
        expect(h.text()).toContain("1 in ZettelFlow's own folders");
        expect(h.text()).toContain("Every note counts as knowledge.");
        const locked = h.host.oneByClass("scope-locked");
        expect(locked.textContent).toContain("Always left out — no rule or exception changes these");
        expect(locked.byClass("scope-chip").map((chip) => chip.textContent)).toEqual(["_ZettelFlow/folders", "Thinking space · _ZettelFlow/lab"]);
        expect(locked.findAll((el) => el.tag === "button")).toHaveLength(0);
    });

    it("reads its numbers from the census, and a rule says what it leaves out in words (AC-12)", () => {
        const h = harness({
            leaveOut: [
                { kind: "folder", op: "in", folder: "Templates", subfolders: true },
                { kind: "property", op: "oneOf", property: "type", values: ["moc"] },
                { kind: "property", op: "oneOf", property: "type", values: ["nothing"] },
            ],
            keep: [],
        });
        const census = scopeCensus(compileScope(h.rules(), SYSTEM), VAULT);
        expect(h.host.oneByClass("scope-summary-line").textContent).toBe(`${census.knowledge} of 8 notes count as knowledge`);
        const rows = h.host.byClass("scope-rule");
        expect(rows[0].oneByClass("scope-sentence").textContent).toBe("are in Templates and its subfolders");
        expect(rows[0].oneByClass("scope-count").textContent).toBe("Leaves out 2 notes");
        expect(rows[1].oneByClass("scope-sentence").textContent).toBe("have type set to moc");
        expect(rows[1].oneByClass("scope-count").textContent).toBe("Leaves out 1 note");
        expect(rows[2].oneByClass("scope-count").textContent).toBe("Leaves out no notes yet");
    });

    it("says every sentence each kind can say", () => {
        const h = harness({
            leaveOut: [
                { kind: "folder", op: "in", folder: "Notes", subfolders: false },
                { kind: "folder", op: "notIn", folder: "Notes", subfolders: true },
                { kind: "tag", op: "any", tags: ["template", "draft"], nested: true },
                { kind: "tag", op: "none", tags: ["idea"], nested: false },
                { kind: "property", op: "set", property: "status", values: [] },
                { kind: "property", op: "notSet", property: "status", values: [] },
            ],
            keep: [],
        });
        expect(h.host.byClass("scope-sentence").map((s) => s.textContent)).toEqual([
            "are in Notes",
            "are not in Notes or its subfolders",
            "have the tag #template or #draft or a nested tag",
            "have none of the tags #idea",
            "have status set",
            "do not have status set",
        ]);
    });

    it("cautions, inline, when the rules leave everything out — and still saves (FR-15)", () => {
        const h = harness({ leaveOut: [{ kind: "folder", op: "notIn", folder: "Nowhere", subfolders: true }], keep: [] });
        expect(h.host.oneByClass("scope-caution").textContent).toBe("These rules leave out every note, so nothing counts as knowledge.");
    });
});

describe("authoring a rule through the card alone (AC-7, AC-8, FR-16)", () => {
    it("adds a folder rule: Add waits for a folder that exists, and saves exactly once", async () => {
        const h = harness();
        h.button("Add a rule").click();
        const editor = h.host.oneByClass("scope-editor");
        expect(button("Add rule", editor).getAttribute("disabled")).toBe("true");
        const input = editor.oneByClass("scope-search-input");
        input.value = "Templ";
        input.fire("input");
        expect(button("Add rule", h.host.oneByClass("scope-editor")).getAttribute("disabled")).toBe("true");
        chooseFolder.at(-1)!("Templates");
        const ready = h.host.oneByClass("scope-editor");
        expect(button("Add rule", ready).getAttribute("disabled")).toBeNull();
        expect(ready.oneByClass("scope-preview-count").textContent).toBe("Would leave out 2 notes");
        expect(h.commit).not.toHaveBeenCalled();
        button("Add rule", ready).click();
        await flush();
        expect(h.commit).toHaveBeenCalledTimes(1);
        expect(h.rules().leaveOut).toEqual([{ kind: "folder", op: "in", folder: "Templates", subfolders: true }]);
        // What it promised is what it shows once added.
        expect(h.host.oneByClass("scope-count").textContent).toBe("Leaves out 2 notes");
        expect(h.host.byClass("scope-editor")).toHaveLength(0);

        function button(label: string, within: DomNode): DomNode {
            return h.button(label, within);
        }
    });

    it("adds a tag rule from chips with counts, switching match and nesting, without a save until Add", async () => {
        const h = harness();
        h.button("Add a rule").click();
        h.button("Tag").click();
        h.button("Have none of these tags").click();
        h.button("Have any of these tags").click();
        const editor = () => h.host.oneByClass("scope-editor");
        expect(editor().byClass("scope-pick").map((chip) => chip.textContent)).toEqual(["#template3", "#draft1", "#evergreen1", "#idea1"]);
        editor().byClass("scope-pick")[1].click(); // #draft
        editor().byClass("scope-pick")[0].click(); // #template
        editor().find((el) => el.getAttribute("role") === "switch")!.click(); // nested off
        expect(h.commit).not.toHaveBeenCalled();
        // Keeper.md carries #template too, and no exception keeps it yet.
        expect(editor().oneByClass("scope-preview-count").textContent).toBe("Would leave out 4 notes");
        h.button("Add rule").click();
        await flush();
        expect(h.commit).toHaveBeenCalledTimes(1);
        expect(h.rules().leaveOut).toEqual([{ kind: "tag", op: "any", tags: ["draft", "template"], nested: false }]);
    });

    it("adds a property rule from the vault's values — there is no box to type a value into", async () => {
        const h = harness();
        h.button("Add a rule").click();
        h.button("Property").click();
        const names = h.host.oneByClass("scope-editor").byClass("scope-name-label").map((n) => n.textContent);
        expect(names).toEqual(["type", "status"]);
        h.host.oneByClass("scope-editor").byClass("scope-name")[0].click();
        const editor = h.host.oneByClass("scope-editor");
        // Values are ticked from a list; the only inputs are checkboxes.
        const inputs = editor.findAll((el) => el.tag === "input");
        expect(inputs.map((input) => (input as unknown as { type: string }).type)).toEqual(["checkbox", "checkbox"]);
        expect(editor.byClass("scope-check-name").map((v) => v.textContent)).toEqual(["moc", "note"]);
        expect(editor.byClass("scope-check-count").map((v) => v.textContent)).toEqual(["1", "1"]);
        const box = editor.byClass("scope-check")[0].find((el) => el.tag === "input")!;
        box.checked = true;
        box.fire("change");
        h.button("Add rule").click();
        await flush();
        expect(h.rules().leaveOut).toEqual([{ kind: "property", op: "oneOf", property: "type", values: ["moc"] }]);
    });

    it("is set and is not set need no value", async () => {
        const h = harness();
        h.button("Add a rule").click();
        h.button("Property").click();
        h.host.oneByClass("scope-editor").byClass("scope-name")[1].click(); // status
        h.button("Is set").click();
        h.button("Add rule").click();
        await flush();
        expect(h.rules().leaveOut).toEqual([{ kind: "property", op: "set", property: "status", values: [] }]);
    });

    it("edits a rule in place and removes one, each a single save", async () => {
        const h = harness({ leaveOut: [{ kind: "folder", op: "in", folder: "Templates", subfolders: true }], keep: [] });
        h.button("Edit").click();
        expect(h.host.oneByClass("scope-editor-title").textContent).toBe("Edit rule");
        h.button("Are not in this folder").click();
        h.button("Save").click();
        await flush();
        expect(h.rules().leaveOut).toEqual([{ kind: "folder", op: "notIn", folder: "Templates", subfolders: true }]);
        h.button("Remove").click();
        await flush();
        expect(h.commit).toHaveBeenCalledTimes(2);
        expect(h.rules().leaveOut).toEqual([]);
    });

    it("cancel writes nothing", () => {
        const h = harness();
        h.button("Add a rule").click();
        h.button("Tag").click();
        h.button("Cancel").click();
        expect(h.commit).not.toHaveBeenCalled();
        expect(h.host.byClass("scope-editor")).toHaveLength(0);
    });

    it("an empty vault offers nothing to pick, and Add stays off", () => {
        const h = harness({ leaveOut: [], keep: [] }, { facts: () => [f("a.md")] });
        h.button("Add a rule").click();
        h.button("Tag").click();
        expect(h.text()).toContain("No tags in this vault yet");
        expect(h.button("Add rule").getAttribute("disabled")).toBe("true");
        h.button("Property").click();
        expect(h.text()).toContain("No properties in this vault yet");
    });

    it("keeps the open draft when the settings renderer draws the row again", () => {
        const h = harness();
        h.button("Add a rule").click();
        h.button("Tag").click();
        h.host.oneByClass("scope-editor").byClass("scope-pick")[0].click();
        h.render();
        h.render();
        expect(h.host.byClass("scope-card")).toHaveLength(1);
        expect(h.host.byClass("scope-editor")).toHaveLength(1);
        expect(h.host.oneByClass("scope-editor").byClass("scope-pick")[0].hasClass("is-active")).toBe(true);
    });
});

describe("exceptions, and the phone (FR-12, FR-20)", () => {
    it("keeps a note in anyway, saying how many before it is added", async () => {
        const h = harness({ leaveOut: [{ kind: "tag", op: "any", tags: ["template"], nested: true }], keep: [] });
        h.button("Add an exception").click();
        h.button("Tag").click();
        const editor = h.host.oneByClass("scope-editor");
        expect(editor.oneByClass("scope-editor-title").textContent).toBe("New exception");
        const evergreen = editor.byClass("scope-pick").find((chip) => chip.textContent?.startsWith("#evergreen"))!;
        evergreen.click();
        expect(h.host.oneByClass("scope-preview-count").textContent).toBe("Would keep 1 note");
        h.button("Add exception").click();
        await flush();
        expect(h.rules().keep).toEqual([{ kind: "tag", op: "any", tags: ["evergreen"], nested: true }]);
        expect(h.host.byClass("scope-rule--keep")[0].oneByClass("scope-count").textContent).toBe("Keeps 1 note");
    });

    it("on a phone the same editor opens in a sheet, not inline", () => {
        const h = harness({ leaveOut: [], keep: [] }, { isPhone: true });
        h.button("Add a rule").click();
        expect(h.host.byClass("scope-editor")).toHaveLength(0);
        expect(h.sheets).toHaveLength(1);
        expect(h.sheets[0].host.byClass("scope-editor")).toHaveLength(1);
        h.sheets[0].dismissed();
        expect(h.commit).not.toHaveBeenCalled();
    });
});
