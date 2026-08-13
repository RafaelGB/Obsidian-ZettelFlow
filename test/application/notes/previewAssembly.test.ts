import { describe, it, expect } from "@jest/globals";
import {
  assembleNotePreview,
  PreviewElement,
  PreviewTemplate,
} from "application/notes/previewAssembly";

const tpl = (body: string, frontmatter: Record<string, unknown> = {}): PreviewTemplate => ({
  body,
  frontmatter,
});

describe("assembleNotePreview", () => {
  it("concatenates template bodies in order and merges frontmatter", () => {
    const result = assembleNotePreview({
      title: "My note",
      templates: [
        tpl("First body.\n", { type: "book" }),
        tpl("Second body.\n", { status: "draft" }),
      ],
      elements: [],
    });
    expect(result.body).toBe("First body.\nSecond body.\n");
    expect(result.frontmatter).toEqual({ type: "book", status: "draft" });
    expect(result.title).toBe("My note");
  });

  it("substitutes context tokens in the merged body", () => {
    const result = assembleNotePreview({
      title: "t",
      templates: [tpl("By {{frontmatter.author}} in {{canvas.name}}.\n")],
      elements: [],
      sourceFrontmatter: { author: "Ada" },
      canvasName: "Research",
    });
    expect(result.body).toBe("By Ada in Research.\n");
  });

  it("replaces {{key}} in the body for a body-zone action result", () => {
    const el: PreviewElement = { type: "prompt", zone: "body", key: "summary", result: "All good" };
    const result = assembleNotePreview({
      title: "t",
      templates: [tpl("Summary: {{summary}}\n")],
      elements: [el],
    });
    expect(result.body).toBe("Summary: All good\n");
  });

  it("sets a frontmatter-zone action result into the frontmatter", () => {
    const el: PreviewElement = { type: "prompt", zone: "frontmatter", key: "status", result: "done" };
    const result = assembleNotePreview({
      title: "t",
      templates: [tpl("body\n")],
      elements: [el],
    });
    expect(result.frontmatter.status).toBe("done");
  });

  it("defaults an action with no zone to frontmatter", () => {
    const el: PreviewElement = { type: "prompt", key: "priority", result: "high" };
    const result = assembleNotePreview({
      title: "t",
      templates: [tpl("body\n")],
      elements: [el],
    });
    expect(result.frontmatter.priority).toBe("high");
  });

  it("uses staticValue when staticBehaviour is set, otherwise result", () => {
    const staticEl: PreviewElement = {
      type: "prompt",
      zone: "frontmatter",
      key: "author",
      staticBehaviour: true,
      staticValue: "Fixed",
      result: "Dynamic",
    };
    const dynEl: PreviewElement = {
      type: "prompt",
      zone: "frontmatter",
      key: "editor",
      staticBehaviour: false,
      result: "Live",
    };
    const result = assembleNotePreview({
      title: "t",
      templates: [tpl("body\n")],
      elements: [staticEl, dynEl],
    });
    expect(result.frontmatter.author).toBe("Fixed");
    expect(result.frontmatter.editor).toBe("Live");
  });

  it("merges and de-duplicates tags from templates and tag actions", () => {
    const tagEl: PreviewElement = { type: "tags", result: ["b", "a"] };
    const result = assembleNotePreview({
      title: "t",
      templates: [tpl("body\n", { tags: ["a"] })],
      elements: [tagEl],
    });
    expect(result.frontmatter.tags).toEqual(["a", "b"]);
  });

  it("merges tags supplied through a frontmatter-zone action with key 'tags'", () => {
    const el: PreviewElement = { type: "prompt", zone: "frontmatter", key: "tags", result: "extra" };
    const result = assembleNotePreview({
      title: "t",
      templates: [tpl("body\n", { tags: ["base"] })],
      elements: [el],
    });
    expect(result.frontmatter.tags).toEqual(["base", "extra"]);
  });

  it("replaces {{title}} in the body with the note title", () => {
    const result = assembleNotePreview({
      title: "Fear of Missing Out",
      templates: [tpl("# {{title}}\n")],
      elements: [],
    });
    expect(result.body).toBe("# Fear of Missing Out\n");
  });

  it("ignores context-zone action results for display", () => {
    const el: PreviewElement = { type: "prompt", zone: "context", key: "secret", result: "hidden" };
    const result = assembleNotePreview({
      title: "t",
      templates: [tpl("body\n")],
      elements: [el],
    });
    expect(result.frontmatter.secret).toBeUndefined();
    expect(result.body).toBe("body\n");
  });

  it("skips null and undefined action values", () => {
    const nullEl: PreviewElement = { type: "prompt", zone: "frontmatter", key: "a", result: null };
    const undefEl: PreviewElement = { type: "prompt", zone: "frontmatter", key: "b", result: undefined };
    const result = assembleNotePreview({
      title: "t",
      templates: [tpl("body\n")],
      elements: [nullEl, undefEl],
    });
    expect(result.frontmatter).toEqual({});
  });

  it("appends recorded connection links as wikilinks to the body", () => {
    const result = assembleNotePreview({
      title: "t",
      templates: [tpl("Body line.\n")],
      elements: [],
      links: ["Related note", "Second note"],
    });
    expect(result.body).toContain("[[Related note]]");
    expect(result.body).toContain("[[Second note]]");
    expect(result.body.startsWith("Body line.\n")).toBe(true);
  });
});
