import { describe, it, expect, jest } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { drawGlimpse, glimpseOf, GLIMPSE_MAX_POINTS } from "architecture/components/core/home/glimpse";

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

function data(count: number, communities = 3) {
    return {
        nodes: Array.from({ length: count }, (_, i) => ({
            id: `n/${i}.md`,
            name: String(i),
            kind: "note",
            community: i % communities,
            created: i < 3 ? NOW - DAY : NOW - 90 * DAY,
        })),
        links: [],
    } as never;
}

function fakeCtx() {
    const calls: string[] = [];
    const ctx = {
        globalCompositeOperation: "",
        fillStyle: "" as unknown,
        strokeStyle: "" as unknown,
        lineWidth: 1,
        clearRect: () => calls.push("clear"),
        beginPath: () => undefined,
        arc: (_x: number, _y: number, r: number) => {
            if (!(r >= 0)) throw new Error("negative radius");
            calls.push("arc");
        },
        fill: () => undefined,
        stroke: () => undefined,
        createRadialGradient: (_a: number, _b: number, r0: number, _c: number, _d: number, r1: number) => {
            if (r0 < 0 || r1 < 0) throw new Error("negative radius");
            return { addColorStop: () => undefined };
        },
    };
    return { ctx, calls };
}

const colours = { dark: true, slot: () => [0.5, 0.5, 0.5, 1] as [number, number, number, number] };

/** **The vault glimpse** (#705): Home's small picture of the vault, from the graph engine's data. */
describe("the vault glimpse (#705)", () => {
    it("places every note inside the glimpse, the same way every time", () => {
        const a = glimpseOf(data(200), NOW);
        const b = glimpseOf(data(200), NOW);
        expect(a).toEqual(b);
        for (const point of a.points) {
            expect(point.x).toBeGreaterThanOrEqual(0);
            expect(point.x).toBeLessThanOrEqual(1);
            expect(point.y).toBeGreaterThanOrEqual(0);
            expect(point.y).toBeLessThanOrEqual(1);
        }
        expect(a.regions).toHaveLength(3);
    });

    it("keeps this week's notes, pulsing, and samples the rest to a ceiling", () => {
        const big = glimpseOf(data(5_000), NOW);
        expect(big.points.length).toBeLessThanOrEqual(GLIMPSE_MAX_POINTS);
        expect(big.fresh).toBe(3);
        expect(big.points.filter((point) => point.fresh)).toHaveLength(3);
    });

    it("draws a frame, even on a canvas that is momentarily zero-sized", () => {
        const glimpse = glimpseOf(data(50), NOW);
        const { ctx, calls } = fakeCtx();
        drawGlimpse(ctx, glimpse, colours, 260, 150, 1.5);
        expect(calls.filter((call) => call === "arc").length).toBeGreaterThan(50);
        expect(() => drawGlimpse(fakeCtx().ctx, glimpse, colours, 0, 0, 0)).not.toThrow();
    });
});

describe("the glimpse draws only while it is seen (#705)", () => {
    const SOURCE = readFileSync(
        join(__dirname, "..", "..", "..", "..", "..", "src", "architecture", "components", "core", "home", "HomeGlimpse.ts"),
        "utf8"
    );

    it("asks for a frame only when visible, in front, and moving", () => {
        expect(SOURCE).toMatch(/if \(this\.frame \|\| !this\.visible \|\| win\.document\.hidden \|\| this\.reducedMotion\(\)\) return;/);
        expect(SOURCE).toContain("IntersectionObserver");
        expect(SOURCE).toContain("cancelAnimationFrame");
    });

    it("opens Explore and writes nothing", () => {
        expect(SOURCE).toContain('activateSurface(this.app, "zettelflow-explore", "explore")');
        expect(SOURCE).not.toMatch(/FileService|FrontmatterService|vault\.(create|modify)/);
    });

    it("schedules no frame while it is off screen", async () => {
        const { DomNode } = await import("../../../../support/dashboardDom");
        const { HomeGlimpse } = await import("architecture/components/core/home/HomeGlimpse");
        let seen: ((entries: { isIntersecting: boolean }[]) => void) | undefined;
        const raf = jest.fn(() => 1);
        const win = {
            IntersectionObserver: class {
                constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
                    seen = cb;
                }
                observe() {}
                disconnect() {}
            },
            requestAnimationFrame: raf,
            cancelAnimationFrame: () => undefined,
            matchMedia: () => ({ matches: false }),
            getComputedStyle: () => ({ getPropertyValue: () => "" }),
            devicePixelRatio: 1,
            performance: { now: () => 0 },
            document: { hidden: false, addEventListener: () => undefined, removeEventListener: () => undefined },
        };
        const host = new DomNode() as unknown as HTMLElement & { win?: unknown };
        host.win = win;
        const model = { revision: () => 7, all: () => [], size: () => 0, get: () => undefined } as never;
        const glimpse = new HomeGlimpse(host, { workspace: { on: () => ({}) } } as never, model);
        jest.spyOn(glimpse as never, "registerDomEvent" as never).mockImplementation((() => undefined) as never);
        glimpse.load();
        expect(raf).not.toHaveBeenCalled();
        seen?.([{ isIntersecting: true }]);
        expect(raf).toHaveBeenCalledTimes(1);
        glimpse.unload();
    });
});
