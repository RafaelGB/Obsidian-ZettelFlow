import { describe, it, expect } from "@jest/globals";
import { substitutePlaceholders } from "starters/services/placeholders";

describe("substitutePlaceholders", () => {
  const meta = { title: "My Note", count: 3, done: false, empty: "" };

  it("replaces a known placeholder with its frontmatter value", () => {
    expect(substitutePlaceholders("Title: {{title}}", meta)).toBe("Title: My Note");
  });

  it("trims whitespace inside the braces when looking up the key", () => {
    expect(substitutePlaceholders("{{ title }}", meta)).toBe("My Note");
  });

  it("stringifies non-string values", () => {
    expect(substitutePlaceholders("{{count}}/{{done}}", meta)).toBe("3/false");
  });

  it("keeps an empty-string value (only null/undefined fall back)", () => {
    expect(substitutePlaceholders("[{{empty}}]", meta)).toBe("[]");
  });

  it("leaves unknown placeholders untouched, preserving the original key text", () => {
    expect(substitutePlaceholders("{{missing}} and {{ nope }}", meta)).toBe(
      "{{missing}} and {{ nope }}"
    );
  });

  it("replaces multiple placeholders in one string", () => {
    expect(substitutePlaceholders("{{title}} x{{count}}", meta)).toBe("My Note x3");
  });

  it("returns text without placeholders unchanged", () => {
    expect(substitutePlaceholders("plain text", meta)).toBe("plain text");
  });
});
