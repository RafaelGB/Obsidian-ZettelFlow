import { describe, it, expect, jest } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { DomNode } from "../../../../support/dashboardDom";
import { renderComposer } from "architecture/components/core/family/ThoughtComposer";
import { eyebrow, keyHints } from "architecture/components/core/family/family";

/**
 * **The composer** (#702, epic #701): one shape for writing, shared by Home and Think. It keeps a
 * thought when you say so — Ctrl/Cmd+Enter or *Keep it* — and never anything else.
 */
function mount(keep: (text: string) => Promise<boolean>) {
    const host = new DomNode();
    const handlers: { el: DomNode; type: string; fn: (event: any) => void }[] = [];
    const register = (el: any, type: any, fn: any) => {
        handlers.push({ el, type, fn });
    };
    const kept: string[] = [];
    const composer = renderComposer(host as never, {
        placeholder: "What's on your mind?",
        hint: "Kept in Think.",
        register,
        keep,
        onKept: (text) => kept.push(text),
    });
    const area = composer.area as unknown as DomNode;
    const fire = (el: DomNode, type: string, event: any = {}) =>
        handlers.filter((h) => h.el === el && h.type === type).forEach((h) => h.fn(event));
    const button = host.oneByClass("family-composer-keep");
    const hint = host.oneByClass("family-composer-hint");
    return { host, area, fire, button, hint, kept };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

describe("the family composer (#702)", () => {
    it("keeps the thought on Ctrl+Enter, clears the box and says where it went", async () => {
        const keep = jest.fn(async (_text: string) => true);
        const m = mount(keep);
        m.area.value = "  maybe consensus is cheap  ";
        const event = { key: "Enter", ctrlKey: true, preventDefault: jest.fn() };
        m.fire(m.area, "keydown", event);
        await settle();
        expect(keep).toHaveBeenCalledWith("maybe consensus is cheap");
        expect(event.preventDefault).toHaveBeenCalled();
        expect(m.area.value).toBe("");
        expect(m.hint.textContent).toBe("Kept in Think.");
        expect(m.kept).toEqual(["maybe consensus is cheap"]);
    });

    it("keeps it from the button too, and with Cmd on a Mac", async () => {
        const keep = jest.fn(async (_text: string) => true);
        const m = mount(keep);
        m.area.value = "one";
        m.fire(m.button, "click");
        await settle();
        m.area.value = "two";
        m.fire(m.area, "keydown", { key: "Enter", metaKey: true, preventDefault: () => undefined });
        await settle();
        expect(keep.mock.calls.map((call) => call[0])).toEqual(["one", "two"]);
    });

    it("keeps nothing for an empty box, and a plain Enter is a new line", async () => {
        const keep = jest.fn(async (_text: string) => true);
        const m = mount(keep);
        m.area.value = "   ";
        m.fire(m.button, "click");
        m.area.value = "a line";
        m.fire(m.area, "keydown", { key: "Enter", preventDefault: () => undefined });
        await settle();
        expect(keep).not.toHaveBeenCalled();
        expect(m.area.value).toBe("a line");
    });

    it("says why in place when there is nowhere to keep it, and keeps the text", async () => {
        const m = mount(async () => false);
        m.area.value = "not lost";
        m.fire(m.button, "click");
        await settle();
        expect(m.area.value).toBe("not lost");
        expect(m.hint.textContent).toBe("Choose a folder for Think in settings first, then what you write here is kept.");
        expect(m.kept).toEqual([]);
    });

    it("writes a thought through Think's store by default — never a note", () => {
        const source = readFileSync(
            join(__dirname, "..", "..", "..", "..", "..", "src", "architecture", "components", "core", "family", "ThoughtComposer.ts"),
            "utf8"
        );
        expect(source).toContain("store.write(text)");
        expect(source).not.toMatch(/FileService|FrontmatterService|vault\.create|Modal/);
    });
});

describe("the family's quiet shapes (#702)", () => {
    it("draws an eyebrow and a row of keyboard hints", () => {
        const host = new DomNode();
        eyebrow(host as never, "rotate-ccw", "Where you left off");
        keyHints(host as never, [{ keys: ["Ctrl", "Enter"], label: "keep it" }]);
        expect(host.oneByClass("family-eyebrow").textContent).toContain("Where you left off");
        expect(host.byClass("family-kbd").map((k) => k.textContent)).toEqual(["Ctrl", "Enter"]);
    });
});
