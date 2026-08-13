import { describe, it, expect } from "@jest/globals";
import { NoteDTO } from "application/notes/model/NoteDTO";

/* eslint-disable @typescript-eslint/no-explicit-any */
describe("NoteDTO", () => {
  it("builds the final path from target folder + title + .md", () => {
    const n = new NoteDTO();
    n.setTargetFolder("Notes/Inbox").setTitle("My Note");
    expect(n.getFinalPath()).toBe("Notes/Inbox/My Note.md");
  });

  it("collects on-creation pattern actions in walk order (#170)", () => {
    const n = new NoteDTO();
    expect(n.getOnCreation()).toEqual([]);
    const a = { type: "find-related", id: "find-related", hasUI: false } as any;
    const b = { type: "calculate-maturity", id: "calculate-maturity", hasUI: false } as any;
    const c = { type: "suggest-link", id: "suggest-link", hasUI: false } as any;
    n.addOnCreation([a, b]).addOnCreation([]).addOnCreation([c]);
    expect(n.getOnCreation()).toEqual([a, b, c]);
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

  it("ignores falsy setter inputs (title, target folder, pattern)", () => {
    const n = new NoteDTO();
    n.setTitle("" as unknown as string);
    n.setTargetFolder(undefined);
    n.setPattern(undefined);
    expect(n.getTitle()).toBe("");
    expect(n.getTargetFolder()).toBe("");
    expect(n.hasPattern()).toBe(false);
  });

  it("builds a final path from the defaults when nothing is set", () => {
    const n = new NoteDTO();
    expect(n.getFinalPath()).toBe("/.md");
  });

  it("keeps a target folder that has no trailing slash unchanged", () => {
    const n = new NoteDTO();
    n.setTargetFolder("Notes/Inbox");
    expect(n.getTargetFolder()).toBe("Notes/Inbox");
  });

  it("returns undefined for a path or element at an unset position", () => {
    const n = new NoteDTO();
    expect(n.getPath(5)).toBeUndefined();
    expect(n.getElement(5)).toBeUndefined();
  });

  it("ignores an empty-string path", () => {
    const n = new NoteDTO();
    n.addPath("", 0);
    expect(n.getPaths().size).toBe(0);
  });

  it("stores a final element and treats an undefined element as a no-op", () => {
    const n = new NoteDTO();
    n.addFinalElement({ type: "t", id: "i", result: "r" } as any, 0);
    n.addFinalElement(undefined, 1);
    expect(n.getElement(0)).toMatchObject({ type: "t", result: "r" });
    expect(n.getElements().size).toBe(1);
  });

  it("deletePos keeps positions strictly below the cut for both paths and actions", () => {
    const n = new NoteDTO();
    n.addPath("a", 0).addPath("b", 1).addPath("c", 2);
    n.addAction({ type: "t", id: "0" } as any, "r0", 0);
    n.addAction({ type: "t", id: "2" } as any, "r2", 2);
    n.deletePos(2);
    expect([...n.getPaths().keys()].sort()).toEqual([0, 1]);
    expect([...n.getElements().keys()]).toEqual([0]);
    expect(n.getElement(0)).toMatchObject({ result: "r0" });
  });

  it("exposes a fluent (this-returning) setter chain", () => {
    const n = new NoteDTO();
    expect(n.setTitle("x").setTargetFolder("f").setPattern("p")).toBe(n);
  });
});

describe("NoteDTO connection links", () => {
  it("records connection links in insertion order", () => {
    const n = new NoteDTO();
    n.addLink("First note").addLink("Second note");
    expect(n.getLinks()).toEqual(["First note", "Second note"]);
  });

  it("de-duplicates repeated links", () => {
    const n = new NoteDTO();
    n.addLink("Repeat").addLink("Repeat");
    expect(n.getLinks()).toEqual(["Repeat"]);
  });

  it("ignores empty link names", () => {
    const n = new NoteDTO();
    n.addLink("");
    expect(n.getLinks()).toEqual([]);
  });

  it("drops links at or after a position on deletePos (kept in sync with steps)", () => {
    const n = new NoteDTO();
    n.addLink("Kept").addLink("Dropped");
    n.addPath("a", 0).addPath("b", 1);
    n.deletePos(1);
    // links are session-scoped, not position-keyed, so they survive step navigation
    expect(n.getLinks()).toEqual(["Kept", "Dropped"]);
  });
});

describe("NoteDTO.lockTargetFolder", () => {
  it("sets the folder and locks it", () => {
    const n = new NoteDTO();
    n.lockTargetFolder("vault/current");
    expect(n.getTargetFolder()).toBe("vault/current");
    expect(n.isTargetFolderLocked()).toBe(true);
  });

  it("prevents subsequent setTargetFolder calls from overwriting", () => {
    const n = new NoteDTO();
    n.lockTargetFolder("locked-folder");
    n.setTargetFolder("step-folder");
    expect(n.getTargetFolder()).toBe("locked-folder");
  });

  it("strips a trailing slash from the locked path", () => {
    const n = new NoteDTO();
    n.lockTargetFolder("notes/");
    expect(n.getTargetFolder()).toBe("notes");
  });

  it("is a no-op for an empty path", () => {
    const n = new NoteDTO();
    n.setTargetFolder("step-folder");
    n.lockTargetFolder("");
    expect(n.isTargetFolderLocked()).toBe(false);
    expect(n.getTargetFolder()).toBe("step-folder");
  });
});
