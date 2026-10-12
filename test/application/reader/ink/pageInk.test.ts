import { describe, it, expect } from "@jest/globals";
import {
    chapterKey,
    dropCluster,
    emptyPageInk,
    fnv1a8,
    mergePageInk,
    pageInkPath,
    parsePageInk,
    putCluster,
    renderPageInk,
    PAGE_INK_TOMBSTONE_MS,
    type PageInk,
    type PageInkCluster,
} from "application/reader/ink/pageInk";
import { isUnreadable } from "application/reader/ink/inkSvg";

const NOW = 1_800_000_000_000;

function cluster(id: string, at: number, view: "text" | "page" = "text"): PageInkCluster {
    return {
        id,
        at,
        place:
            view === "text"
                ? { view: "text", locator: { at: 2, label: "Chapter 3", chapter: "ch3.xhtml" }, quote: { exact: "word", prefix: "a ", suffix: " b" }, side: "right", x: 0.25, line: -0.5, em: 18 }
                : { view: "page", locator: { at: 4, label: "p. 5" }, px: 0.1, py: 0.2, pw: 0.3, ph: 0.05 },
        strokes: [{ colour: "red", pointerType: "pen", points: [{ x: 0, y: 0, p: 0.5, tilt: 1.2, t: 0 }, { x: 1.25, y: 0.5, p: 0.6, tilt: 1.2, t: 16 }] }],
    };
}

const ids = (doc: PageInk) => doc.clusters.map((c) => c.id).sort();

describe("page ink (#790): the document's own ink, one file per book", () => {
    it("lives in one file per book under <thinking space>/ink/, the same name on every device", () => {
        const a = pageInkPath("Thinking", "Books/Dune.epub");
        expect(a).toBe(pageInkPath("Thinking", "Books/Dune.epub"));
        expect(a.startsWith("Thinking/ink/Dune-")).toBe(true);
        expect(a.endsWith(".svg")).toBe(true);
        // Two books with one basename are two files.
        expect(pageInkPath("Thinking", "Other/Dune.epub")).not.toBe(a);
        expect(fnv1a8("x")).toMatch(/^[0-9a-f]{8}$/);
    });

    it("keys a chapter by its identity in the file, else its place", () => {
        expect(chapterKey({ at: 2, label: "", chapter: "ch3.xhtml" })).toBe("ch3.xhtml");
        expect(chapterKey({ at: 2, label: "" })).toBe("at:2");
        expect(chapterKey(null)).toBe("at:0");
    });

    it("merges two devices' copies: the union, commutative and idempotent", () => {
        const base = putCluster(emptyPageInk("Books/Dune.epub"), cluster("a", NOW - 10));
        const ipad = putCluster(base, cluster("b", NOW - 5));
        const desk = putCluster(base, cluster("c", NOW - 4, "page"));
        const one = mergePageInk(ipad, desk, NOW);
        const two = mergePageInk(desk, ipad, NOW);
        expect(ids(one)).toEqual(["a", "b", "c"]);
        expect(renderPageInk(one)).toBe(renderPageInk(two));
        expect(renderPageInk(mergePageInk(one, one, NOW))).toBe(renderPageInk(one));
    });

    it("keeps the newest version of a cluster both devices changed", () => {
        const older = putCluster(emptyPageInk("b"), cluster("a", NOW - 10));
        const newer = putCluster(emptyPageInk("b"), { ...cluster("a", NOW - 1), strokes: [] });
        expect(mergePageInk(older, newer, NOW).clusters[0].at).toBe(NOW - 1);
        expect(mergePageInk(newer, older, NOW).clusters[0].at).toBe(NOW - 1);
    });

    it("lets an erase win over the cluster on either side, and an undo after it win again", () => {
        const both = putCluster(emptyPageInk("b"), cluster("a", NOW - 10));
        const erased = dropCluster(both, "a", NOW - 5);
        expect(ids(mergePageInk(both, erased, NOW))).toEqual([]);
        expect(ids(mergePageInk(erased, both, NOW))).toEqual([]);
        // Put back after the erase (an undo): newer than the tombstone, so it stays.
        const back = putCluster(erased, cluster("a", NOW - 2));
        expect(ids(mergePageInk(erased, back, NOW))).toEqual(["a"]);
    });

    it("forgets an erase after the tombstone window", () => {
        const old = dropCluster(emptyPageInk("b"), "gone", NOW - PAGE_INK_TOMBSTONE_MS - 1);
        const recent = dropCluster(emptyPageInk("b"), "kept", NOW - 1000);
        const merged = mergePageInk(old, recent, NOW);
        expect(Object.keys(merged.erased)).toEqual(["kept"]);
    });

    it("round-trips through its file, and writes no script", () => {
        const doc = putCluster(putCluster(emptyPageInk("Books/Dune.epub"), cluster("a", NOW - 10)), cluster("b", NOW - 3, "page"));
        const text = renderPageInk(dropCluster(doc, "z", NOW - 1));
        const back = parsePageInk(text);
        expect(isUnreadable(back)).toBe(false);
        expect(renderPageInk(back as PageInk)).toBe(text);
        expect(text).not.toMatch(/<script|\son[a-z]+=/i);
        expect((back as PageInk).clusters[0].place).toEqual(cluster("a", 0).place);
    });

    it("reads a newer version, or a broken file, as unreadable — never as empty", () => {
        const text = renderPageInk(putCluster(emptyPageInk("b"), cluster("a", NOW)));
        expect(parsePageInk(text.replace('"v":1', '"v":7'))).toEqual({ unreadable: true, version: 7 });
        expect(parsePageInk("<svg/>")).toEqual({ unreadable: true, version: null });
    });

    it("skips a cluster it cannot place, and keeps the rest", () => {
        const text = renderPageInk(putCluster(putCluster(emptyPageInk("b"), cluster("a", NOW)), cluster("b", NOW)));
        const broken = text.replace('"view":"text"', '"view":"nowhere"');
        expect(ids(parsePageInk(broken) as PageInk)).toEqual(["b"]);
    });
});
