/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { log } from "architecture";
import { DomNode, flush, installBrowserGlobals } from "../../../../support/dashboardDom";
import { recordAnimations, type AnimationRecord } from "../../../../support/motionDom";
import { InkReadingController, type InkReadingAi } from "architecture/components/core/reader/readerInkReading";
import { openProposal } from "architecture/components/core/reader/readerProposal";
import { inkImage } from "architecture/components/core/reader/readerInkImage";
import { MOTION } from "architecture/components/core/reader/readerMotion";
import { AiVisionError } from "architecture/ai/openaiCompatibleLogic";
import { JudgementLog } from "architecture/plugin/judgement/JudgementLog";
import { MoveLog } from "architecture/plugin/thinking/MoveLog";
import { currentWriteBatch } from "architecture/plugin/writes/recordVaultWrite";
import { renderInkSvg, type InkDrawing } from "application/reader/ink/inkSvg";
import type { Thought } from "application/thinking/thought";

const DRAWING: InkDrawing = {
    strokes: [{ colour: "pencil", pointerType: "pen", points: [0, 1, 2, 3, 4].map((x, i) => ({ x, y: i % 2, p: 0.5, tilt: Math.PI / 2, t: i * 8 })) }],
};
const SVG = renderInkSvg(DRAWING);
const IMAGE = { mime: "image/png" as const, base64: "SU1BR0VEQVRB" };
const TITLES = [
    { path: "Ideas/Ship early, learn from reality.md", title: "Ship early, learn from reality" },
    { path: "Ideas/Shipping logs.md", title: "Shipping logs" },
];
const READING = (over: Record<string, unknown> = {}) => JSON.stringify({ reading: "contradicts 'ship early'?", kind: "tension", names: "ship early", ...over });

function inkThought(id = "ink1", over: Partial<Thought> = {}): Thought {
    return { id, at: 1791, text: "", links: [], about: "Books/A book.epub", quote: { exact: "early", prefix: "ship ", suffix: " and" }, ink: { drawing: `1791-${id}.svg`, side: "text", x: 0, line: 0, em: 16 }, ...over };
}

interface Harness {
    controller: InkReadingController;
    root: DomNode;
    margin: DomNode;
    chip: DomNode;
    store: { folder: () => string; drawingOf: jest.Mock<any>; save: jest.Mock<any>; saveDrawing: jest.Mock<any>; writeInk: jest.Mock<any> };
    see: jest.Mock<any>;
    gate: { state: "disabled" | "unconfigured" | "ready" };
    app: any;
    batches: (string | undefined)[];
    judgements: { settings: any };
    moves: { settings: any };
    breathing: jest.Mock<any>;
    saved: jest.Mock<any>;
    image: jest.Mock<any>;
    entry: DomNode;
}

function harness(options: { thought?: Thought; see?: (prompt: string) => Promise<string>; providerSees?: boolean } = {}): Harness {
    const root = new DomNode();
    root.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 800 });
    const margin = root.createDiv();
    const entry = margin.createDiv();
    entry.getBoundingClientRect = () => ({ left: 820, top: 300, width: 160, height: 60 });
    const batches: (string | undefined)[] = [];
    const store = {
        folder: () => "Lab",
        drawingOf: jest.fn(async () => SVG),
        save: jest.fn(async (_t: Thought) => {
            batches.push(currentWriteBatch());
        }),
        saveDrawing: jest.fn(async () => undefined),
        writeInk: jest.fn(async () => undefined),
    };
    const see = jest.fn(options.see ?? (async () => READING()));
    const gate = { state: "ready" as "disabled" | "unconfigured" | "ready" };
    const ai: InkReadingAi = {
        gate: () => gate.state,
        config: () => ({ enabled: true, endpoint: "https://ai.example/v1", apiKey: "k", model: "m", maxInputChars: 600 }),
        getProvider: () => ({ complete: jest.fn(async () => ""), ...(options.providerSees === false ? {} : { see }) }) as any,
    };
    const app = { setting: { open: jest.fn(), openTabById: jest.fn(() => ({ revealSection: jest.fn() })) } };
    const judgements = { settings: { judgements: { enabled: true, log: [] as any[] }, thoughtLabPath: "Lab" }, saveSettings: () => undefined };
    const moves = { settings: { moves: { log: [] as any[] }, thoughtLabPath: "Lab" }, saveSettings: () => undefined };
    JudgementLog.getInstance().init(judgements as any);
    MoveLog.getInstance().init(moves as any);
    const breathing = jest.fn();
    const saved = jest.fn();
    const image = jest.fn(() => IMAGE);
    const controller = new InkReadingController({
        app: app as never,
        store,
        host: () => root as never,
        passageOf: () => "Ship early, they said, and learn from reality.",
        saved,
        breathing,
        entryOf: () => entry as never,
        ai,
        titles: () => TITLES,
        image,
    });
    made.push(controller);
    const chip = controller.renderChip(margin as never, options.thought ?? inkThought(), (el, run) => el.addEventListener("click", run)) as unknown as DomNode;
    chip.getBoundingClientRect = () => ({ left: 820, top: 340, width: 160, height: 20 });
    return { controller, root, margin, chip, store, see, gate, app, batches, judgements, moves, breathing, saved, image, entry };
}

const button = (scope: DomNode, text: string) => scope.find((el) => el.tag === "button" && el.textContent === text) as DomNode | undefined;
const card = (h: Harness) => h.root.byClass("reader-proposal").find((el) => el.isConnected);
const chipText = (h: Harness) => h.chip.oneByClass("reader-ink-chip-label").textContent;

let rec: AnimationRecord;
let warn: ReturnType<typeof jest.spyOn>;
const made: InkReadingController[] = [];
beforeEach(() => {
    installBrowserGlobals();
    (globalThis as any).matchMedia = () => ({ matches: false });
    rec = recordAnimations();
    warn = jest.spyOn(log, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
    for (const controller of made.splice(0)) controller.dispose();
    rec.stop();
    warn.mockRestore();
    delete (globalThis as any).matchMedia;
});

/** Press *Read as text* and let the answer come back. */
async function press(h: Harness): Promise<void> {
    button(h.chip, "Read as text")!.click();
    await flush();
}

/** Decide on the open card, and let it play out. */
async function decide(h: Harness, label: string): Promise<void> {
    button(card(h)!, label)!.click();
    rec.finishAll();
    await flush();
}

describe("the door and the gate (#748 FR-1, FR-2, AC-1, AC-9)", () => {
    it("shows the chip under an ink note: kept as you wrote it, with Read as text", () => {
        const h = harness();
        expect(chipText(h)).toBe("Ink · kept as you wrote it");
        expect(button(h.chip, "Read as text")).toBeDefined();
    });

    it("with AI off or not set up, sends nothing, says so and opens Settings › AI", async () => {
        for (const state of ["disabled", "unconfigured"] as const) {
            const h = harness();
            h.gate.state = state;
            await press(h);
            expect(h.see).not.toHaveBeenCalled();
            expect(h.image).not.toHaveBeenCalled();
            expect(chipText(h)).toBe("Reading handwriting uses your AI provider");
            expect(h.app.setting.open).toHaveBeenCalledTimes(1);
            const tab = h.app.setting.openTabById.mock.results[0].value;
            expect(tab.revealSection).toHaveBeenCalledWith("ai");
        }
    });

    it("with AI ready, one press sends exactly one request: the image and the passage", async () => {
        const h = harness();
        await press(h);
        expect(h.see).toHaveBeenCalledTimes(1);
        const [prompt, image] = h.see.mock.calls[0] as [string, typeof IMAGE];
        expect(image).toEqual(IMAGE);
        expect(prompt).toContain("<note-content>\nShip early, they said, and learn from reality.\n</note-content>");
        // Nothing of the vault but the passage: no title, no path.
        expect(prompt).not.toContain("Ship early, learn from reality");
        expect(prompt).not.toContain("Books/");
    });

    it("sends nothing on a second press while it reads", async () => {
        let answer!: (raw: string) => void;
        const h = harness({ see: () => new Promise((resolve) => (answer = resolve)) });
        await press(h);
        expect(chipText(h)).toBe("Reading…");
        h.controller.read(inkThought());
        await flush();
        expect(h.see).toHaveBeenCalledTimes(1);
        answer(READING());
        await flush();
    });

    it("sends nothing on another press while its proposal is up (the lasso can press again)", async () => {
        const h = harness();
        await press(h);
        expect(card(h)).toBeDefined();
        h.controller.readEach([{ thought: inkThought() }]);
        await flush();
        expect(h.see).toHaveBeenCalledTimes(1);
        expect(h.root.byClass("reader-proposal").filter((el) => el.isConnected)).toHaveLength(1);
    });

    it("from the lasso with AI off, says it and opens Settings once, not once per note", async () => {
        const h = harness();
        h.gate.state = "disabled";
        h.controller.readEach([{ thought: inkThought("ink1") }, { thought: inkThought("ink2") }, { thought: inkThought("ink3") }]);
        await flush();
        expect(h.app.setting.open).toHaveBeenCalledTimes(1);
        expect(h.see).not.toHaveBeenCalled();
    });

    it("sends nothing by itself: rendering, re-rendering and waiting make no request", async () => {
        const h = harness();
        h.controller.renderChip(h.margin as never, inkThought(), () => undefined);
        h.controller.renderChip(h.margin as never, inkThought("ink2"), () => undefined);
        await flush();
        expect(h.see).not.toHaveBeenCalled();
        expect(h.store.drawingOf).not.toHaveBeenCalled();
    });

    it("is reached only from a press: the chip's button and the lasso's (a scan of the source)", () => {
        const SRC = join(__dirname, "..", "..", "..", "..", "..", "src");
        const files: string[] = [];
        const walk = (dir: string) => {
            for (const entry of readdirSync(dir)) {
                const full = join(dir, entry);
                if (statSync(full).isDirectory()) walk(full);
                else if (entry.endsWith(".ts")) files.push(full);
            }
        };
        walk(SRC);
        const callers: string[] = [];
        for (const file of files) {
            const code = readFileSync(file, "utf8");
            const rel = file.slice(SRC.length + 1).replace(/\\/g, "/");
            for (const match of code.matchAll(/(reading|this)\.read(Each)?\(/g)) {
                const line = code.slice(0, match.index).split("\n").length;
                if (rel.endsWith("readerInkReading.ts") || code.includes("InkReadingController")) callers.push(`${rel}:${line}`);
            }
        }
        // The chip's click and readEach (inside the controller), and the lasso's action in the Reader
        // that calls readEach — and nothing else.
        expect(callers.map((c) => c.replace(/:\d+$/, "")).sort()).toEqual([
            "architecture/components/core/reader/readerInk.ts",
            "architecture/components/core/reader/readerInkReading.ts",
            "architecture/components/core/reader/readerInkReading.ts",
        ]);
    });
});

describe("while it reads, and when it fails (#748 FR-11, AC-3)", () => {
    it("breathes Reading… with Cancel, and stops the moment the answer arrives", async () => {
        let answer!: (raw: string) => void;
        const h = harness({ see: () => new Promise((resolve) => (answer = resolve)) });
        await press(h);
        expect(h.chip.hasClass("zettelkasten-flow__reader-ink-chip--reading")).toBe(true);
        expect(button(h.chip, "Cancel")).toBeDefined();
        expect(h.breathing).toHaveBeenLastCalledWith(expect.objectContaining({ id: "ink1" }), true);
        answer(READING());
        await flush();
        expect(h.chip.hasClass("zettelkasten-flow__reader-ink-chip--reading")).toBe(false);
        expect(h.breathing).toHaveBeenLastCalledWith(expect.objectContaining({ id: "ink1" }), false);
    });

    const failures: [string, () => Promise<string>, string][] = [
        ["a provider error", async () => Promise.reject(new AiVisionError("failed", 500)), "Could not read this ink. Nothing was written."],
        ["a model that rejects images", async () => Promise.reject(new AiVisionError("no-image", 415)), "Your model did not read the image — choose one that reads images in Settings › AI."],
        ["a time-out", async () => Promise.reject(new Error("AI request timed out after 30000ms")), "Could not read this ink. Nothing was written."],
        ["an empty answer", async () => "  ", "Could not read this ink. Nothing was written."],
    ];
    for (const [name, see, message] of failures) {
        it(`ends ${name} in its message, writes nothing, and logs without content`, async () => {
            const h = harness({ see });
            await press(h);
            expect(chipText(h)).toBe(message);
            expect(card(h)).toBeUndefined();
            expect(h.store.save).not.toHaveBeenCalled();
            expect(h.store.saveDrawing).not.toHaveBeenCalled();
            const logged = JSON.stringify(warn.mock.calls);
            expect(logged).toMatch(/ink reading failed/);
            expect(logged).not.toContain(IMAGE.base64);
            expect(logged).not.toContain("Ship early");
        });
    }

    it("says a provider without image input is a model that does not read images", async () => {
        const h = harness({ providerSees: false });
        await press(h);
        expect(chipText(h)).toBe("Your model did not read the image — choose one that reads images in Settings › AI.");
    });

    it("on Cancel, stops waiting: the answer that comes later is dropped and nothing is written", async () => {
        let answer!: (raw: string) => void;
        const h = harness({ see: () => new Promise((resolve) => (answer = resolve)) });
        await press(h);
        button(h.chip, "Cancel")!.click();
        expect(chipText(h)).toBe("Could not read this ink. Nothing was written.");
        answer(READING());
        await flush();
        expect(card(h)).toBeUndefined();
        expect(h.store.save).not.toHaveBeenCalled();
        expect(JSON.stringify(warn.mock.calls)).toContain("cancelled");
    });
});

describe("the reading is a proposal (#748 FR-5 – FR-7, FR-9, AC-4, AC-7)", () => {
    it("opens a card from the chip: Reads as, Accept, Edit, Reject, and nothing written yet", async () => {
        const h = harness();
        await press(h);
        const c = card(h)!;
        expect(c.getAttribute("role")).toBe("dialog");
        expect(c.oneByClass("reader-proposal-intro").textContent).toBe("Reads as: “contradicts 'ship early'?”");
        for (const label of ["Accept", "Edit", "Reject"]) expect(button(c, label)).toBeDefined();
        expect(c.oneByClass("reader-proposal-hint").textContent).toBe("Nothing is written until you accept. Your verdict is recorded either way.");
        expect(h.store.save).not.toHaveBeenCalled();
    });

    it("Accept writes the reading as the thought's text, in its own batch, and never the drawing", async () => {
        const h = harness({ see: async () => READING({ kind: "plain" }) });
        await press(h);
        await decide(h, "Accept");
        expect(h.store.save).toHaveBeenCalledTimes(1);
        const saved = (h.store.save.mock.calls[0] as [Thought])[0];
        expect(saved.text).toBe("contradicts 'ship early'?");
        expect(saved.ink).toEqual(inkThought().ink);
        expect(h.batches[0]).toEqual(expect.any(String));
        expect(h.store.saveDrawing).not.toHaveBeenCalled();
        expect(h.store.writeInk).not.toHaveBeenCalled();
        expect(chipText(h)).toBe("Read as: “contradicts 'ship early'?”");
        expect(button(h.chip, "Read as text")).toBeUndefined();
        expect(h.saved).toHaveBeenCalledWith(expect.objectContaining({ text: "contradicts 'ship early'?" }));
        expect(h.judgements.settings.judgements.log).toEqual([expect.objectContaining({ path: "Lab/1791-ink1.md", subject: "ink-reading", origin: "ai", verdict: "accepted" })]);
    });

    it("Edit lets you correct it first, writes your version and records it as modified", async () => {
        const h = harness({ see: async () => READING({ kind: "plain" }) });
        await press(h);
        const c = card(h)!;
        button(c, "Edit")!.click();
        const field = c.oneByClass("reader-proposal-text");
        expect(field.value).toBe("contradicts 'ship early'?");
        field.value = "contradicts “ship early”";
        field.fire("input");
        await decide(h, "Save my edit");
        expect((h.store.save.mock.calls[0] as [Thought])[0].text).toBe("contradicts “ship early”");
        expect(h.judgements.settings.judgements.log[0]).toEqual(expect.objectContaining({ verdict: "modified" }));
    });

    it("Reject writes nothing to the thought, records the verdict, and offers Read as text again", async () => {
        const h = harness();
        await press(h);
        await decide(h, "Reject");
        expect(h.store.save).not.toHaveBeenCalled();
        expect(chipText(h)).toBe("Ink · kept as you wrote it");
        expect(button(h.chip, "Read as text")).toBeDefined();
        expect(h.judgements.settings.judgements.log).toEqual([expect.objectContaining({ subject: "ink-reading", verdict: "rejected" })]);
    });

    it("Esc dismisses the card: no verdict, nothing written, nothing recorded", async () => {
        const h = harness();
        await press(h);
        card(h)!.fire("keydown", { key: "Escape" });
        await flush();
        expect(card(h)).toBeUndefined();
        expect(h.store.save).not.toHaveBeenCalled();
        expect(h.judgements.settings.judgements.log).toEqual([]);
    });

    it("keeps a verdict given as its card leaves, even if the reader closes meanwhile (§XII)", async () => {
        const h = harness({ see: async () => READING({ kind: "plain" }) });
        await press(h);
        button(card(h)!, "Accept")!.click();
        h.controller.dispose();
        rec.finishAll();
        await flush();
        expect(h.store.save).toHaveBeenCalledTimes(1);
        expect(h.judgements.settings.judgements.log).toEqual([expect.objectContaining({ subject: "ink-reading", verdict: "accepted" })]);
    });

    it("lets the Reader's Esc dismiss the newest card, with no verdict", async () => {
        const h = harness();
        await press(h);
        expect(h.controller.hasCards()).toBe(true);
        h.controller.dismissNewest();
        await flush();
        expect(h.controller.hasCards()).toBe(false);
        expect(card(h)).toBeUndefined();
        expect(h.judgements.settings.judgements.log).toEqual([]);
    });

    it("keeps the record and the log free of the reading, the image and the model's output", async () => {
        const h = harness();
        await press(h);
        await decide(h, "Accept");
        await decide(h, "Accept");
        const record = JSON.stringify([h.judgements.settings, h.moves.settings, warn.mock.calls]);
        expect(record).not.toContain("contradicts");
        expect(record).not.toContain(IMAGE.base64);
        expect(record).not.toContain("ship early");
        expect(h.judgements.settings.judgements.log.map((j: any) => [j.subject, j.origin])).toEqual([
            ["ink-reading", "ai"],
            ["ink-move:tension", "ai"],
        ]);
    });
});

describe("then a move, only on a reading you confirmed (#748 FR-8, AC-5, AC-6)", () => {
    it("proposes a tension with the note it names, and accepting writes both subjects and a challenge", async () => {
        const h = harness();
        await press(h);
        await decide(h, "Accept");
        const move = card(h)!;
        expect(move.oneByClass("reader-proposal-intro").textContent).toBe("As a move: a tension between this passage and “Ship early, learn from reality”");
        expect(button(move, "Edit")).toBeUndefined();
        await decide(h, "Accept");
        const last = (h.store.save.mock.calls.at(-1) as [Thought])[0];
        expect(last.alsoAbout).toBe("Ideas/Ship early, learn from reality.md");
        expect(last.text).toBe("contradicts 'ship early'?");
        expect(h.moves.settings.moves.log).toEqual([expect.objectContaining({ primitive: "perturb", verb: "challenge", subject: "ink1" })]);
        expect(h.judgements.settings.judgements.log.at(-1)).toEqual(expect.objectContaining({ subject: "ink-move:tension", verdict: "accepted" }));
    });

    it("proposes keeping a question as a question, which sets its meaning", async () => {
        const h = harness({ see: async () => JSON.stringify({ reading: "why now?", kind: "question" }) });
        await press(h);
        await decide(h, "Accept");
        expect(card(h)!.oneByClass("reader-proposal-intro").textContent).toBe("As a move: keep it as a question");
        await decide(h, "Accept");
        expect((h.store.save.mock.calls.at(-1) as [Thought])[0].meaning).toBe("question");
        expect(h.moves.settings.moves.log).toEqual([]);
    });

    it("proposes no move when the named thing matches no note, or is too short to stand for one", async () => {
        for (const names of ["move fast and break things", "ship"]) {
            const h = harness({ see: async () => READING({ names }) });
            await press(h);
            await decide(h, "Accept");
            expect(card(h)).toBeUndefined();
        }
    });

    it("rejecting the move keeps the reading", async () => {
        const h = harness();
        await press(h);
        await decide(h, "Accept");
        await decide(h, "Reject");
        expect(h.store.save).toHaveBeenCalledTimes(1);
        expect(chipText(h)).toBe("Read as: “contradicts 'ship early'?”");
        expect(h.judgements.settings.judgements.log.at(-1)).toEqual(expect.objectContaining({ subject: "ink-move:tension", verdict: "rejected" }));
    });

    it("never proposes a move on a rejected reading", async () => {
        const h = harness();
        await press(h);
        await decide(h, "Reject");
        expect(card(h)).toBeUndefined();
    });
});

describe("the card's motion (#748 FR-15 – FR-20, AC-10)", () => {
    const opened = () => rec.animations.filter((a) => a.target.hasClass?.("zettelkasten-flow__reader-proposal"));

    it("grows out of the chip: 0.96 → 1 and a fade, 120 ms, its origin at the chip", async () => {
        const h = harness();
        await press(h);
        const [enter] = opened();
        expect(enter.keyframes).toEqual([
            { transform: "scale(0.96)", opacity: 0 },
            { transform: "scale(1)", opacity: 1 },
        ]);
        expect(enter.options.duration).toBe(MOTION.fast);
        // Under the chip, and its origin the chip's centre (820 + 80 − its left).
        const c = card(h)!;
        expect(c.cssProps["--zf-prop-y"]).toBe("364px");
        expect(c.cssProps["--zf-prop-origin"]).toMatch(/^\d+px 0px$/);
    });

    it("on Accept travels back into the chip, and the chip's words appear as it lands", async () => {
        const h = harness({ see: async () => READING({ kind: "plain" }) });
        await press(h);
        const c = card(h)!;
        c.getBoundingClientRect = () => ({ left: 820, top: 364, width: 320, height: 120 });
        button(c, "Accept")!.click();
        const flight = opened().at(-1)!;
        expect(flight.options.duration).toBe(MOTION.base);
        expect(flight.keyframes.at(-1)).toEqual({ transform: "translate(0px, -24px) scale(0.5, 0.167)", opacity: 0 });
        // Still in flight: nothing written, the chip still the ink's.
        await flush();
        expect(h.store.save).not.toHaveBeenCalled();
        rec.finishAll();
        await flush();
        expect(chipText(h)).toBe("Read as: “contradicts 'ship early'?”");
    });

    it("on Reject slides 8 px away and fades in 120 ms", async () => {
        const h = harness();
        await press(h);
        button(card(h)!, "Reject")!.click();
        const exit = opened().at(-1)!;
        expect(exit.keyframes).toEqual([
            { transform: "translate(0px, 0px)", opacity: 1 },
            { transform: "translate(8px, 0px)", opacity: 0 },
        ]);
        expect(exit.options.duration).toBe(MOTION.fast);
        rec.finishAll();
        await flush();
    });

    it("an accepted tension lands on the ink note's entry in the margin", async () => {
        const h = harness();
        await press(h);
        await decide(h, "Accept");
        const move = card(h)!;
        move.getBoundingClientRect = () => ({ left: 820, top: 364, width: 320, height: 80 });
        button(move, "Accept")!.click();
        const flight = opened().at(-1)!;
        // Onto the entry (820, 300, 160 × 60), not the chip.
        expect(flight.keyframes.at(-1)).toEqual({ transform: "translate(0px, -64px) scale(0.5, 0.75)", opacity: 0 });
        rec.finishAll();
        await flush();
    });

    it("grows from the note on the page when its chip is out of sight (the lasso's door), and stays on screen", async () => {
        const h = harness();
        h.chip.getBoundingClientRect = () => ({ left: 820, top: 2400, width: 160, height: 20 });
        void h.controller.read(inkThought(), { left: 300, top: 200, width: 60, height: 30 });
        await flush();
        const c = card(h)!;
        expect(c.cssProps["--zf-prop-x"]).toBe("300px");
        expect(c.cssProps["--zf-prop-y"]).toBe("234px");
        await decide(h, "Reject");
    });

    it("is instant under reduced motion: no animation at all", async () => {
        (globalThis as any).matchMedia = () => ({ matches: true });
        const h = harness();
        await press(h);
        expect(card(h)).toBeDefined();
        button(card(h)!, "Accept")!.click();
        await flush();
        expect(rec.animations).toHaveLength(0);
        expect(h.store.save).toHaveBeenCalledTimes(1);
    });
});

describe("the shared proposal card (#748, for R3's #756/#759)", () => {
    it("takes a custom Edit label, and resolves null when dismissed", async () => {
        const host = new DomNode();
        host.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 400 });
        const handle = openProposal(host as never, { left: 10, top: 10, width: 50, height: 20 }, { intro: "Proposed: a link", text: "x", editable: true, editLabel: "Change it" });
        expect(button(handle.el as never, "Change it")).toBeDefined();
        handle.dismiss();
        expect(await handle.decision).toBeNull();
        expect((handle.el as unknown as DomNode).isConnected).toBe(false);
    });

    it("stacks a second card below the first rather than over it", () => {
        const host = new DomNode();
        host.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 800 });
        const realCreate = host.createDiv.bind(host);
        (host as any).createDiv = (o: any) => {
            const el = realCreate(o);
            el.getBoundingClientRect = () => ({ left: Number.parseFloat(el.cssProps["--zf-prop-x"] ?? "0"), top: Number.parseFloat(el.cssProps["--zf-prop-y"] ?? "0"), width: 300, height: 100 });
            return el;
        };
        const first = openProposal(host as never, { left: 10, top: 10, width: 50, height: 20 }, { intro: "one" });
        const second = openProposal(host as never, { left: 40, top: 12, width: 50, height: 20 }, { intro: "two" });
        expect((first.el as unknown as DomNode).cssProps["--zf-prop-y"]).toBe("34px");
        expect((second.el as unknown as DomNode).cssProps["--zf-prop-y"]).toBe("138px");
        first.dismiss();
        second.dismiss();
    });

    it("opens above its origin when there is no room below", () => {
        const host = new DomNode();
        host.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 400 });
        const origin = { left: 10, top: 360, width: 50, height: 20 };
        const realCreate = host.createDiv.bind(host);
        (host as any).createDiv = (o: any) => {
            const el = realCreate(o);
            el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 100 });
            return el;
        };
        const handle = openProposal(host as never, origin, { intro: "x" });
        const el = handle.el as unknown as DomNode;
        expect(el.hasClass("zettelkasten-flow__reader-proposal--above")).toBe(true);
        expect(el.cssProps["--zf-prop-y"]).toBe("256px");
        handle.dismiss();
    });
});

describe("the strokes alone, as an image (#748 FR-3)", () => {
    it("draws only the drawing's segments, dark on plain light, and gives a PNG", () => {
        const calls: string[] = [];
        const ctx: any = new Proxy(
            {},
            {
                get: (_t, key: string) => (key in ctxProps ? ctxProps[key] : (...args: unknown[]) => calls.push(`${key}(${args.length})`)),
                set: (_t, key: string, value) => {
                    calls.push(`${key}=${value}`);
                    return true;
                },
            }
        );
        const ctxProps: Record<string, unknown> = {};
        const at: any = { createEl: (_tag: string, o: any) => ({ attrs: o.attr, remove() {}, getContext: () => ctx, toDataURL: (type: string) => `data:${type};base64,UE5H` }) };
        const image = inkImage(DRAWING, at);
        expect(image).toEqual({ mime: "image/png", base64: "UE5H" });
        expect(calls).toContain("fillStyle=#fff");
        expect(calls).toContain("strokeStyle=#000");
        // One fill for the plain light page, then strokes — nothing else drawn.
        expect(calls.filter((c) => c.startsWith("fillRect"))).toHaveLength(1);
        expect(calls.filter((c) => c.startsWith("stroke("))).toHaveLength(5);
        expect(calls.some((c) => /drawImage|fillText/.test(c))).toBe(false);
    });
});
