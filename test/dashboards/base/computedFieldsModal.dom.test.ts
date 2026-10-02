/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterEach, jest } from "@jest/globals";
import { __captureSettings, type Setting } from "obsidian";
import { normalize } from "dashboards/datastore";
import type { AdaptedEntry, FieldDescriptor } from "dashboards/datastore";
import { ComputedFieldsModal } from "dashboards/base/ComputedFieldsModal";
import type { ComputedOutcome, ComputedResolver } from "dashboards/base/scriptTransform";
import { DomNode, flush, installBrowserGlobals } from "../../support/dashboardDom";

// The real editor is CodeMirror (a browser editor); the modal only needs a handle it can insert into.
const editor = {
    state: { selection: { main: { head: 4 } } },
    dispatch: jest.fn(),
    focus: jest.fn(),
    destroy: jest.fn(),
};
const dispatchEditor = jest.fn((..._args: unknown[]) => editor);
const rowFieldCompletion = jest.fn((..._args: unknown[]) => ({}));
jest.mock("architecture/components/core/codeView/editor/Dispatcher", () => ({ dispatchEditor: (...a: unknown[]) => dispatchEditor(...a) }));
jest.mock("dashboards/base/rowCompletion", () => ({ rowFieldCompletion: (...a: unknown[]) => rowFieldCompletion(...a) }));

const props: FieldDescriptor[] = [
    { id: "note.hours", name: "hours" },
    { id: "note.my field", name: "my field" },
];
const entry = (path: string, hours: number | null): AdaptedEntry => ({
    path,
    cells: {
        "note.hours": hours === null ? { kind: null, display: "", raw: null } : { kind: "number", display: String(hours), raw: hours },
        "note.my field": { kind: "category", display: "x", raw: "x" },
    },
});
const base = normalize([entry("Daily/a.md", 6), entry("Daily/b.md", null)], props, "s");

let settings: Setting[] = [];
function open(outcome: ComputedOutcome, initial?: { enabled: boolean; code: string }) {
    settings = [];
    __captureSettings((s) => settings.push(s));
    const evaluate = jest.fn(async () => outcome);
    const onSubmit = jest.fn();
    const modal = new ComputedFieldsModal({} as any, base, { evaluate } as unknown as ComputedResolver, initial, onSubmit);
    const content = new DomNode();
    (modal as any).contentEl = content;
    (modal as any).modalEl = new DomNode();
    modal.open();
    return { modal, content, evaluate, onSubmit };
}
const setting = (name: string): Setting => [...settings].reverse().find((s) => s.name === name) as Setting;
const button = (content: DomNode, text: string): DomNode => content.find((el) => el.tag === "button" && el.text === text) as DomNode;

beforeAll(() => installBrowserGlobals());
afterEach(() => {
    __captureSettings(null);
    jest.clearAllMocks();
});

const added = { id: "score", name: "score", type: "number" as const };

describe("ComputedFieldsModal (#632) — everything on one screen", () => {
    it("off by default: only the switch and its warning", () => {
        const { content, modal } = open({ ok: true, snapshot: base, added: [], skipped: 0, warnings: [] });
        expect((modal as any).titleText).toBe("Computed fields (advanced)");
        expect(setting("Enable computed fields").toggles[0].value).toBe(false);
        expect(content.byClass("base-dashboard-computed-guide")).toHaveLength(0);
    });

    it("on: the three rules, this Base's fields with how many notes carry them, and a starter for this Base", async () => {
        const { content } = open({ ok: true, snapshot: base, added: [], skipped: 0, warnings: [] });
        setting("Enable computed fields").toggles[0].flip(true);
        expect(content.byClass("base-dashboard-computed-steps")[0].children).toHaveLength(3);
        const chips = content.byClass("base-dashboard-field-chip");
        expect(chips.map((c) => c.oneByClass("base-dashboard-field-coverage").text)).toEqual(["1/2", "2/2"]);
        expect(chips[0].hasClass("is-partial")).toBe(true); // hours is missing from one note
        await flush();
        const [, code, , bindings] = dispatchEditor.mock.calls[0] as [unknown, string, unknown, { name: string }[]];
        expect(code).toContain("score: row.hours / 8");
        expect(bindings.map((b) => b.name)).toEqual(["row", "index", "rows", "zf"]);
        expect(rowFieldCompletion).toHaveBeenCalledWith([
            { key: "hours", type: "number", coverage: "In 1 of 2 notes" },
            { key: "my field", type: "category", coverage: "In 2 of 2 notes" },
        ]);
    });

    it("a field chip inserts how a script reads it — bracketed when the name is not an identifier", async () => {
        const { content } = open({ ok: true, snapshot: base, added: [], skipped: 0, warnings: [] }, { enabled: true, code: "x" });
        await flush();
        const chips = content.byClass("base-dashboard-field-chip");
        chips[0].click();
        chips[1].click();
        const inserts = editor.dispatch.mock.calls.map((call: any) => call[0].changes.insert);
        expect(inserts).toEqual(["row.hours", 'row["my field"]']);
        expect(editor.focus).toHaveBeenCalled();
    });

    it("Run previews the new columns, with the empty cells and the skipped notes named", async () => {
        const enriched = normalize([entry("Daily/a.md", 6), entry("Daily/b.md", null)], props, "e");
        enriched.rows[0]["score"] = { kind: "number", display: "0.75", raw: 0.75 };
        enriched.rows[1]["score"] = { kind: null, display: "", raw: null };
        const { content, evaluate } = open(
            { ok: true, snapshot: enriched, added: [added], skipped: 1, warnings: [{ row: 1, message: "no hours" }, { row: null, message: "shadowed" }] },
            { enabled: true, code: "return { score: row.hours / 8 }" },
        );
        setting("Preview").buttons[0].click();
        await flush();
        expect(evaluate).toHaveBeenCalledWith(base, "return { score: row.hours / 8 }");
        expect(content.byText("Adds 1 field")).toBeDefined();
        const cells = content.querySelectorAll("td").map((td) => td.text);
        expect(cells).toEqual(["a", "0.75", "b", "—"]);
        expect(content.byText("1 note skipped; its new fields are empty.")).toBeDefined();
        expect(content.byText("b: no hours")).toBeDefined();
        expect(content.byText("shadowed")).toBeDefined();
    });

    it("a script that fails, or adds nothing, says so", async () => {
        const failing = open({ ok: false, error: "Unexpected token" }, { enabled: true, code: "return {" });
        setting("Preview").buttons[0].click();
        await flush();
        expect(failing.content.oneByClass("base-dashboard-notice").hasClass("is-error")).toBe(true);
        expect(failing.content.byText("Unexpected token")).toBeDefined();

        const nothing = open({ ok: true, snapshot: base, added: [], skipped: 0, warnings: [] }, { enabled: true, code: "return {}" });
        setting("Preview").buttons[0].click();
        await flush();
        expect(nothing.content.byText("This code adds no new field yet; return an object such as { score: … }.")).toBeDefined();
    });

    it("saves the switch and the code; closing destroys the editor", async () => {
        const { content, onSubmit, modal } = open({ ok: true, snapshot: base, added: [], skipped: 0, warnings: [] }, { enabled: true, code: "return {}" });
        await flush();
        button(content, "Save").click();
        expect(onSubmit).toHaveBeenCalledWith({ enabled: true, code: "return {}" });
        modal.close();
        expect(editor.destroy).toHaveBeenCalled();
    });
});
