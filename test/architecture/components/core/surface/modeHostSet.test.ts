/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { Scope, WorkspaceLeaf } from "obsidian";
import { DomNode } from "../../../../support/dashboardDom";
import { recordAnimations, type AnimationRecord } from "../../../../support/motionDom";
import { ModeHostView } from "architecture/components/core/surface/ModeHostView";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";
import { MOTION } from "architecture/components/core/reader/readerMotion";

/** A mode that says when it is ready, where a door lands, and what it was handed. */
class FakeRenderer extends KnowledgeModeRenderer {
    static made: FakeRenderer[] = [];
    loaded = false;
    unloaded = false;
    landedOn: unknown = null;
    claims = false;
    private release: () => void = () => undefined;
    private readonly gate: Promise<void>;
    constructor(
        readonly mode: string,
        container: HTMLElement,
        readonly state: Record<string, unknown> | undefined,
        held: boolean
    ) {
        super(container);
        this.gate = held ? new Promise<void>((resolve) => (this.release = resolve)) : Promise.resolve();
        FakeRenderer.made.push(this);
    }
    onload(): void {
        this.loaded = true;
        const card = (this.container as unknown as DomNode).createDiv({ cls: "fake-card", attr: { "data-zf-door": "last-thought" } });
        card.setAttribute("data-thought", "t1");
    }
    onunload(): void {
        this.unloaded = true;
    }
    ready(): Promise<void> {
        return this.gate;
    }
    open(): void {
        this.release();
    }
    landing(payload: Record<string, unknown> | undefined): HTMLElement | null {
        if (payload?.thought === "missing") return null;
        if (payload?.thought || payload?.door) return (this.container as unknown as DomNode).oneByClass("fake-card") as never;
        return null;
    }
    landed(el: HTMLElement): void {
        this.landedOn = el;
    }
    claimsEscape(): boolean {
        return this.claims;
    }
}

let hold = new Set<string>();

class SetView extends ModeHostView {
    constructor(leaf: WorkspaceLeaf, private readonly type: "zettelflow-home" | "zettelflow-health") {
        super(leaf as never);
    }
    getViewType(): string {
        // A literal per test class would be the real rule; here one class films two surfaces.
        return (this as unknown as { type?: string }).type ?? "zettelflow-home";
    }
    protected createRenderer(modeId: string, container: HTMLElement, state?: Record<string, unknown>): KnowledgeModeRenderer {
        return new FakeRenderer(modeId, container, state, hold.has(modeId));
    }
    door(to: string, payload: Record<string, unknown>, from: HTMLElement): Promise<void> {
        return this.travelByDoor(to, payload, "last-thought", from);
    }
    go(mode: string): void {
        (this as any).tabButtons.get(mode).click();
    }
}

/** One window for every node: a clock that runs, motion welcome, and the listeners a shot arms. */
function fakeWindow() {
    const listeners: Record<string, ((event: any) => void)[]> = {};
    return {
        setTimeout: (fn: () => void, ms: number) => {
            const timer = setTimeout(fn, ms) as unknown as { unref?: () => void };
            timer.unref?.();
            return timer as unknown as number;
        },
        clearTimeout: (timer: number) => clearTimeout(timer as never),
        matchMedia: () => ({ matches: false }),
        addEventListener: (type: string, fn: (event: any) => void) => (listeners[type] ??= []).push(fn),
        removeEventListener: (type: string, fn: (event: any) => void) => (listeners[type] = (listeners[type] ?? []).filter((other) => other !== fn)),
        dispatch: (type: string, event: any = {}) => {
            for (const fn of [...(listeners[type] ?? [])]) fn({ type, preventDefault() {}, stopImmediatePropagation() {}, ...event });
        },
    };
}

let record: AnimationRecord;
let win: ReturnType<typeof fakeWindow>;
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
/** Let the move run: every await taken, every animation landed. */
async function settle(): Promise<void> {
    for (let round = 0; round < 8; round++) {
        await flush();
        record.finishAll();
    }
}

async function mount(type: "zettelflow-home" | "zettelflow-health" = "zettelflow-home") {
    const content = new DomNode();
    const doc = { activeElement: null as unknown, body: {}, querySelector: () => null };
    (content as any).doc = doc;
    const app = { scope: new Scope(), workspace: { requestSaveLayout() {}, onLayoutReady() {} } };
    const leaf = new WorkspaceLeaf(app, content);
    const view = new SetView(leaf as never, type);
    (view as any).type = type;
    await view.onOpen();
    await settle();
    const tab = (mode: string) => content.find((el) => el.id === `zf-tab-${type}-${mode}`) as DomNode;
    const pane = (mode: string) => content.find((el) => el.getAttribute("data-mode") === mode) as DomNode;
    const escape = () => (view.scope as Scope).handleKey({} as never, { modifiers: "", key: "Escape" });
    const live = () => FakeRenderer.made.filter((renderer) => renderer.loaded && !renderer.unloaded);
    return { view, content, doc, tab, pane, escape, live };
}

beforeEach(() => {
    FakeRenderer.made = [];
    hold = new Set();
    win = fakeWindow();
    (globalThis as any).activeWindow = win;
    record = recordAnimations();
});
afterEach(() => {
    record.stop();
    delete (globalThis as any).activeWindow;
});

const strips = () => record.animations.filter((animation) => String(animation.keyframes[0]?.transform ?? "").startsWith("translateX(") && String(animation.keyframes[1]?.transform ?? "").endsWith("%)"));
const ghosts = () => record.animations.filter((animation) => (animation.target as DomNode).hasClass?.("zettelkasten-flow__motion-ghost"));

describe("the set's tabs, panel and panes (#875 FR-5, AC-2)", () => {
    it("says which mode is in view, and hides the panes the camera is not on", async () => {
        const m = await mount();
        m.view.go("lab");
        await settle();
        expect(m.tab("lab").getAttribute("aria-selected")).toBe("true");
        expect(m.tab("lab").getAttribute("tabindex")).toBe("0");
        expect(m.tab("home").getAttribute("tabindex")).toBe("-1");
        expect(m.content.find((el) => el.getAttribute("role") === "tabpanel")?.getAttribute("aria-labelledby")).toBe("zf-tab-zettelflow-home-lab");
        for (const mode of ["home", "cultivate"]) {
            expect(m.pane(mode).getAttribute("inert")).toBe("");
            expect(m.pane(mode).getAttribute("aria-hidden")).toBe("true");
        }
        expect(m.pane("lab").getAttribute("inert")).toBeNull();
    });
});

describe("one mode at rest, two in a shot (#875 AC-15, AC-M2)", () => {
    it("mounts the destination, waits for it, pans, then lets the mode it left go", async () => {
        const m = await mount();
        expect(m.live().map((renderer) => renderer.mode)).toEqual(["home"]);
        hold.add("lab");
        m.view.go("lab");
        await flush();
        // Built and waited for: two are mounted, and the camera has not moved yet.
        expect(m.live().map((renderer) => renderer.mode)).toEqual(["home", "lab"]);
        expect(strips()).toHaveLength(0);
        FakeRenderer.made.find((renderer) => renderer.mode === "lab")?.open();
        await flush();
        await flush();
        expect(strips()).toHaveLength(1);
        expect(strips()[0].keyframes.map((frame) => frame.transform)).toEqual(["translateX(0%)", "translateX(-200%)"]);
        expect(strips()[0].duration).toBe(MOTION.turn);
        await settle();
        expect(m.live().map((renderer) => renderer.mode)).toEqual(["lab"]);
    });
});

describe("what travels without a shot (#875 FR-18, FR-4, AC-14)", () => {
    it("lands a deep link with no animation, the payload handed over and no way back", async () => {
        const m = await mount();
        await m.view.setState({ mode: "cultivate", target: "Notes/x.md" }, {} as never);
        await settle();
        expect(strips()).toHaveLength(0);
        const cultivate = m.live()[0];
        expect(cultivate.mode).toBe("cultivate");
        expect(cultivate.state?.target).toBe("Notes/x.md");
        expect(cultivate.backTo).toBeNull();
    });

    it("keeps every other surface switching in place, as it did", async () => {
        const m = await mount("zettelflow-health");
        const modes = m.content.findAll((el) => el.getAttribute("data-mode") !== null).map((el) => el.getAttribute("data-mode"));
        m.view.go(modes[1] as string);
        await settle();
        expect(record.animations).toHaveLength(0);
        expect(m.live().map((renderer) => renderer.mode)).toEqual([modes[1]]);
    });
});

describe("a door, and the way back (#875 FR-7–FR-13, AC-5–AC-10, AC-16)", () => {
    it("flies the card in with the pan, offers Home, and Esc plays it backwards to a new Home", async () => {
        const m = await mount();
        const home = m.live()[0];
        const card = m.pane("home").oneByClass("fake-card");
        void m.view.door("lab", { thought: "t1" }, card as never);
        await flush();
        await flush();
        expect(strips()).toHaveLength(1);
        expect(ghosts()).toHaveLength(1);
        expect(ghosts()[0].duration).toBe(strips()[0].duration);
        await settle();
        const lab = m.live()[0];
        expect(lab.mode).toBe("lab");
        expect(lab.backTo?.label).toBe("Home");
        expect(lab.backTo?.icon).toBe("arrow-left");
        expect(lab.landedOn).toBe(m.pane("lab").oneByClass("fake-card"));
        expect(m.escape()).toBe(false);
        await settle();
        const back = m.live()[0];
        expect(back.mode).toBe("home");
        expect(back).not.toBe(home);
        expect(back.backTo).toBeNull();
        // Once only: a second Esc goes nowhere.
        expect(m.escape()).toBeUndefined();
    });

    it("leaves Esc to a text box, an open menu, or a mode that uses it", async () => {
        const m = await mount();
        void m.view.door("lab", { thought: "t1" }, m.pane("home").oneByClass("fake-card") as never);
        await settle();
        m.doc.activeElement = { tagName: "TEXTAREA" };
        expect(m.escape()).toBeUndefined();
        m.doc.activeElement = null;
        (m.doc as any).querySelector = () => ({});
        expect(m.escape()).toBeUndefined();
        (m.doc as any).querySelector = () => null;
        m.live()[0].claims = true;
        expect(m.escape()).toBeUndefined();
        expect(m.live()[0].mode).toBe("lab");
    });

    it("forgets the door once you move by the bar", async () => {
        const m = await mount();
        void m.view.door("lab", { thought: "t1" }, m.pane("home").oneByClass("fake-card") as never);
        await settle();
        m.view.go("cultivate");
        await settle();
        expect(m.live()[0].backTo).toBeNull();
        expect(m.escape()).toBeUndefined();
    });

    it("pans plainly when there is nowhere for the card to land", async () => {
        const m = await mount();
        void m.view.door("lab", { thought: "missing" }, m.pane("home").oneByClass("fake-card") as never);
        await flush();
        await flush();
        expect(strips()).toHaveLength(1);
        expect(ghosts()).toHaveLength(0);
        await settle();
        expect(m.live()[0].backTo?.label).toBe("Home");
    });

    it("jumps the shot to its end on the next press, and the press does nothing else", async () => {
        const m = await mount();
        void m.view.door("lab", { thought: "t1" }, m.pane("home").oneByClass("fake-card") as never);
        await flush();
        await flush();
        let stopped = false;
        win.dispatch("pointerdown", { stopImmediatePropagation: () => (stopped = true) });
        expect(record.animations.every((animation) => animation.playState === "finished")).toBe(true);
        expect(stopped).toBe(true);
        await settle();
    });
});
