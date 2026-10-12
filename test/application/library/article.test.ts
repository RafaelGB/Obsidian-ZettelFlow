import { describe, it, expect } from "@jest/globals";
import {
    ARTICLES_DEFAULT,
    articleAdded,
    articleFields,
    articleSections,
    articlesFolder,
    dateOf,
    hostOf,
    inFolder,
    isArticle,
    nameOf,
    webSource,
} from "application/library/article";

const clip = { source: "https://example.com/slow-software", author: ["[[Jane Doe]]"], published: "2025-03-02", created: "2025-03-04", tags: ["clippings"] };

describe("what an article is (#744 AC-1)", () => {
    it("is a note inside the articles folder, or a folder in it, whose source is a web address", () => {
        expect(ARTICLES_DEFAULT).toBe("Clippings");
        expect(isArticle("Clippings/The case for slow software.md", clip, "Clippings")).toBe(true);
        expect(isArticle("Clippings/2025/March/x.md", clip, "Clippings")).toBe(true);
        expect(isArticle("Clippings/x.md", { source: "http://example.com" }, "/Clippings/")).toBe(true);
    });

    it("is never a note whose source is a link or plain text, nor one without a source", () => {
        expect(isArticle("Clippings/x.md", { source: "[[Some note]]" }, "Clippings")).toBe(false);
        expect(isArticle("Clippings/x.md", { source: "Kahneman 2011" }, "Clippings")).toBe(false);
        expect(isArticle("Clippings/x.md", { source: "ftp://example.com/x" }, "Clippings")).toBe(false);
        expect(isArticle("Clippings/x.md", {}, "Clippings")).toBe(false);
        expect(isArticle("Clippings/x.md", null, "Clippings")).toBe(false);
        expect(isArticle("Clippings/x.pdf", clip, "Clippings")).toBe(false);
    });

    it("is never a note outside the folder — a clippings tag alone is not enough — and none when the folder is empty", () => {
        expect(isArticle("Inbox/x.md", clip, "Clippings")).toBe(false);
        expect(isArticle("ClippingsOld/x.md", clip, "Clippings")).toBe(false);
        expect(isArticle("Clippings/x.md", clip, "")).toBe(false);
        expect(isArticle("Clippings/x.md", clip, "   ")).toBe(false);
        expect(inFolder("Clippings.md", "Clippings")).toBe(false);
        expect(articlesFolder(" /Web/Clips/ ")).toBe("Web/Clips");
        expect(articlesFolder(undefined)).toBe("");
    });

    it("reads a web source from a string or the first string of a list", () => {
        expect(webSource(" https://a.org/x ")).toBe("https://a.org/x");
        expect(webSource(["https://a.org/x", "https://b.org"])).toBe("https://a.org/x");
        expect(webSource(42)).toBeNull();
        expect(hostOf("https://www.Example.com:443/a?b")).toBe("example.com");
        expect(hostOf("https://user@blog.example.org/p")).toBe("blog.example.org");
    });
});

describe("an article's fields (#744 FR-4)", () => {
    it("names its authors from Web Clipper's links, takes the year of published and the site as the host", () => {
        const fields = articleFields({ ...clip, title: "The case for slow software", description: " Why  slow is good. " });
        expect(fields.details).toEqual({ title: "The case for slow software", author: ["Jane Doe"], year: 2025, tags: ["clippings"] });
        expect(fields.host).toBe("example.com");
        expect(fields.description).toBe("Why slow is good.");
        expect(fields.created).toBe(new Date(2025, 2, 4).getTime());
    });

    it("reads an aliased or foldered link, plain text, a status and collections it carries", () => {
        expect(nameOf("[[People/Jane Doe|Jane]]")).toBe("Jane");
        expect(nameOf("[[People/Jane Doe]]")).toBe("Jane Doe");
        expect(nameOf("  Ada   Lovelace ")).toBe("Ada Lovelace");
        const fields = articleFields({ source: "https://x.org", author: "Ada Lovelace", status: "finished", collections: "Software design", published: new Date(2019, 5, 1) });
        expect(fields.details).toEqual({ author: ["Ada Lovelace"], status: "finished", collections: ["Software design"], year: 2019 });
        expect(articleFields({ source: "https://x.org", status: "someday" }).details.status).toBeUndefined();
    });

    it("is added when Web Clipper says it was created, else when the file came into the vault", () => {
        expect(dateOf("2025-03-04T10:15")).toBe(new Date(2025, 2, 4, 10, 15).getTime());
        expect(dateOf("4 March")).toBeUndefined();
        expect(dateOf("2025-13-01")).toBeUndefined();
        expect(articleAdded(5, 9)).toBe(5);
        expect(articleAdded(undefined, 9)).toBe(9);
        expect(articleAdded(undefined, undefined)).toBe(0);
    });
});

describe("an article's sections (#744 FR-5)", () => {
    it("is one section, named after the article, when it has no heading", () => {
        const sections = articleSections("One paragraph.\n\nAnother one.", "Slow software");
        expect(sections.map((s) => s.title)).toEqual(["Slow software"]);
        expect(sections[0].markdown).toBe("One paragraph.\n\nAnother one.\n");
        expect(sections[0].headings).toEqual([]);
    });

    it("splits at its H1s, the text before the first being a section of its own", () => {
        const sections = articleSections("Lede.\n\n# Speed\nFast.\n## Detail\nMore.\n# Care\nSlow.", "Slow software");
        expect(sections.map((s) => s.title)).toEqual(["Slow software", "Speed", "Care"]);
        expect(sections[1].markdown).toBe("# Speed\nFast.\n## Detail\nMore.\n");
        expect(sections[1].headings).toEqual([
            { title: "Speed", depth: 1 },
            { title: "Detail", depth: 2 },
        ]);
    });

    it("splits at H2s when that is the shallowest it uses, and has no empty section before the first", () => {
        const sections = articleSections("\n\n## The *problem*\nA.\n\n## A [fix](https://x.org)\nB.\n### Why\nC.", "T");
        expect(sections.map((s) => s.title)).toEqual(["The problem", "A fix"]);
        expect(sections[1].headings.map((h) => h.title)).toEqual(["A fix", "Why"]);
    });

    it("never takes a heading inside a code block for one", () => {
        const sections = articleSections("## One\n```md\n## not a heading\n```\n## Two\nx", "T");
        expect(sections.map((s) => s.title)).toEqual(["One", "Two"]);
    });

    it("carries into each section the footnotes it refers to", () => {
        const body = "## One\nA claim.[^1]\n\n## Two\nAnother.[^2] Again.[^1]\n\n[^1]: The first note.\n[^2]: The second,\n    on two lines.\n";
        const sections = articleSections(body, "T");
        expect(sections[0].markdown).toBe("## One\nA claim.[^1]\n\n[^1]: The first note.\n");
        expect(sections[1].markdown).toBe("## Two\nAnother.[^2] Again.[^1]\n\n[^2]: The second,\n    on two lines.\n[^1]: The first note.\n");
    });
});
