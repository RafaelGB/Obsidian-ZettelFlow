import { describe, it, expect, jest } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { makeActivatable } from "architecture/components/core/a11y";

// A minimal element double (jest env is "node" — no DOM). Records attributes + wired listeners.
function fakeEl() {
    const listeners: Record<string, ((e: unknown) => void)[]> = {};
    return {
        attrs: {} as Record<string, string>,
        tabIndex: undefined as number | undefined,
        setAttribute(key: string, value: string) {
            this.attrs[key] = value;
        },
        addEventListener(type: string, handler: (e: unknown) => void) {
            (listeners[type] ??= []).push(handler);
        },
        fire(type: string, event: unknown) {
            (listeners[type] ?? []).forEach((h) => h(event));
        },
    };
}

describe("makeActivatable (#319 S3)", () => {
    it("makes an element focusable, role-bearing, and click-activated", () => {
        const el = fakeEl();
        const onActivate = jest.fn();
        makeActivatable(el as unknown as HTMLElement, onActivate);
        expect(el.attrs.role).toBe("link");
        expect(el.tabIndex).toBe(0);
        el.fire("click", {});
        expect(onActivate).toHaveBeenCalledTimes(1);
    });

    it("activates on Enter and Space (and prevents default), but not other keys", () => {
        const el = fakeEl();
        const onActivate = jest.fn();
        makeActivatable(el as unknown as HTMLElement, onActivate, "button");
        expect(el.attrs.role).toBe("button");

        const enter = { key: "Enter", preventDefault: jest.fn() };
        el.fire("keydown", enter);
        expect(onActivate).toHaveBeenCalledTimes(1);
        expect(enter.preventDefault).toHaveBeenCalled();

        el.fire("keydown", { key: " ", preventDefault: jest.fn() });
        expect(onActivate).toHaveBeenCalledTimes(2);

        el.fire("keydown", { key: "a", preventDefault: jest.fn() });
        expect(onActivate).toHaveBeenCalledTimes(2); // unchanged
    });
});

// ── Structural guardrails so the a11y/mobile wiring can't silently regress (#319 S5) ──────────────
const ROOT = join(__dirname, "..", "..", "..", "..");
const MODE_HOST = readFileSync(join(ROOT, "src", "architecture", "components", "core", "surface", "ModeHostView.ts"), "utf8");
const GRAPH = readFileSync(join(ROOT, "src", "architecture", "components", "core", "graph3d", "Graph3DRenderer.ts"), "utf8");

describe("surface tablist keyboard semantics (#319 S3)", () => {
    it("declares a proper tablist/tab/tabpanel with roving tabindex and arrow-key navigation", () => {
        expect(MODE_HOST).toContain('"role", "tablist"');
        expect(MODE_HOST).toContain('"role", "tab"');
        expect(MODE_HOST).toContain('"role", "tabpanel"');
        expect(MODE_HOST).toContain("aria-controls");
        expect(MODE_HOST).toContain("aria-labelledby");
        expect(MODE_HOST).toContain("onTabKeydown");
        expect(MODE_HOST).toMatch(/ArrowRight|ArrowLeft/);
    });
});

describe("graph mobile fallback + reduced motion (#319 S2/S4)", () => {
    it("renders a navigable list fallback (buttons), not a dead-end message", () => {
        expect(GRAPH).toContain("graph3d-fallback-list");
        expect(GRAPH).toMatch(/graph3d-fallback-row/);
        expect(GRAPH).toContain("openLinkText"); // rows navigate
    });

    it("honors prefers-reduced-motion in the graph animation", () => {
        expect(GRAPH).toContain("prefersReducedMotion");
        expect(GRAPH).toContain("prefers-reduced-motion");
    });
});
