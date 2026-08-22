import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { ZComponentsManager } from "starters/services/ZComponentsManager";
import { PluginComponent, log } from "architecture";

/**
 * Regression (#268 view-registration bug): a single component whose `onLoad` throws must NOT abort
 * loading the rest — the unguarded `forEach` used to bubble up to `Plugin.onload`, leaving the
 * surfaces unregistered so every surface rendered as Obsidian's "plugin no longer active" placeholder.
 */
class FakeComponent extends PluginComponent {
    constructor(private readonly run: () => void, private readonly onDown: () => void = () => undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        super(undefined as any);
    }
    onLoad(): void { this.run(); }
    onUnload(): void { this.onDown(); }
}

describe("ZComponentsManager isolates a failing component", () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        ZComponentsManager.unloadComponents(); // reset the singleton's list between tests
    });

    it("loads every other component when one onLoad throws, and logs the failure", () => {
        jest.spyOn(log, "error").mockImplementation(() => undefined);
        const loaded: string[] = [];
        ZComponentsManager.registerComponent(new FakeComponent(() => loaded.push("a")));
        ZComponentsManager.registerComponent(new FakeComponent(() => { throw new Error("boom"); }));
        ZComponentsManager.registerComponent(new FakeComponent(() => loaded.push("c")));

        expect(() => ZComponentsManager.loadComponents()).not.toThrow();

        expect(loaded).toEqual(["a", "c"]);
        expect(log.error).toHaveBeenCalledTimes(1);
    });

    it("unloads every other component when one onUnload throws", () => {
        jest.spyOn(log, "error").mockImplementation(() => undefined);
        const down: string[] = [];
        ZComponentsManager.registerComponent(new FakeComponent(() => undefined, () => down.push("a")));
        ZComponentsManager.registerComponent(new FakeComponent(() => undefined, () => { throw new Error("boom"); }));
        ZComponentsManager.registerComponent(new FakeComponent(() => undefined, () => down.push("c")));

        expect(() => ZComponentsManager.unloadComponents()).not.toThrow();

        expect(down).toEqual(["a", "c"]);
        expect(log.error).toHaveBeenCalledTimes(1);
    });
});
