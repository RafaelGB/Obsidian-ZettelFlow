import { describe, it, expect, jest } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import type { App } from "obsidian";
import { hoverPreview, hoverPreviewPayload, HOVER_PREVIEW_SOURCE } from "architecture/components/core/a11y";

// A minimal element double (jest env is "node" — no DOM). Records + fires listeners.
function fakeEl() {
    const listeners: Record<string, ((e: unknown) => void)[]> = {};
    return {
        addEventListener(type: string, handler: (e: unknown) => void) {
            (listeners[type] ??= []).push(handler);
        },
        fire(type: string, event: unknown) {
            (listeners[type] ?? []).forEach((h) => h(event));
        },
        // Obsidian's hover handler calls this on the target; HTML elements have it.
        isShown: () => true,
    };
}

describe("hoverPreview (#594)", () => {
    it("builds the hover-link payload the Page preview plugin expects", () => {
        const el = {} as HTMLElement;
        const event = {} as MouseEvent;
        const parent = { id: "parent" };
        expect(hoverPreviewPayload(event, el, "Notes/Idea.md", parent)).toEqual({
            event,
            source: HOVER_PREVIEW_SOURCE,
            hoverParent: parent,
            targetEl: el,
            linktext: "Notes/Idea.md",
            sourcePath: "",
        });
    });

    it("triggers hover-link on mouseover, under the ZettelFlow source", () => {
        const el = fakeEl();
        const trigger = jest.fn();
        const app = { workspace: { trigger } } as unknown as App;
        hoverPreview(app, el as unknown as HTMLElement, "Notes/Idea.md", { view: true });

        el.fire("mouseover", { kind: "evt" });

        expect(trigger).toHaveBeenCalledTimes(1);
        expect(trigger).toHaveBeenCalledWith(
            "hover-link",
            expect.objectContaining({
                source: HOVER_PREVIEW_SOURCE,
                linktext: "Notes/Idea.md",
                targetEl: el,
                sourcePath: "",
            })
        );
    });

    it("anchors an SVG element on an HTML box, because Obsidian calls isShown() on the target (#639)", () => {
        const svgNode = { ...fakeEl(), isShown: undefined };
        const box = fakeEl();
        const trigger = jest.fn();
        const app = { workspace: { trigger } } as unknown as App;
        hoverPreview(app, svgNode as unknown as SVGElement, "Notes/Idea.md", {}, box as unknown as HTMLElement);
        svgNode.fire("mouseover", {});
        expect(trigger).toHaveBeenCalledWith("hover-link", expect.objectContaining({ targetEl: box }));
    });

    it("never hands Obsidian an SVG target with no box to anchor on", () => {
        const svgNode = { ...fakeEl(), isShown: undefined };
        const trigger = jest.fn();
        hoverPreview({ workspace: { trigger } } as unknown as App, svgNode as unknown as SVGElement, "a.md", {});
        svgNode.fire("mouseover", {});
        expect(trigger).not.toHaveBeenCalled();
    });

    it("is wired onto Cultivate's note names — target and connect/challenge candidates (#594)", () => {
        const renderer = readFileSync(
            join(
                __dirname,
                "..", "..", "..", "..",
                "src", "architecture", "components", "core", "cultivate", "CultivateModeRenderer.ts"
            ),
            "utf8"
        );
        expect(renderer).toContain("hoverPreview(this.app, name, session.path");
        expect(renderer).toMatch(/hoverPreview\(this\.app, link, candidate/);
        expect(renderer).toMatch(/hoverPreview\(this\.app, link, path/);
    });

    it("reads and triggers only — it never writes to the vault", () => {
        // The affordance shows a read-only popover; a write would be a different feature entirely.
        const src = readFileSync(
            join(__dirname, "..", "..", "..", "..", "src", "architecture", "components", "core", "a11y.ts"),
            "utf8"
        );
        expect(src).not.toMatch(/FileService|FrontmatterService|processFrontMatter|vault\.(create|modify)/);
    });
});
