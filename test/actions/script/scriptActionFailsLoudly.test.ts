import { describe, it, expect, jest } from "@jest/globals";
import type { ExecuteInfo } from "architecture/api";
import { runScriptAction, type ScriptRunDeps } from "actions/script/scriptActionCore";
import { SCRIPT_ACTION_BINDINGS, bindingNames } from "architecture/api/bindings/scriptBindings";

function fakeInfo(code: string) {
    const written: string[] = [];
    const context: Record<string, unknown> = {};
    const info = {
        element: { type: "script", id: "script", code },
        content: { add: (text: string) => written.push(text), get: () => "body" },
        note: { getFinalPath: () => "ideas/atomicity.md" },
        context,
    } as unknown as ExecuteInfo;
    return { info, written, context };
}

/** A recorder standing in for the `Notice`, plus the two shared bindings. */
function deps() {
    const notices: string[] = [];
    const dep: ScriptRunDeps = {
        values: async () => ({ zf: { internal: { vault: {} } }, app: { vault: {} } }),
        notify: (message) => notices.push(message),
    };
    return { notices, dep };
}

describe("a failing script action is never silent (#349, FR-1/AC-1)", () => {
    it("surfaces a thrown error to the user", async () => {
        const { info } = fakeInfo(`throw new Error("boom");`);
        const { notices, dep } = deps();

        await runScriptAction(info, dep);

        expect(notices).toHaveLength(1);
        expect(notices[0]).toContain("boom");
    });

    it("surfaces a syntax error the same way, rather than dying on construction", async () => {
        const { info } = fakeInfo(`const = ;`);
        const { notices, dep } = deps();

        await runScriptAction(info, dep);

        expect(notices).toHaveLength(1);
    });

    it("never throws out of execute — one bad step must not abort the whole build", async () => {
        const { info } = fakeInfo(`throw new Error("boom");`);
        const { dep } = deps();

        await expect(runScriptAction(info, dep)).resolves.toBeUndefined();
    });

    it("stays quiet and does its work when the script succeeds", async () => {
        const { info, written } = fakeInfo(`content.add("hello");`);
        const { notices, dep } = deps();

        await runScriptAction(info, dep);

        expect(written).toEqual(["hello"]);
        expect(notices).toEqual([]);
    });
});

describe("what a script receives is what it was promised (#349, FR-2)", () => {
    it("puts every declared binding in scope, app included", async () => {
        const names = bindingNames(SCRIPT_ACTION_BINDINGS);
        const { info, context } = fakeInfo(
            `context.seen = [${names.map((n) => `typeof ${n}`).join(", ")}];`
        );
        const { notices, dep } = deps();

        await runScriptAction(info, dep);

        expect(notices).toEqual([]);
        expect(context.seen).not.toContain("undefined");
    });

    it("reaches app without the deprecated global — the injected value is the one in scope", async () => {
        const { info, context } = fakeInfo(`context.marker = app.marker;`);
        const { dep } = deps();
        dep.values = async () => ({ zf: {}, app: { marker: "injected" } });

        await runScriptAction(info, dep);

        expect(context.marker).toBe("injected");
    });

    it("awaits an async script before moving on", async () => {
        const { info, context } = fakeInfo(
            `await new Promise((r) => setTimeout(r, 1)); context.done = true;`
        );
        const { dep } = deps();

        await runScriptAction(info, dep);

        expect(context.done).toBe(true);
    });
});
