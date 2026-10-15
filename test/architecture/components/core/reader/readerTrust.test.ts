/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Component, TFile, WorkspaceLeaf } from "obsidian";
import { DomNode, flush } from "../../../../support/dashboardDom";
import { FakeEl } from "../../../../support/textDom";
import { ReaderHighlights, type HighlightStore, type SelectionInfo } from "architecture/components/core/reader/readerHighlights";
import { UndoLedger } from "architecture/components/core/reader/readerUndoLedger";
import { chapterText } from "architecture/components/core/reader/readerMarks";
import { escapeStep } from "architecture/components/core/reader/readerDeep";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import { currentWriteOrigin } from "architecture/plugin/writes/recordVaultWrite";
import type { Thought, ThoughtQuote } from "application/thinking/thought";

/**
 * #810 — a reader you trust: a detached highlight put back on the page, and every Undo the Reader
 * offers reachable by Ctrl/⌘+Z, one guard for the button and the key.
 */

function chapter(): FakeEl {
    return new FakeEl("div", [
        new FakeEl("h2", ["Events"]),
        new FakeEl("p", ["Event sourcing stores ", new FakeEl("b", ["changes"]), ", not state."]),
        new FakeEl("p", ["Replay rebuilds it."]),
    ]);
}

function thought(id: string, quote: ThoughtQuote, extra: Partial<Thought> = {}): Thought {
    return { id, at: 1, links: [], text: "", about: "Notes/es.md", quote, ...extra } as unknown as Thought;
}

function memoryStore(initial: Thought[] = []) {
    const kept: Thought[] = [...initial];
    let next = 0;
    const origins: unknown[] = [];
    return {
        kept,
        origins,
        folder: () => "Lab",
        highlightsAbout: jest.fn(async (path: string) => kept.filter((t) => t.about === path)),
        write: jest.fn(async (text: string, options: { about?: string; quote?: ThoughtQuote; meaning?: Thought["meaning"] }) => {
            const made = thought(`hl-${++next}`, options.quote as ThoughtQuote, { text, ...(options.meaning ? { meaning: options.meaning } : {}) });
            kept.push(made);
            return made;
        }),
        save: jest.fn(async (t: Thought) => {
            origins.push(currentWriteOrigin());
            const i = kept.findIndex((k) => k.id === t.id);
            if (i >= 0) kept.splice(i, 1, t);
            else kept.push(t);
        }),
        discard: jest.fn(async (t: Thought) => {
            kept.splice(
                kept.findIndex((k) => k.id === t.id),
                1
            );
        }),
        restore: jest.fn(async (t: Thought) => {
            kept.push(t);
        }),
        isAsWritten: jest.fn(async (_t: Thought) => true),
    };
}

function mount(initial: Thought[] = []) {
    const store = memoryStore(initial);
    const ledger = new UndoLedger();
    const host = new DomNode();
    const margin = new DomNode();
    const body = chapter();
    const component = new Component();
    let selection: SelectionInfo | null = null;
    const highlights = new ReaderHighlights(
        {
            app: {} as never,
            host: host as never,
            owner: new Component(),
            scrollTo: jest.fn(),
            onChange: jest.fn(),
            undoable: (run, check) => ledger.offer(run, check),
        },
        {
            store: store as HighlightStore,
            selection: () => selection,
            headingAt: () => "Events",
            makeMark: (id) => {
                const mark = new FakeEl("mark");
                mark.attrs["data-hl"] = id;
                return mark as never;
            },
            openThink: jest.fn(),
            copy: jest.fn(),
        }
    );
    const select = (words: string) => {
        if (!words) {
            selection = null;
            return;
        }
        const start = chapterText(body as never).indexOf(words);
        selection = { start, end: start + words.length, rect: { left: 10, top: 20, width: 30 }, clear: jest.fn() };
    };
    const attach = () => highlights.attach(body as never, "Notes/es.md", component, margin as never);
    const button = (root: DomNode, label: string): DomNode => {
        const found = root.find((el) => el.tag === "button" && el.textContent === label);
        if (!found) throw new Error(`no "${label}" button`);
        return found;
    };
    const buttons = (root: DomNode) => root.findAll((el) => el.tag === "button").map((el) => el.textContent);
    const key = async () => {
        const take = ledger.takeLast();
        const outcome = take ? await take() : null;
        await flush();
        return outcome;
    };
    return { highlights, store, ledger, host, margin, body, select, attach, button, buttons, key };
}

const GONE: ThoughtQuote = { exact: "a passage edited away", prefix: "", suffix: "" };

beforeEach(() => jest.clearAllMocks());

describe("re-anchor a detached highlight (#810 FR-8–FR-14)", () => {
    it("offers Re-anchor on the detached row, beside Open in Think (AC-9)", async () => {
        const m = mount([thought("d1", GONE, { text: "my note" })]);
        await m.attach();
        expect(m.highlights.detachedItems().map((t) => t.id)).toEqual(["d1"]);
        expect(m.buttons(m.margin)).toEqual(expect.arrayContaining(["Open in Think", "Re-anchor"]));
    });

    it("enters a calm state: a line names it, offers Cancel, and a selection offers only Anchor here (AC-10)", async () => {
        const m = mount([thought("d1", GONE)]);
        await m.attach();
        m.button(m.margin, "Re-anchor").click();
        expect(m.highlights.isReanchoring()).toBe(true);
        const line = m.host.oneByClass("reader-reanchor");
        expect(line.textContent).toContain("a passage edited away");
        expect(m.buttons(line)).toEqual(["Cancel"]);
        // A chapter change keeps the state.
        await m.attach();
        expect(m.highlights.isReanchoring()).toBe(true);
        m.select("Replay rebuilds it");
        m.body.fire("mouseup");
        const pop = m.host.oneByClass("reader-hl-pop");
        expect(m.buttons(pop)).toEqual(["Anchor here"]);
        expect(m.store.save).not.toHaveBeenCalled();
    });

    it("Anchor here: the same thought, its note, meaning, layer and claims, at the new passage, in one write (AC-11)", async () => {
        const old = thought("d1", GONE, { text: "my note", meaning: "question", layer: "reflection", claims: ["Claims/x.md"] } as Partial<Thought>);
        const m = mount([old]);
        await m.attach();
        m.button(m.margin, "Re-anchor").click();
        m.select("Replay rebuilds it");
        m.body.fire("mouseup");
        m.button(m.host.oneByClass("reader-hl-pop"), "Anchor here").click();
        await flush();
        expect(m.store.save).toHaveBeenCalledTimes(1);
        expect(m.store.write).not.toHaveBeenCalled();
        const saved = m.store.save.mock.calls[0][0] as Thought;
        expect(saved).toEqual(expect.objectContaining({ id: "d1", text: "my note", meaning: "question", layer: "reflection", claims: ["Claims/x.md"] }));
        expect(saved.quote?.exact).toBe("Replay rebuilds it");
        expect(m.store.origins[0]).toEqual(expect.objectContaining({ ref: "reader-highlight" }));
        expect(m.highlights.detachedItems()).toEqual([]);
        expect(m.highlights.items().map((t) => t.id)).toEqual(["d1"]);
        expect(m.highlights.isReanchoring()).toBe(false);
        expect(m.host.byClass("reader-reanchor")).toHaveLength(0);
    });

    it("its Undo puts the old passage back, listed under Detached; Ctrl/⌘+Z reaches it too (AC-12)", async () => {
        const m = mount([thought("d1", GONE)]);
        await m.attach();
        m.button(m.margin, "Re-anchor").click();
        m.select("Replay rebuilds it");
        m.body.fire("mouseup");
        m.button(m.host.oneByClass("reader-hl-pop"), "Anchor here").click();
        await flush();
        expect(await m.key()).toBe("undone");
        expect(m.highlights.detachedItems().map((t) => t.quote?.exact)).toEqual(["a passage edited away"]);
        expect(m.highlights.items()).toEqual([]);
    });

    it("Cancel and closing write nothing, and leave the state (AC-13)", async () => {
        const m = mount([thought("d1", GONE)]);
        await m.attach();
        m.button(m.margin, "Re-anchor").click();
        m.button(m.host.oneByClass("reader-reanchor"), "Cancel").click();
        expect(m.highlights.isReanchoring()).toBe(false);
        m.button(m.margin, "Re-anchor").click();
        m.highlights.dispose();
        expect(m.highlights.isReanchoring()).toBe(false);
        expect(m.store.save).not.toHaveBeenCalled();
    });

    it("Esc closes a popover first, then the state, before deep reading (AC-13)", () => {
        expect(escapeStep({ popover: true, reanchor: true })).toBe("popover");
        expect(escapeStep({ panel: true, reanchor: true })).toBe("panel");
        expect(escapeStep({ reanchor: true, deep: true })).toBe("reanchor");
    });

    it("words that cannot be a highlight offer no Anchor here: a quiet line asks for words (AC-14)", async () => {
        const m = mount([thought("d1", GONE)]);
        await m.attach();
        m.button(m.margin, "Re-anchor").click();
        const at = chapterText(m.body as never).indexOf(" not state") ;
        (m as any).select("");
        // A selection of a single space: there, but not words.
        const deps = (m.highlights as any).select;
        (m.highlights as any).select = () => ({ start: at, end: at + 1, rect: { left: 1, top: 1, width: 1 }, clear: () => undefined });
        m.body.fire("mouseup");
        (m.highlights as any).select = deps;
        expect(m.host.find((el) => el.textContent === "Select some words to anchor it to")).toBeTruthy();
        expect(m.host.find((el) => el.tag === "button" && el.textContent === "Anchor here")).toBeFalsy();
    });
});

describe("Ctrl/⌘+Z takes back the reading's writes, newest first (#810 FR-15–FR-19)", () => {
    it("a highlight, then its meaning, then a note: three presses take them back in reverse (AC-15)", async () => {
        const m = mount();
        await m.attach();
        m.select("stores changes");
        m.body.fire("mouseup");
        m.button(m.host.oneByClass("reader-hl-pop"), "Idea").click();
        await flush();
        const made = m.highlights.items()[0];
        await (m.highlights as any).changeMeaning(made, "question");
        const meant = m.highlights.items()[0];
        await (m.highlights as any).editNote(meant, "why?");
        expect(m.highlights.items()[0]).toEqual(expect.objectContaining({ meaning: "question", text: "why?" }));
        expect(await m.key()).toBe("undone");
        expect(m.highlights.items()[0]).toEqual(expect.objectContaining({ meaning: "question", text: "" }));
        expect(await m.key()).toBe("undone");
        expect(m.highlights.items()[0].meaning ?? "idea").toBe("idea");
        expect(await m.key()).toBe("undone");
        expect(m.store.discard).toHaveBeenCalledTimes(1);
        expect(m.highlights.items()).toEqual([]);
        // A fourth press: nothing left in this reading (AC-16).
        expect(m.ledger.takeLast()).toBeNull();
    });

    it("the button and the key share one guard: after Undo, the key reaches the write before (AC-18)", async () => {
        const m = mount();
        await m.attach();
        m.select("stores changes");
        m.body.fire("mouseup");
        m.button(m.host.oneByClass("reader-hl-pop"), "Idea").click();
        await flush();
        m.select("Replay rebuilds it");
        m.body.fire("mouseup");
        m.button(m.host.oneByClass("reader-hl-pop"), "Idea").click();
        await flush();
        m.button(m.host.oneByClass("reader-hl-pop--status"), "Undo").click();
        await flush();
        expect(m.highlights.items().map((t) => t.quote?.exact)).toEqual(["stores changes"]);
        expect(await m.key()).toBe("undone");
        expect(m.highlights.items()).toEqual([]);
        expect(m.store.discard).toHaveBeenCalledTimes(2);
    });

    it("a thought changed since is left alone, and the line says so (AC-19)", async () => {
        const m = mount();
        await m.attach();
        m.select("stores changes");
        m.body.fire("mouseup");
        m.button(m.host.oneByClass("reader-hl-pop"), "Idea").click();
        await flush();
        m.store.isAsWritten.mockImplementation(async () => false);
        expect(await m.key()).toBe("refused");
        expect(m.store.discard).not.toHaveBeenCalled();
        expect(m.highlights.items()).toHaveLength(1);
    });
});

describe("Ctrl/⌘+Z in the Reader view (#810 FR-15, FR-19, FR-21, FR-22)", () => {
    function file(path: string): TFile {
        const f = new TFile();
        f.path = path;
        f.name = path;
        f.basename = path.replace(/\.md$/, "");
        f.extension = "md";
        return f;
    }

    async function open() {
        const files: Record<string, string> = { "a.md": "A first note.", "b.md": "B second note." };
        const app = {
            workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), iterateAllLeaves: () => undefined, setActiveLeaf: jest.fn(), trigger: jest.fn() },
            vault: { getAbstractFileByPath: (p: string) => (files[p] !== undefined ? file(p) : null), cachedRead: async (f: TFile) => files[f.path], modify: jest.fn(), process: jest.fn(), create: jest.fn() },
            metadataCache: { getFirstLinkpathDest: () => null },
        };
        const content = new DomNode();
        const leaf = new WorkspaceLeaf(app, content) as unknown as WorkspaceLeaf & { detach: jest.Mock };
        leaf.detach = jest.fn();
        const view = new ReaderView(leaf, { settings: {}, saveSettings: jest.fn(async () => undefined) });
        await view.setState({ seed: "a.md", kind: "selection", paths: ["a.md", "b.md"] }, {} as never);
        await view.onOpen();
        await flush();
        return { view, content };
    }

    const modZ = (view: ReaderView, target: unknown = null) => {
        const evt: any = { key: "z", target, preventDefault: () => (evt.defaultPrevented = true), defaultPrevented: false };
        const took = (view as any).scope.handleKey(evt, { modifiers: "Mod", key: "z" }) === false;
        return took;
    };

    it("takes the reading's last write, then says there is nothing left — with no Notice (AC-15, AC-16)", async () => {
        const { view, content } = await open();
        const run = jest.fn();
        (view as any).undoLedger.offer(run);
        expect(modZ(view)).toBe(true);
        await flush();
        expect(run).toHaveBeenCalledTimes(1);
        expect(modZ(view)).toBe(true);
        await flush();
        expect(content.find((el) => el.textContent === "Nothing to undo in this reading")).toBeTruthy();
        expect(run).toHaveBeenCalledTimes(1);
    });

    it("a text field keeps its own undo: the Reader does not take the key (AC-20)", async () => {
        const { view } = await open();
        const run = jest.fn();
        (view as any).undoLedger.offer(run);
        const area = { tagName: "TEXTAREA", isContentEditable: false };
        expect(modZ(view, area)).toBe(false);
        expect(run).not.toHaveBeenCalled();
    });

    it("another reading starts the ledger again, and the shortcuts sheet names the key (FR-15, AC-22)", async () => {
        const { view, content } = await open();
        (view as any).undoLedger.offer(jest.fn());
        await view.setState({ seed: "b.md", kind: "around" }, {} as never);
        expect((view as any).undoLedger.pending()).toBe(0);
        (view as any).toggleShortcuts();
        expect(content.find((el) => el.textContent === "Undo the last change in this reading")).toBeTruthy();
    });
});
