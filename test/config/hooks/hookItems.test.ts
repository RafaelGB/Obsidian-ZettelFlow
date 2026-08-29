import { describe, it, expect } from "@jest/globals";
import {
  toItems,
  toRecord,
  addHook,
  updateHook,
  deleteHook,
  reorderHooks,
  type HookItem,
} from "config/modals/handlers/hooks/hookItems";

const base: HookItem[] = [
  { property: "status", settings: { script: "a" } },
  { property: "rating", settings: { script: "b" } },
];

describe("hookItems — the add-hook regression is fixed at the logic level (#327)", () => {
  it("addHook appends a new, enabled hook without touching the others", () => {
    const next = addHook(base, "due");
    expect(next).toHaveLength(3);
    expect(next.map((i) => i.property)).toEqual(["status", "rating", "due"]);
    expect(next[2].settings).toEqual({ script: "", enabled: true });
    // existing entries preserved by reference (no needless remount / no data loss)
    expect(next[0]).toBe(base[0]);
    expect(next[1]).toBe(base[1]);
  });

  it("addHook is a no-op (same reference) for a duplicate or blank property", () => {
    expect(addHook(base, "status")).toBe(base);
    expect(addHook(base, "")).toBe(base);
  });

  it("round-trips through the persisted record shape, preserving order + settings", () => {
    const record = toRecord(base);
    expect(record).toEqual({ status: { script: "a" }, rating: { script: "b" } });
    expect(toItems(record).map((i) => i.property)).toEqual(["status", "rating"]);
    expect(toItems(undefined)).toEqual([]);
  });

  it("toItems tolerates a missing settings entry", () => {
    const items = toItems({ ghost: undefined as never });
    expect(items[0].settings).toEqual({ script: "" });
  });

  it("updateHook patches one hook's settings and leaves the rest", () => {
    const next = updateHook(base, "status", { enabled: false, condition: "event.newValue === 'done'" });
    expect(next[0].settings).toEqual({ script: "a", enabled: false, condition: "event.newValue === 'done'" });
    expect(next[1]).toBe(base[1]);
  });

  it("deleteHook removes exactly the named hook", () => {
    expect(deleteHook(base, "status").map((i) => i.property)).toEqual(["rating"]);
    expect(deleteHook(base, "missing")).toHaveLength(2);
  });

  it("reorderHooks moves an item and no-ops out of range", () => {
    expect(reorderHooks(base, 0, 1).map((i) => i.property)).toEqual(["rating", "status"]);
    expect(reorderHooks(base, 0, 0)).toBe(base);
    expect(reorderHooks(base, -1, 5)).toBe(base);
  });
});
