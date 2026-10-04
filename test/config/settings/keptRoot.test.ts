import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { keptRoot } from "config/modals/keptRoot";

/**
 * A React root in a settings row, under Obsidian's re-render order (#659 runtime audit): the row's
 * old cleanup runs first, then `render` on the same container. The root must survive that, and go
 * when the tab really closes.
 */
describe("keptRoot", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    function setup() {
        const roots: { container: unknown; unmounted: number }[] = [];
        const mount = keptRoot((container) => {
            const root = { container, unmounted: 0, unmount: () => (root.unmounted += 1) };
            roots.push(root);
            return root;
        });
        return { mount, roots };
    }

    it("creates one root, and keeps it across the cleanup-then-render of an update", () => {
        const { mount, roots } = setup();
        const container = {} as HTMLElement;
        const firstCleanup = mount(container);
        firstCleanup(); // Obsidian: the old cleanup first…
        mount(container); // …then render again on the same container.
        jest.advanceTimersByTime(10);
        expect(roots).toHaveLength(1);
        expect(roots[0].unmounted).toBe(0);
    });

    it("unmounts when nothing renders it again — the tab was closed", () => {
        const { mount, roots } = setup();
        mount({} as HTMLElement)();
        jest.advanceTimersByTime(10);
        expect(roots[0].unmounted).toBe(1);
    });

    it("replaces the root when a fresh render brings a new container", () => {
        const { mount, roots } = setup();
        mount({} as HTMLElement);
        mount({} as HTMLElement);
        expect(roots).toHaveLength(2);
        expect(roots[0].unmounted).toBe(1);
        expect(roots[1].unmounted).toBe(0);
    });

    it("never unmounts twice from a doubled cleanup", () => {
        const { mount, roots } = setup();
        const cleanup = mount({} as HTMLElement);
        cleanup();
        cleanup();
        jest.advanceTimersByTime(10);
        expect(roots[0].unmounted).toBe(1);
    });
});
