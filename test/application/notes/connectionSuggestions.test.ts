import { describe, it, expect } from "@jest/globals";
import {
  extractTitleKeywords,
  rankConnectionSuggestions,
  SuggestionCandidate,
} from "application/notes/connectionSuggestions";

const candidate = (
  basename: string,
  tags: string[] = [],
  keywords: string[] = []
): SuggestionCandidate => ({
  path: `${basename}.md`,
  basename,
  tags,
  keywords,
});

describe("extractTitleKeywords", () => {
  it("lowercases, splits, and drops short/stop words", () => {
    expect(extractTitleKeywords("The Theory of Relativity")).toEqual([
      "theory",
      "relativity",
    ]);
  });

  it("returns an empty array for an empty title", () => {
    expect(extractTitleKeywords("")).toEqual([]);
  });

  it("de-duplicates repeated keywords", () => {
    expect(extractTitleKeywords("Notes about notes")).toEqual(["notes", "about"]);
  });
});

describe("rankConnectionSuggestions", () => {
  it("ranks candidates with more shared tags higher", () => {
    const result = rankConnectionSuggestions({
      tags: ["physics", "science"],
      titleKeywords: [],
      candidates: [
        candidate("One tag", ["physics"]),
        candidate("Two tags", ["physics", "science"]),
      ],
    });
    expect(result.map((s) => s.basename)).toEqual(["Two tags", "One tag"]);
  });

  it("bounds the number of results to max", () => {
    const candidates = Array.from({ length: 10 }, (_, i) =>
      candidate(`Note ${i}`, ["shared"])
    );
    const result = rankConnectionSuggestions({
      tags: ["shared"],
      titleKeywords: [],
      candidates,
      max: 3,
    });
    expect(result).toHaveLength(3);
  });

  it("counts title-keyword overlap against basenames and keywords", () => {
    const result = rankConnectionSuggestions({
      tags: [],
      titleKeywords: ["relativity"],
      candidates: [
        candidate("Theory of relativity"),
        candidate("Unrelated note"),
      ],
    });
    expect(result.map((s) => s.basename)).toEqual(["Theory of relativity"]);
  });

  it("excludes candidates whose path is in excludePaths", () => {
    const result = rankConnectionSuggestions({
      tags: ["shared"],
      titleKeywords: [],
      candidates: [candidate("Self", ["shared"]), candidate("Other", ["shared"])],
      excludePaths: ["Self.md"],
    });
    expect(result.map((s) => s.basename)).toEqual(["Other"]);
  });

  it("filters out zero-score candidates", () => {
    const result = rankConnectionSuggestions({
      tags: ["physics"],
      titleKeywords: ["relativity"],
      candidates: [candidate("Cooking", ["food"], ["recipe"])],
    });
    expect(result).toHaveLength(0);
  });

  it("reports the shared tags on each suggestion", () => {
    const [suggestion] = rankConnectionSuggestions({
      tags: ["a", "b"],
      titleKeywords: [],
      candidates: [candidate("Note", ["b", "c"])],
    });
    expect(suggestion.sharedTags).toEqual(["b"]);
  });

  it("breaks ties by basename ascending", () => {
    const result = rankConnectionSuggestions({
      tags: ["shared"],
      titleKeywords: [],
      candidates: [candidate("Beta", ["shared"]), candidate("Alpha", ["shared"])],
    });
    expect(result.map((s) => s.basename)).toEqual(["Alpha", "Beta"]);
  });
});
