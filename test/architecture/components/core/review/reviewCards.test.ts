import { describe, it, expect, jest } from "@jest/globals";
import { Scope } from "obsidian";
import { DomNode, flush } from "../../../../support/dashboardDom";
import { press } from "../../../../support/readerKeys";
import { ReviewCards, type ReviewDeps } from "architecture/components/core/review/ReviewCards";
import type { Thought } from "application/thinking/thought";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 6);

function mark(id: string, exact: string, text = ""): Thought {
    return {
        id,
        at: NOW - 10 * DAY,
        text,
        links: [],
        about: "Notes/Event sourcing.md",
        quote: { exact, prefix: "", suffix: "", heading: "Events" },
    };
}

function mount(cards: Thought[]) {
    const host = new DomNode();
    const saved: Thought[] = [];
    const written: { text: string; options: unknown }[] = [];
    const deps = {
        store: {
            save: jest.fn(async (t: Thought) => void saved.push(t)),
            write: jest.fn(async (text: string, options: unknown) => {
                written.push({ text, options });
                return mark("new", "", text);
            }),
        },
        record: jest.fn(),
        openReader: jest.fn(),
        toNote: jest.fn(),
        close: jest.fn(),
        now: () => NOW,
    } satisfies ReviewDeps;
    const view = new ReviewCards(host as never, cards, deps);
    view.load();
    const scope = new Scope();
    view.keys(scope as never);
    const button = (label: string): DomNode => {
        const found = host.find((el) => el.tag === "button" && el.textContent.startsWith(label));
        if (!found) throw new Error(`no "${label}" button`);
        return found;
    };
    return { host, view, deps, saved, written, button, key: (k: string, extra = {}) => press({ view: { scope } }, k, extra) };
}

describe("a few things you marked, one card at a time (#678)", () => {
    it("shows the passage, where you marked it, your margin note and the question", () => {
        const m = mount([mark("a", "Event sourcing stores changes", "Like a ledger")]);
        expect(m.host.oneByClass("review-quote").text).toBe("Event sourcing stores changes");
        expect(m.host.oneByClass("review-meta").textContent).toContain("Event sourcing › Events");
        expect(m.host.oneByClass("review-note").text).toBe("Like a ledger");
        expect(m.host.oneByClass("review-ask").text).toBe("Do you still think so?");
        for (const label of ["Still think so", "Changed my mind", "Open in the Reader", "Crystallize", "Let it go"]) {
            expect(m.button(label)).toBeDefined();
        }
    });

    it("never shows a number — dots for where you are, no count of what is left", () => {
        const m = mount([mark("a", "one"), mark("b", "two"), mark("c", "three")]);
        expect(m.host.byClass("review-dot")).toHaveLength(3);
        const shown = m.host.findAll((el) => !el.classes.has("zettelkasten-flow__review-kbd")).map((el) => el.text);
        expect(shown.join(" ")).not.toMatch(/\d+ (left|more|remaining|missed|days?)/i);
    });

    it("still think so: records the verdict, moves it further out in its own file, deals the next", async () => {
        const m = mount([mark("a", "one"), mark("b", "two")]);
        m.button("Still think so").click();
        await flush();
        expect(m.deps.record).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }), "confirmed");
        expect(m.saved[0].review).toEqual({ stage: 1, due: NOW + 7 * DAY, last: NOW });
        expect(m.view.current()?.id).toBe("b");
    });

    it("let it go: retires it and records no verdict about the idea", async () => {
        const m = mount([mark("a", "one")]);
        m.key("5");
        await flush();
        expect(m.saved[0].review?.retired).toBe(true);
        expect(m.deps.record).not.toHaveBeenCalled();
        expect(m.host.oneByClass("review-end-title").text).toBe("That is all for today.");
    });

    it("changed my mind: opens a field, and what you write becomes a thought about the same note", async () => {
        const m = mount([mark("a", "one")]);
        m.key("2");
        const field = m.host.oneByClass("review-change-field");
        field.value = "I now think it is a log, not a ledger";
        field.fire("input");
        m.button("Keep what I think now").click();
        await flush();
        expect(m.written[0].text).toBe("I now think it is a log, not a ledger");
        expect(m.written[0].options).toEqual(expect.objectContaining({ about: "Notes/Event sourcing.md" }));
        expect(m.deps.record).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }), "modified");
        expect(m.saved[0].review?.stage).toBe(1);
    });

    it("writes nothing for an empty change, and cancel puts the answers back", async () => {
        const m = mount([mark("a", "one")]);
        m.button("Changed my mind").click();
        m.button("Keep what I think now").click();
        await flush();
        expect(m.written).toHaveLength(0);
        m.button("Cancel").click();
        expect(m.button("Still think so")).toBeDefined();
    });

    it("leaves a key pressed while you write to the field", () => {
        const m = mount([mark("a", "one")]);
        m.key("2");
        const field = m.host.oneByClass("review-change-field");
        (m.host as unknown as { ownerDocument: unknown }).ownerDocument = { activeElement: field };
        const evt = m.key("5");
        expect(evt.defaultPrevented).toBe(false);
        expect(m.saved).toHaveLength(0);
    });

    it("opens the Reader on the passage, and crystallize on the card — via keys 3 and 4", () => {
        const m = mount([mark("a", "one")]);
        m.key("3");
        expect(m.deps.openReader).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
        m.key("4");
        expect(m.deps.toNote).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }), expect.any(Function));
        const done = m.deps.toNote.mock.calls[0][1] as (path?: string) => void;
        done(undefined);
        expect(m.view.current()?.id).toBe("a");
        done("Ideas/One.md");
        expect(m.view.current()).toBeUndefined();
    });

    it("moves between cards with the arrows, without answering", () => {
        const m = mount([mark("a", "one"), mark("b", "two")]);
        m.key("ArrowRight");
        expect(m.view.current()?.id).toBe("b");
        m.key("ArrowLeft");
        m.key("ArrowLeft");
        expect(m.view.current()?.id).toBe("a");
        expect(m.saved).toHaveLength(0);
    });

    it("with nothing due, says so quietly and offers to close", () => {
        const m = mount([]);
        expect(m.host.oneByClass("review-end-title").text).toBe("Nothing you marked is back today.");
        m.button("Close").click();
        expect(m.deps.close).toHaveBeenCalled();
    });
});
