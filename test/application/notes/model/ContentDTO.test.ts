import { describe, it, expect } from "@jest/globals";
import { ContentDTO } from "application/notes/model/ContentDTO";

describe("ContentDTO", () => {
  it("appends body content with add()/get()", () => {
    const c = new ContentDTO();
    c.add("Hello ").add("world");
    expect(c.get()).toBe("Hello world");
  });

  it("substitutes every {{key}} occurrence via modify()", () => {
    const c = new ContentDTO();
    c.add("{{a}} and {{a}} and {{b}}");
    c.modify("a", "X");
    expect(c.get()).toBe("X and X and {{b}}");
  });

  it("merges frontmatter and hoists a 'tags' field into the tag list", () => {
    const c = new ContentDTO();
    c.addFrontMatter({ title: "t", tags: ["one", "two"] });
    expect(c.getFrontmatter()).toEqual({ title: "t" });
    expect(c.getFrontmatter().tags).toBeUndefined();
    expect(c.getTags()).toEqual(["one", "two"]);
  });

  it("de-duplicates tags across addTag/addTags", () => {
    const c = new ContentDTO();
    c.addTag("x").addTag("x").addTags(["x", "y"]).addTags("z");
    expect(c.getTags()).toEqual(["x", "y", "z"]);
    expect(c.hasTags()).toBe(true);
  });

  it("ignores empty or invalid tag inputs", () => {
    const c = new ContentDTO();
    c.addTags("").addTags(null as unknown as string);
    expect(c.getTags()).toEqual([]);
    expect(c.hasTags()).toBe(false);
  });

  it("resets content, frontmatter and tags", () => {
    const c = new ContentDTO();
    c.add("body");
    c.addFrontMatter({ a: 1 });
    c.addTag("t");
    c.reset();
    expect(c.get()).toBe("");
    expect(c.getFrontmatter()).toEqual({});
    expect(c.getTags()).toEqual([]);
  });

  it("leaves unmatched {{placeholders}} untouched when modifying an absent key", () => {
    const c = new ContentDTO();
    c.add("{{a}} stays {{b}}");
    c.modify("missing", "X");
    expect(c.get()).toBe("{{a}} stays {{b}}");
  });

  it("merges successive frontmatter calls, later keys overriding earlier ones", () => {
    const c = new ContentDTO();
    c.addFrontMatter({ title: "first", author: "me" });
    c.addFrontMatter({ title: "second" });
    expect(c.getFrontmatter()).toEqual({ title: "second", author: "me" });
  });

  it("accumulates and de-duplicates tags hoisted across successive frontmatter calls", () => {
    const c = new ContentDTO();
    c.addFrontMatter({ tags: ["a", "b"] });
    c.addFrontMatter({ tags: ["b", "c"] });
    expect(c.getTags()).toEqual(["a", "b", "c"]);
  });

  it("strips the 'tags' key out of the caller's frontmatter object (documents the mutation)", () => {
    const c = new ContentDTO();
    const input: Record<string, unknown> = { title: "t", tags: ["x"] };
    c.addFrontMatter(input as never);
    expect(input.tags).toBeUndefined();
    expect(input).toEqual({ title: "t" });
  });

  it("treats a falsy frontmatter argument as a no-op", () => {
    const c = new ContentDTO();
    c.addFrontMatter(undefined as never);
    c.addFrontMatter(null as never);
    expect(c.getFrontmatter()).toEqual({});
    expect(c.getTags()).toEqual([]);
  });

  it("ignores an array of tags that contains a non-string element", () => {
    const c = new ContentDTO();
    c.addTags(["ok", 1] as never);
    expect(c.getTags()).toEqual([]);
    expect(c.hasTags()).toBe(false);
  });

  it("de-duplicates within a single addTags array call", () => {
    const c = new ContentDTO();
    c.addTags(["a", "a", "b"]);
    expect(c.getTags()).toEqual(["a", "b"]);
  });
});
