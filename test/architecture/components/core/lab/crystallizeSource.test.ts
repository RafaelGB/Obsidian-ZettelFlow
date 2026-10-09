import { describe, it, expect, jest } from "@jest/globals";
import { DomNode } from "../../../../support/dashboardDom";
import { planCrystallization } from "application/thinking/crystallize";
import { parsePlace } from "application/library/provenance";
import type { Thought } from "application/thinking/thought";
import { CrystallizeModal } from "architecture/components/core/lab/CrystallizeModal";

const openReader = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock("architecture/components/core/reader/openReader", () => ({ openReader: (...args: unknown[]) => openReader(...args) }));


const passage: Thought = {
    id: "h1",
    at: 1,
    text: "",
    links: [],
    about: "Books/Thinking, Fast and Slow.epub",
    quote: { exact: "A general law of least effort applies to cognitive as well as physical exertion.", prefix: "", suffix: "" },
    locator: { at: 6, label: "3 · The lazy controller", chapter: "OEBPS/ch03.xhtml", page: "143" },
};

function open(thought: Thought) {
    const app = { vault: { getAbstractFileByPath: () => null } };
    const modal = new CrystallizeModal(app as never, planCrystallization([thought])!, () => undefined, thought.about);
    const content = new DomNode();
    (modal as unknown as { contentEl: DomNode }).contentEl = content;
    const close = jest.spyOn(modal, "close").mockImplementation(() => undefined);
    modal.onOpen();
    return { content, close, app };
}

describe("the note from this passage, before it exists, says where it comes from (#751 FR-6)", () => {
    it("shows the source as it will be written — book, chapter, page — with Open source passage", () => {
        const { content, close, app } = open(passage);
        expect(content.oneByClass("crystallize-source-where").textContent).toBe("Thinking, Fast and Slow · 3 · The lazy controller · p. 143");
        const button = content.oneByClass("crystallize-source-open");
        expect(button.textContent).toBe("↗ Open source passage");
        button.click();
        // Nothing written: the preview closes as a cancel would, and the Reader opens at the passage.
        expect(close).toHaveBeenCalled();
        const request = openReader.mock.calls[0][1] as { source: string; at: string };
        expect(openReader.mock.calls[0][0]).toBe(app);
        expect(request.source).toBe(passage.about);
        expect(parsePlace(request.at)).toMatchObject({ file: passage.about, chapter: "OEBPS/ch03.xhtml", page: "143", quote: { exact: expect.stringMatching(/^A general law/) } });
    });

    it("names the source by the title the file declares, as the Library knows it", async () => {
        const { setReaderHost } = await import("architecture/components/core/reader/readerHost");
        setReaderHost({ settings: { library: { "Papers/cap.pdf": { size: 1, mtime: 1, title: "CAP twelve years later" } } } });
        try {
            const pdf: Thought = { ...passage, about: "Papers/cap.pdf", locator: { at: 5, label: "p. 6", chapter: "page:5", page: "6" } };
            const { content } = open(pdf);
            expect(content.oneByClass("crystallize-source-where").textContent).toBe("CAP twelve years later · p. 6");
        } finally {
            setReaderHost(null);
        }
    });

    it("a thought that is not from a book shows no source", () => {
        const { content } = open({ id: "t1", at: 1, text: "Just a thought", links: [] });
        expect(content.byClass("crystallize-sources")).toHaveLength(0);
    });
});
