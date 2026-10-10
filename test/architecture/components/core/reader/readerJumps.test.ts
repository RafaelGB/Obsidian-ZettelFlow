import { describe, it, expect } from "@jest/globals";
import { isNoteLink, noteExcerpt, ReaderTrail, TRAIL_LIMIT, TRAIL_REASONS, type NoteNode, type TrailReason } from "architecture/components/core/reader/readerJumps";

/** A node with just what the excerpt reads: a tag, its text, its flags and its parent. */
function node(tag: string, text: string, attrs: Record<string, string> = {}, parent: NoteNode | null = null): NoteNode {
    return { tagName: tag.toUpperCase(), textContent: text, getAttribute: (name) => attrs[name] ?? null, parentElement: parent };
}

describe("isNoteLink — a link that points at a footnote (#718)", () => {
    it("takes the book's own word for it", () => {
        expect(isNoteLink({ text: "see the notes", noteref: true, inSup: false })).toBe(true);
    });

    it("takes a superscript link as a note mark", () => {
        expect(isNoteLink({ text: "iv", noteref: false, inSup: true })).toBe(true);
    });

    it("recognises the marks footnotes are written with", () => {
        for (const text of ["1", "12", "[3]", "(4)", "*", "†", "‡", "§", "a", " 7 "]) {
            expect(isNoteLink({ text, noteref: false, inSup: false })).toBe(true);
        }
    });

    it("leaves ordinary cross-references to jump", () => {
        for (const text of ["chapter 3", "see below", "Figure 2", "the introduction", "1984 edition", ""]) {
            expect(isNoteLink({ text, noteref: false, inSup: false })).toBe(false);
        }
    });
});

describe("noteExcerpt — what the note says, for the popover (#718)", () => {
    it("reads a flagged note whole, with its whitespace collapsed", () => {
        const note = node("aside", "  Counted on the original\n  Unix interface.  ", { "data-zf-note": "true" });
        expect(noteExcerpt(note)).toBe("Counted on the original Unix interface.");
    });

    it("climbs from a bare marker to the note that holds it", () => {
        // `<li id="fn1"><a id="fn1-mark">1</a> The note itself.</li>`: the link names the marker.
        const li = node("li", "1 The note itself, in full.");
        const marker = node("a", "1", {}, li);
        expect(noteExcerpt(marker)).toBe("1 The note itself, in full.");
    });

    it("stops climbing at a flagged note, before the chapter around it", () => {
        const chapter = node("section", "A whole chapter of text… ".repeat(50));
        const note = node("p", "The note.", { "data-zf-note": "true" }, chapter);
        const marker = node("span", "1", {}, note);
        expect(noteExcerpt(marker)).toBe("The note.");
    });

    it("caps a long note with an ellipsis", () => {
        const note = node("aside", "word ".repeat(400), { "data-zf-note": "true" });
        const excerpt = noteExcerpt(note, 100)!;
        expect(excerpt.length).toBeLessThanOrEqual(100);
        expect(excerpt.endsWith("…")).toBe(true);
    });

    it("says nothing when there is nothing to say — the link then jumps", () => {
        expect(noteExcerpt(node("a", "   "))).toBeNull();
        // A marker whose surroundings are a whole chapter is not a note: jump instead.
        expect(noteExcerpt(node("a", "1", {}, node("section", "x ".repeat(2000))))).toBeNull();
    });
});

describe("ReaderTrail — the way back after a jump (#718)", () => {
    it("goes back through the jumps in order", () => {
        const stack = new ReaderTrail<{ chapter: number; top: number }>();
        stack.push({ chapter: 3, top: 840 });
        stack.push({ chapter: 7, top: 0 });
        expect(stack.peek()).toEqual({ chapter: 7, top: 0 });
        expect(stack.pop()).toEqual({ chapter: 7, top: 0 });
        expect(stack.pop()).toEqual({ chapter: 3, top: 840 });
        expect(stack.pop()).toBeUndefined();
    });

    it("forgets everything for a new reading, and keeps only the last few", () => {
        const stack = new ReaderTrail<number>(3);
        [1, 2, 3, 4, 5].forEach((n) => stack.push(n));
        expect(stack.size).toBe(3);
        expect(stack.pop()).toBe(5);
        stack.clear();
        expect(stack.size).toBe(0);
    });
});

describe("ReaderTrail — where you've been (#761 FR-6–FR-9, AC-5)", () => {
    type Entry = { chapter: number; reason: TrailReason };
    const filled = () => {
        const trail = new ReaderTrail<Entry>();
        TRAIL_REASONS.forEach((reason, chapter) => trail.push({ chapter, reason }));
        return trail;
    };

    it("lists every place newest first, each with what took you away", () => {
        const trail = filled();
        expect(trail.list().map((e) => e.reason)).toEqual(["passage", "bookmark", "note", "search", "contents", "link"]);
        expect(trail.size).toBe(6);
    });

    it("pops the newest: the pill and Alt+← walk the same trail as the list (FR-8)", () => {
        const trail = filled();
        expect(trail.pop()?.reason).toBe("passage");
        expect(trail.list()[0].reason).toBe("bookmark");
    });

    it("takes only the chosen row off the trail, and a pop then skips it", () => {
        const trail = filled();
        expect(trail.takeAt(1)?.reason).toBe("bookmark");
        expect(trail.list().map((e) => e.reason)).toEqual(["passage", "note", "search", "contents", "link"]);
        trail.pop();
        expect(trail.pop()?.reason).toBe("note");
        expect(trail.takeAt(9)).toBeUndefined();
        expect(trail.takeAt(-1)).toBeUndefined();
    });

    it("keeps the last 20, the oldest forgotten first, and empties for a new reading (FR-9)", () => {
        const trail = new ReaderTrail<Entry>();
        for (let chapter = 0; chapter < 25; chapter++) trail.push({ chapter, reason: "link" });
        expect(trail.size).toBe(TRAIL_LIMIT);
        expect(TRAIL_LIMIT).toBe(20);
        expect(trail.list().at(-1)?.chapter).toBe(5);
        trail.clear();
        expect(trail.list()).toEqual([]);
    });
});
