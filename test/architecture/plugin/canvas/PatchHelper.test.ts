import { describe, it, expect, jest } from "@jest/globals";
import PatchHelper from "architecture/plugin/canvas/extensions/utils/PatchHelper";

/**
 * PatchHelper must fail SOFT: when the target is missing or a required
 * (OverrideExisting) method does not exist, it must NOT throw — it returns null
 * and does not register an uninstaller — so the caller can degrade gracefully
 * if Obsidian's internals change (issue #91).
 */
describe("PatchHelper.patch (fail-soft)", () => {
  const fakePlugin = () => ({ register: jest.fn() }) as any;

  it("patches an existing method, returns the object and registers an uninstaller", () => {
    const plugin = fakePlugin();
    const target = {
      greet(this: any): string {
        return "hi";
      },
    };

    const result = PatchHelper.patch(plugin, target, {
      greet: PatchHelper.OverrideExisting<typeof target, "greet", string>(
        (next) =>
          function (this: any, ...args: any[]): string {
            return "patched:" + next.call(this, ...args);
          }
      ),
    });

    expect(result).toBe(target);
    expect(target.greet()).toBe("patched:hi");
    expect(plugin.register).toHaveBeenCalledTimes(1);
  });

  it("returns null and does NOT throw when a required method is missing", () => {
    const plugin = fakePlugin();
    const target: { greet?: () => string } = {};

    let result: unknown;
    expect(() => {
      result = PatchHelper.patch(plugin, target as any, {
        greet: PatchHelper.OverrideExisting<any, any, any>(
          (next: any) =>
            function (this: any, ...args: any[]) {
              return next.call(this, ...args);
            }
        ),
      } as any);
    }).not.toThrow();

    expect(result).toBeNull();
    expect(plugin.register).not.toHaveBeenCalled();
  });

  it("returns null when the target is undefined", () => {
    const plugin = fakePlugin();
    const result = PatchHelper.patch(plugin, undefined, {});
    expect(result).toBeNull();
    expect(plugin.register).not.toHaveBeenCalled();
  });
});
