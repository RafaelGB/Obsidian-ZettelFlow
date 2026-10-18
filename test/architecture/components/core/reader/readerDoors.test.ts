/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { DomNode } from "../../../../support/dashboardDom";
import { recordAnimations, reducedMotion, type AnimationRecord } from "../../../../support/motionDom";

const calls: { what: string; request?: any }[] = [];
jest.mock("architecture/components/core/reader/openReader", () => {
    const actual = jest.requireActual("architecture/components/core/reader/openReader") as Record<string, unknown>;
    return {
        ...actual,
        openReader: jest.fn(async (_app: unknown, request: any) => {
            calls.push({ what: "open", request: { ...request, connected: request?.from ? request.from.isConnected !== false && !request.from.detached : undefined } });
        }),
    };
});

import { flyOrigin } from "architecture/components/core/reader/openReader";
import { reviewDeps } from "architecture/components/core/review/ReviewModal";
import { ReadingPathModal, openSavedReading, readSelection } from "architecture/components/core/reader/readingChooser";

const SRC = join(__dirname, "..", "..", "..", "..", "..", "src");
const read = (path: string) => readFileSync(join(SRC, path), "utf8");

/** Every door into the Reader you can see carries its origin (#828, §XVI one continuous shot). */
describe("every door into the Reader carries its origin (#828)", () => {
    let rec: AnimationRecord;
    let motion: () => void;
    beforeEach(() => {
        calls.length = 0;
        rec = recordAnimations();
        motion = reducedMotion(false);
    });
    afterEach(() => {
        rec.stop();
        motion();
    });

    it("lets a card grow only as far as the main area holds it, so its ghost is never clipped (MF-4)", () => {
        const body = new DomNode();
        const area = body.createDiv({ cls: "workspace-split mod-root" }) as any;
        const card = body.createEl("button", { text: "Reading · Chapter 3 of 12" }) as any;
        const box = (left: number, top: number, width: number, height: number) => () => ({ left, top, width, height, right: left + width, bottom: top + height });
        area.getBoundingClientRect = box(0, 0, 1000, 700);
        card.getBoundingClientRect = box(50, 400, 900, 200);
        card.doc = { body, querySelector: (sel: string) => (sel === ".workspace-split.mod-root" ? area : null) };
        flyOrigin(card as unknown as HTMLElement);
        const ghost = body.find((el: any) => el.hasClass("zettelkasten-flow__reader-origin-ghost")) as any;
        expect(ghost).toBeDefined();
        // The flight's last frame scales the ghost by its growth: never past 0.9 of the area.
        const last = String(rec.animations.find((a) => a.target === ghost)!.keyframes.at(-1)!.transform);
        const scale = Number(/scale\(([\d.]+)/.exec(last)?.[1] ?? "1");
        expect(900 * scale).toBeLessThanOrEqual(900.5);
        expect(ghost.getAttribute("aria-hidden")).toBe("true");
        expect(ghost.getAttribute("inert")).toBe("");
    });

    it("opens Review's passage from its button before the review closes (FR-3)", () => {
        const close = jest.fn(() => calls.push({ what: "close" }));
        const button = new DomNode("button") as any;
        reviewDeps({} as never, close).openReader({ id: "h1", about: "Notes/a.md" } as never, button);
        expect(calls.map((c) => c.what)).toEqual(["open", "close"]);
        expect(calls[0].request).toMatchObject({ seed: "Notes/a.md", highlight: "h1", from: button, connected: true });
    });

    it("opens a saved reading and Explore's reading from what was clicked, with the same request as before", () => {
        const row = new DomNode("button") as any;
        void openSavedReading({} as never, { id: "r", seed: "a.md", name: "My path", paths: ["a.md", "b.md"], at: 1 } as never, row);
        expect(calls[0].request).toMatchObject({ seed: "a.md", kind: "selection", paths: ["a.md", "b.md"], name: "My path", from: row });
        calls.length = 0;
        const button = new DomNode("button") as any;
        readSelection({ metadataCache: { resolvedLinks: {} } } as never, ["a.md"], null, button);
        expect(calls[0].request).toMatchObject({ seed: "a.md", kind: "selection", from: button });
    });

    it("passes the clicked element at every door on screen, and opens before a modal closes", () => {
        const doors: [string, RegExp][] = [
            ["architecture/components/core/lab/LabRenderer.ts", /openReader\(this\.app, \{ seed: about, highlight: thought\.id, from: open \}\)/],
            ["architecture/components/core/lab/LabRenderer.ts", /open: \(from: HTMLElement\) => void openReader\(this\.app, \{ seed: about, highlight: thought\.id, from \}\)/],
            ["architecture/components/core/lab/CrystallizeModal.ts", /from: open \}\);\s*this\.close\(\);/],
            ["architecture/components/core/reader/readingChooser.ts", /void openReader\(this\.app, \{ seed: this\.seed, kind, chapter, \.\.\.\(origin \? \{ from: origin \} : \{\}\) \}\);\s*this\.close\(\);/],
            ["architecture/components/core/reader/readingChooser.ts", /void openSavedReading\(this\.app, entry, open\);\s*this\.close\(\);/],
            ["architecture/components/core/home/HomeModeRenderer.ts", /this\.openReading\(reading, event\.currentTarget as HTMLElement\)/],
            ["architecture/components/core/library/LibraryView.ts", /readFrom\(this\.app, note, undefined, read\)/],
            ["architecture/components/core/askGraph/AskGraphRenderer.ts", /readSelection\(this\.app, this\.matches\.map\(\(idea\) => idea\.path\), undefined, read\)/],
        ];
        for (const [path, pattern] of doors) expect({ path, door: pattern.test(read(path)) }).toEqual({ path, door: true });
    });

    it("leaves a door with nothing on screen — a menu, a command — to the Reader's own entrance (FR-4)", () => {
        const menus = read("starters/zcomponents/ReaderComponent.ts");
        expect(menus).not.toMatch(/readFrom\([^)]*,[^)]*,[^)]*,/);
        expect(read("starters/zcomponents/LibraryComponent.ts")).not.toContain("from:");
    });

    it("flies a way from the chooser when it is double-clicked: the card is still on screen (review)", () => {
        const options = [
            { kind: "around", path: { chapters: [{ path: "a.md" }] } },
            { kind: "argument", path: { chapters: [{ path: "b.md" }, { path: "c.md" }] } },
        ];
        const modal = new ReadingPathModal({} as never, "a.md", options as never, null);
        const content = new DomNode();
        (modal as unknown as { contentEl: DomNode }).contentEl = content;
        (modal as unknown as { close: () => void }).close = () => calls.push({ what: "close" });
        modal.open();
        const way = () => content.byClass("reader-chooser-card")[1] as any;
        // A double-click: two clicks, then the double-click, each on the card under the pointer.
        way().click();
        way().click();
        const card = way();
        card.fire("dblclick", { target: card });
        expect(calls.map((c) => c.what)).toEqual(["open", "close"]);
        expect(calls[0].request).toMatchObject({ seed: "a.md", kind: "argument", chapter: 0, from: card, connected: true });
    });
});
