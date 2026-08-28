import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { ZComponentsManager } from "starters/services/ZComponentsManager";
import { log } from "architecture";
import type { PluginComponent } from "architecture";

/** A minimal component: the manager only calls onLoad()/onUnload(). */
function fake(calls: string[], name: string, throwOnUnload = false): PluginComponent {
    return {
        onLoad: () => void calls.push(`load:${name}`),
        onUnload: () => {
            calls.push(`unload:${name}`);
            if (throwOnUnload) throw new Error("boom");
        },
    } as unknown as PluginComponent;
}

describe("ZComponentsManager teardown (#316 S4)", () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        ZComponentsManager.unloadComponents(); // reset the singleton's registry
    });

    it("unloads every component, isolates a throwing onUnload, and clears the registry", () => {
        const errSpy = jest.spyOn(log, "error").mockImplementation(() => undefined);
        const calls: string[] = [];
        ZComponentsManager.registerComponent(fake(calls, "a"));
        ZComponentsManager.registerComponent(fake(calls, "b", true)); // throws on unload
        ZComponentsManager.registerComponent(fake(calls, "c"));

        ZComponentsManager.loadComponents();
        ZComponentsManager.unloadComponents();

        // Every component loaded and unloaded, in order; the throwing one did not abort the rest.
        expect(calls).toEqual(["load:a", "load:b", "load:c", "unload:a", "unload:b", "unload:c"]);
        expect(errSpy).toHaveBeenCalledTimes(1); // the throwing component was logged, not rethrown

        // The registry is cleared — a second unload does nothing (no leaked listeners on re-enable).
        calls.length = 0;
        ZComponentsManager.unloadComponents();
        expect(calls).toEqual([]);
    });
});
