import { describe, it, expect } from "@jest/globals";
import { HookBaselines } from "hooks/utils/HookBaselines";
import { changedHookProperties } from "hooks/utils/CompareUtils";

type Notes = Array<[string, Record<string, unknown> | undefined]>;

function changes(baselines: HookBaselines, path: string, now: Record<string, unknown>, watched: string[]) {
  return changedHookProperties(watched, baselines.previous(path, now), now);
}

describe("HookBaselines", () => {
  it("fires when a watched property appears on a note that was never opened", () => {
    // The note was already open at startup (or edited from a Base): no file-open, no baseline.
    const baselines = new HookBaselines();
    baselines.seed(["status"], () => [["Task.md", { title: "x" }]] as Notes);

    expect(changes(baselines, "Task.md", { title: "x", status: "✅ resolved" }, ["status"])).toEqual(["status"]);
  });

  it("fires for a note with no frontmatter at all", () => {
    const baselines = new HookBaselines();
    baselines.seed(["status"], () => [["Bare.md", undefined]] as Notes);

    expect(changes(baselines, "Bare.md", { status: "✅ resolved" }, ["status"])).toEqual(["status"]);
  });

  it("does not fire when only the body changed", () => {
    const baselines = new HookBaselines();
    baselines.seed(["status"], () => [["Task.md", { status: "✅ resolved" }]] as Notes);

    expect(changes(baselines, "Task.md", { status: "✅ resolved" }, ["status"])).toEqual([]);
  });

  it("treats a note it never saw as unchanged, so creating a note does not fire", () => {
    const baselines = new HookBaselines();
    baselines.seed(["status"], () => [] as Notes);

    expect(changes(baselines, "New.md", { status: "📃 Backlog" }, ["status"])).toEqual([]);
  });

  it("diffs the next change against what it remembered", () => {
    const baselines = new HookBaselines();
    baselines.seed(["status"], () => [["Task.md", {}]] as Notes);
    baselines.remember("Task.md", { status: "📃 Backlog" });

    expect(changes(baselines, "Task.md", { status: "✅ resolved" }, ["status"])).toEqual(["status"]);
  });

  it("enumerates the vault only for properties it has not seeded yet", () => {
    const baselines = new HookBaselines();
    let reads = 0;
    const notes = () => {
      reads++;
      return [["Task.md", { status: "a", priority: "high" }]] as Notes;
    };
    baselines.seed(["status"], notes);
    baselines.seed(["status"], notes);
    expect(reads).toBe(1);

    // A hook added later learns its property without losing what the baseline knew.
    baselines.remember("Task.md", { status: "b" });
    baselines.seed(["status", "priority"], notes);
    expect(reads).toBe(2);
    expect(baselines.previous("Task.md", {})).toEqual({ status: "b", priority: "high" });
  });

  it("follows renames and forgets deleted notes", () => {
    const baselines = new HookBaselines();
    baselines.seed(["status"], () => [["Old.md", { status: "a" }]] as Notes);

    baselines.rename("Old.md", "New.md");
    expect(changes(baselines, "New.md", { status: "b" }, ["status"])).toEqual(["status"]);

    baselines.forget("New.md");
    expect(changes(baselines, "New.md", { status: "c" }, ["status"])).toEqual([]);
  });

  it("keeps its own copy, so Obsidian mutating the cache in place cannot hide a change", () => {
    const baselines = new HookBaselines();
    const live: Record<string, unknown> = { status: "a" };
    baselines.seed(["status"], () => [["Task.md", live]] as Notes);
    live.status = "b";

    expect(changes(baselines, "Task.md", live, ["status"])).toEqual(["status"]);
  });
});
