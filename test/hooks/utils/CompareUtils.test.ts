import { describe, it, expect } from "@jest/globals";
import { valuesEqual, hasFrontmatterMutations } from "hooks/utils/CompareUtils";

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
