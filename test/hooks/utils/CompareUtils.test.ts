import { describe, it, expect } from "@jest/globals";
import {
  valuesEqual,
  hasFrontmatterMutations,
  copyFrontmatter,
  changedHookProperties,
} from "hooks/utils/CompareUtils";

describe("valuesEqual", () => {
  it("treats identical primitives as equal", () => {
    expect(valuesEqual(1, 1)).toBe(true);
    expect(valuesEqual("a", "a")).toBe(true);
    expect(valuesEqual(true, true)).toBe(true);
  });

  it("treats different primitives as not equal", () => {
    expect(valuesEqual(1, 2)).toBe(false);
    expect(valuesEqual("a", "b")).toBe(false);
  });

  it("deep-compares objects and arrays", () => {
    expect(valuesEqual({ a: 1, b: [2, 3] }, { a: 1, b: [2, 3] })).toBe(true);
    expect(valuesEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it("does not treat null as an object", () => {
    expect(valuesEqual(null, {})).toBe(false);
    expect(valuesEqual(null, null)).toBe(true);
  });
});

describe("hasFrontmatterMutations", () => {
  it("is false for empty inputs", () => {
    expect(hasFrontmatterMutations()).toBe(false);
    expect(hasFrontmatterMutations({}, [])).toBe(false);
  });

  it("is true when there are properties to set", () => {
    expect(hasFrontmatterMutations({ status: "done" }, [])).toBe(true);
  });

  it("is true when there are properties to remove", () => {
    expect(hasFrontmatterMutations({}, ["draft"])).toBe(true);
  });
});

describe("copyFrontmatter", () => {
  it("returns a copy that is not affected by later in-place mutation of the source", () => {
    // Reproduces the property-hooks bug: Obsidian mutates the cached frontmatter object in
    // place, so a live reference would show the *new* value as the 'old' one.
    const live: Record<string, unknown> = { status: "todo", tags: ["a"] };
    const snapshot = copyFrontmatter(live);

    // Simulate Obsidian updating the same object in place.
    live.status = "done";
    (live.tags as string[]).push("b");

    expect(snapshot.status).toBe("todo");
    expect(snapshot.tags).toEqual(["a"]);
  });

  it("defaults to an empty object", () => {
    expect(copyFrontmatter()).toEqual({});
  });
});

describe("changedHookProperties", () => {
  it("detects a real change on a watched property", () => {
    const oldFm = { status: "todo" };
    const newFm = { status: "done" };
    expect(changedHookProperties(["status"], oldFm, newFm)).toEqual(["status"]);
  });

  it("ignores unwatched and unchanged properties", () => {
    const oldFm = { status: "todo", author: "x" };
    const newFm = { status: "todo", author: "y" };
    expect(changedHookProperties(["status"], oldFm, newFm)).toEqual([]);
  });

  it("regression: a copied old snapshot vs the mutated live object still detects the change", () => {
    const live: Record<string, unknown> = { status: "todo" };
    const oldSnapshot = copyFrontmatter(live);
    live.status = "done"; // Obsidian mutates in place
    const newSnapshot = copyFrontmatter(live);
    expect(changedHookProperties(["status"], oldSnapshot, newSnapshot)).toEqual(["status"]);
  });
});
