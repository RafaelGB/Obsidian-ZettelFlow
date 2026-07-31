import { describe, it, expect } from "@jest/globals";
import { c, hex2RGB, RGB2String } from "architecture/styles/helper";

describe("c() — CSS class prefixer", () => {
  it("prefixes a single class with the namespace", () => {
    expect(c("navbar")).toBe("zettelkasten-flow__navbar");
  });

  it("prefixes and space-joins multiple classes", () => {
    expect(c("a", "b")).toBe("zettelkasten-flow__a zettelkasten-flow__b");
  });

  it("returns an empty string when given no classes", () => {
    expect(c()).toBe("");
  });
});

describe("hex2RGB / RGB2String", () => {
  it("parses a 6-digit hex string into RGB channels", () => {
    expect(hex2RGB("ff8000")).toEqual({ r: 255, g: 128, b: 0 });
  });

  it("serializes an RGB object to a comma-separated string", () => {
    expect(RGB2String({ r: 12, g: 34, b: 56 })).toBe("12, 34, 56");
  });

  it("round-trips black through both helpers", () => {
    expect(RGB2String(hex2RGB("000000"))).toBe("0, 0, 0");
  });
});
