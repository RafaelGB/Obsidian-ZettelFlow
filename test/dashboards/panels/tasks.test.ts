import { describe, it, expect } from "@jest/globals";
import { buildTaskView, fingerprint, parseTaskLine, toggledLine, type TaskItem } from "dashboards/panels";

const task = (path: string, line: number, mark: string, text: string, depth = 0): TaskItem => ({ path, line, mark, text, depth });

describe("task lines (#635)", () => {
    it("parses the standard markers and keeps the text as written", () => {
        expect(parseTaskLine("- [ ] call the supplier")).toEqual({ prefix: "- [", mark: " ", text: "call the supplier" });
        expect(parseTaskLine("    * [x] done 📅 2026-10-05")?.text).toBe("done 📅 2026-10-05");
        expect(parseTaskLine("1. [/] half")?.mark).toBe("/");
        expect(parseTaskLine("2) [ ] numbered")?.prefix).toBe("2) [");
    });

    it("is not fooled by a plain list item or a link", () => {
        expect(parseTaskLine("- call the supplier")).toBeNull();
        expect(parseTaskLine("[ ] no marker")).toBeNull();
        expect(parseTaskLine("- [link](x)")).toBeNull();
    });

    it("toggles exactly one character, both ways — ticking twice is the identity", () => {
        const line = "  - [ ] call the supplier";
        const ticked = toggledLine(line, { mark: " ", text: "call the supplier" });
        expect(ticked).toBe("  - [x] call the supplier");
        expect(toggledLine(ticked as string, { mark: "x", text: "call the supplier" })).toBe(line);
    });

    it("refuses when the line is no longer the task the panel showed", () => {
        expect(toggledLine("- [x] call the supplier", { mark: " ", text: "call the supplier" })).toBeNull();
        expect(toggledLine("- [ ] call the client", { mark: " ", text: "call the supplier" })).toBeNull();
        expect(toggledLine("a paragraph", { mark: " ", text: "call the supplier" })).toBeNull();
    });

    it("fingerprints a line without keeping it", () => {
        const print = fingerprint("- [ ] secret plan");
        expect(print).toMatch(/^[0-9a-f]{8}$/);
        expect(print).not.toContain("secret");
        expect(fingerprint("- [x] secret plan")).not.toBe(print);
    });
});

describe("the task view (#635)", () => {
    const items = [
        task("b.md", 4, " ", "b2"),
        task("a.md", 1, " ", "a1"),
        task("a.md", 2, " ", "a1 sub", 1),
        task("b.md", 2, "x", "b1"),
        task("a.md", 6, "x", "a3"),
    ];
    const order = ["a.md", "b.md"];

    it("counts every task and lists the open ones, notes in Base order, lines in note order", () => {
        const view = buildTaskView(items, order, { show: "open", group: true });
        expect([view.open, view.done]).toEqual([3, 2]);
        expect(view.groups.map((g) => [g.path, g.tasks.map((t) => t.text)])).toEqual([
            ["a.md", ["a1", "a1 sub"]],
            ["b.md", ["b2"]],
        ]);
    });

    it("done, all, and flat", () => {
        expect(buildTaskView(items, order, { show: "done", group: true }).groups.flatMap((g) => g.tasks.map((t) => t.text))).toEqual(["a3", "b1"]);
        const flat = buildTaskView(items, order, { show: "all", group: false });
        expect(flat.groups).toHaveLength(1);
        expect(flat.groups[0].tasks.map((t) => t.text)).toEqual(["a1", "a1 sub", "a3", "b1", "b2"]);
    });

    it("a note the Base (or a transform) left out contributes nothing to the list", () => {
        const view = buildTaskView(items, ["b.md"], { show: "all", group: true });
        expect(view.groups.map((g) => g.path)).toEqual(["b.md"]);
    });

    it("caps what renders and says how many more", () => {
        const many = Array.from({ length: 250 }, (_, i) => task("a.md", i, " ", `t${i}`));
        const view = buildTaskView(many, ["a.md"], { show: "open", group: true });
        expect(view.groups[0].tasks).toHaveLength(200);
        expect(view.hidden).toBe(50);
    });

    it("an empty result is empty, not a broken group", () => {
        expect(buildTaskView([], order, { show: "open", group: false }).groups).toEqual([]);
    });
});
