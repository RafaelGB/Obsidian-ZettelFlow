import { describe, it, expect, jest } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { afterVaultLoad } from "architecture/plugin/afterVaultLoad";

/**
 * A view Obsidian restores at startup opens before the vault has finished loading, and Obsidian
 * announces every existing file with a `create` while it loads (#795). A view that listens then must
 * not recompute once per file of that flood.
 */
describe("afterVaultLoad (#795)", () => {
    it("ignores events while the layout is not ready, and passes them through after", () => {
        const workspace = { layoutReady: false };
        const handler = jest.fn();
        const guarded = afterVaultLoad({ workspace }, handler);

        guarded("a.md");
        expect(handler).not.toHaveBeenCalled();

        workspace.layoutReady = true;
        guarded("b.md", "old.md");
        expect(handler).toHaveBeenCalledWith("b.md", "old.md");
    });

    it("passes events through when the host cannot say (a test double, a partial app)", () => {
        const handler = jest.fn();
        afterVaultLoad({}, handler)("a.md");
        afterVaultLoad(undefined, handler)("b.md");
        expect(handler).toHaveBeenCalledTimes(2);
    });
});

const views = [
    ["Home", ["home", "HomeModeRenderer.ts"]],
    ["Library", ["library", "LibraryView.ts"]],
    ["Reader alongside", ["reader", "readerAlongside.ts"]],
] as const;

describe("the views restored at startup skip the vault-load flood (#795, AC-6)", () => {
    it.each(views)("%s hears `create` only through afterVaultLoad", (_name, parts) => {
        const src = readFileSync(join(__dirname, "..", "..", "..", "src", "architecture", "components", "core", ...parts), "utf8");
        const creates = src.match(/\.on\("create",[^\n]*/g) ?? [];
        expect(creates.length).toBeGreaterThan(0);
        for (const line of creates) expect(line).toContain("afterVaultLoad(");
    });
});
