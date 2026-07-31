import { describe, it, expect } from "@jest/globals";
import {
  normalizeFolderToCanvasName,
  canvasPathFromFolder,
  canvasPathFromFlowName,
} from "hooks/utils/PathUtils";

describe("normalizeFolderToCanvasName", () => {
  it("replaces every slash with an underscore", () => {
    expect(normalizeFolderToCanvasName("a/b/c")).toBe("a_b_c");
  });

  it("leaves a flat folder name unchanged", () => {
    expect(normalizeFolderToCanvasName("Projects")).toBe("Projects");
  });
});

describe("canvasPathFromFolder", () => {
  it("builds the paired canvas path for a nested folder", () => {
    expect(canvasPathFromFolder("_ZettelFlow/folders", "Projects/Work")).toBe(
      "_ZettelFlow/folders/Projects_Work.canvas"
    );
  });
});

describe("canvasPathFromFlowName", () => {
  it("appends the .canvas extension when it is missing", () => {
    expect(canvasPathFromFlowName("_ZettelFlow/hooks", "daily")).toBe(
      "_ZettelFlow/hooks/daily.canvas"
    );
  });

  it("does not double the extension when already present", () => {
    expect(canvasPathFromFlowName("_ZettelFlow/hooks", "daily.canvas")).toBe(
      "_ZettelFlow/hooks/daily.canvas"
    );
  });
});
