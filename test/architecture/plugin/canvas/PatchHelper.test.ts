import { describe, it, expect, jest } from "@jest/globals";
import type { Plugin } from "obsidian";
import PatchHelper from "architecture/plugin/canvas/extensions/utils/PatchHelper";

/** A minimal fake plugin — PatchHelper only calls `register(uninstaller)`. */
function fakePlugin(): { plugin: Plugin; registered: unknown[] } {
    const registered: unknown[] = [];
    const plugin = { register: (fn: unknown) => registered.push(fn) } as unknown as Plugin;
    return { plugin, registered };
}

describe("PatchHelper — fail-soft patching (#304)", () => {
    it("returns null for a missing target instead of throwing", () => {
        const { plugin } = fakePlugin();
        expect(PatchHelper.patch(plugin, undefined, {})).toBeNull();
    });

    it("returns null (no throw) when an OverrideExisting method is absent", () => {
        const { plugin, registered } = fakePlugin();
        const target = { other: () => 1 };
        const result = PatchHelper.patch(plugin, target, {
            missing: PatchHelper.OverrideExisting<typeof target & { missing: () => number }, "missing", number>(
                (next) => function (this: unknown) { return next.call(this); }
            ),
        } as never);
        expect(result).toBeNull();
        expect(registered).toHaveLength(0); // never reached the install step
    });

    it("installs a wrapper for an existing method and registers an uninstaller", () => {
        const { plugin, registered } = fakePlugin();
        const target = { greet: (name: string) => `hi ${name}` };
        const spy = jest.fn();
        const result = PatchHelper.patch(plugin, target, {
            greet: (next) => function (this: unknown, name: string) {
                spy();
                return `[${next.call(this, name)}]`;
            },
        } as never);
        expect(result).toBe(target);
        expect(registered).toHaveLength(1); // an uninstaller was registered
        expect(target.greet("a")).toBe("[hi a]");
        expect(spy).toHaveBeenCalledTimes(1);
    });
});
