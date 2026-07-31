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
});
