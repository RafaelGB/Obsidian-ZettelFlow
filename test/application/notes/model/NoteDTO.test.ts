import { describe, it, expect } from "@jest/globals";
import { NoteDTO } from "application/notes/model/NoteDTO";

/* eslint-disable @typescript-eslint/no-explicit-any */
describe("NoteDTO", () => {
  it("builds the final path from target folder + title + .md", () => {
    const n = new NoteDTO();
    n.setTargetFolder("Notes/Inbox").setTitle("My Note");
    expect(n.getFinalPath()).toBe("Notes/Inbox/My Note.md");
  });

  it("strips a trailing slash from the target folder", () => {
    const n = new NoteDTO();
    n.setTargetFolder("Notes/").setTitle("t");
    expect(n.getTargetFolder()).toBe("Notes");
    expect(n.getFinalPath()).toBe("Notes/t.md");
  });

  it("records paths and actions by position", () => {
    const n = new NoteDTO();
    n.addPath("a.md", 0).addPath("b.md", 1);
    n.addAction({ type: "prompt", id: "1", label: "L" } as any, "val", 0);
    n.addBackgroundAction({ type: "script", id: "2" } as any, 1);
    expect(n.getPath(0)).toBe("a.md");
    expect(n.getElement(0)).toMatchObject({ type: "prompt", result: "val" });
    expect(n.getElement(1)).toMatchObject({ type: "script", result: null });
  });

  it("ignores invalid path inputs", () => {
    const n = new NoteDTO();
    n.addPath(undefined, 0).addPath("x.md", -1);
    expect(n.getPaths().size).toBe(0);
  });

  it("deletePos removes every path and action at or after the position", () => {
    const n = new NoteDTO();
    n.addPath("a", 0).addPath("b", 1).addPath("c", 2);
    n.addAction({ type: "t", id: "i" } as any, "r", 2);
    n.deletePos(1);
    expect([...n.getPaths().keys()]).toEqual([0]);
    expect(n.getElements().size).toBe(0);
  });

  it("tracks the unique-prefix pattern", () => {
    const n = new NoteDTO();
    expect(n.hasPattern()).toBe(false);
    n.setPattern("YYYY");
    expect(n.hasPattern()).toBe(true);
    expect(n.getPattern()).toBe("YYYY");
  });
});
