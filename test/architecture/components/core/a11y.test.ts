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
const MODE_HEADER = readFileSync(
    join(ROOT, "src", "architecture", "components", "core", "surface", "ModeHeader.ts"),
    "utf8"
);

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

describe("a mode header's overflow is operable without a mouse (#577)", () => {
    it("is a real button, so it is in the tab order at all", () => {
        // A `clickable-icon` div would look identical and be unreachable. Obsidian's own class on
        // an actual `<button>` gets the theme and the semantics both.
        expect(MODE_HEADER).toContain('createEl("button"');
        expect(MODE_HEADER).toContain('"clickable-icon"');
    });

    it("says what it is, and that it opens a menu", () => {
        expect(MODE_HEADER).toContain('"aria-label": t("mode_header_more")');
        expect(MODE_HEADER).toContain('"aria-haspopup": "menu"');
    });

    it("opens where the control is, not where the pointer is", () => {
        // `showAtMouseEvent` has no position when the button was activated with Enter, and the
        // menu would appear in the last place the mouse happened to be.
        expect(MODE_HEADER).toContain("menu.showAtPosition(");
        expect(MODE_HEADER).not.toContain("showAtMouseEvent");
    });

    it("labels every item by what it does (#496)", () => {
        expect(MODE_HEADER).toContain("item.setTitle(action.label)");
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

/**
 * Motion stops when asked (#565, generalised in #580).
 *
 * There was no generic guardrail for this — the only `prefers-reduced-motion` assertion in the repo
 * read the 3D graph's JavaScript. This one reads the stylesheets: every animation these features add
 * has its selector inside a reduced-motion block in the same file. It is a **table** rather than one
 * hard-coded partial, because the second feature to need it arrived within the week.
 */
describe("animations honour reduced motion (#565, #580)", () => {
    const STYLES = join(__dirname, "..", "..", "..", "..", "src", "styles", "components");
    const ANIMATED = ["claims.scss", "cultivate.scss", "collision.scss"];

    it("scans the partials it says it scans", () => {
        for (const name of ANIMATED) {
            const source = readFileSync(join(STYLES, name), "utf8");
            expect({ name, animates: /animation:\s*zf-/.test(source) }).toEqual({ name, animates: true });
        }
    });

    it("turns every one of them off under reduced motion", () => {
        for (const name of ANIMATED) {
            const source = readFileSync(join(STYLES, name), "utf8");
            const animated = [...source.matchAll(/^\.([\w-]+)\s*\{[^}]*animation:\s*zf-/gm)].map((match) => match[1]);
            expect({ name, count: animated.length > 0 }).toEqual({ name, count: true });
            const reduced = source.slice(source.indexOf("@media (prefers-reduced-motion: reduce)"));
            expect({ name, off: reduced.includes("animation: none") }).toEqual({ name, off: true });
            for (const selector of animated) {
                expect({ name, selector, covered: reduced.includes(selector) }).toEqual({
                    name,
                    selector,
                    covered: true,
                });
            }
        }
    });

    it("moves nothing from JavaScript", () => {
        for (const rel of [
            ["claims", "ClaimReturnModal.ts"],
            ["cultivate", "CultivateModeRenderer.ts"],
        ]) {
            const source = readFileSync(
                join(__dirname, "..", "..", "..", "..", "src", "architecture", "components", "core", rel[0], rel[1]),
                "utf8"
            );
            expect({ file: rel[1], inline: source.includes("el.style.") }).toEqual({ file: rel[1], inline: false });
            expect({ file: rel[1], timer: source.includes("requestAnimationFrame") }).toEqual({
                file: rel[1],
                timer: false,
            });
        }
    });
});
