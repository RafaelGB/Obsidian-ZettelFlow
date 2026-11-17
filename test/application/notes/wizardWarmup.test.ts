import { describe, it, expect, jest } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { warmScriptApi } from "application/notes/warmScriptApi";

/**
 * The wizard prepares `zf` while you answer it (#904). Built lazily by the first script step, the
 * API's build sat behind "Creating the note… 6/11" for half a minute on a cold start.
 */
describe("the wizard warms the script API (#904)", () => {
    it("starts the build at once, without waiting for it", () => {
        let finish: () => void = () => undefined;
        const build = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)));

        const result = warmScriptApi(build);

        expect(build).toHaveBeenCalledTimes(1);
        expect(result).toBeUndefined();
        finish();
    });

    it("keeps a failed build to itself: the step that needs zf will try again", async () => {
        const build = jest.fn(() => Promise.reject(new Error("bad library folder")));

        expect(() => warmScriptApi(build)).not.toThrow();
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

    it("is called when the wizard opens", () => {
        const modal = readFileSync(
            join(__dirname, "..", "..", "..", "src", "zettelkasten", "modals", "SelectorMenuModal.ts"),
            "utf8"
        );
        const onOpen = modal.slice(modal.indexOf("onOpen(): void {"));
        expect(onOpen.slice(0, onOpen.indexOf("\n    }\n"))).toMatch(/warmScriptApi\(/);
    });
});
