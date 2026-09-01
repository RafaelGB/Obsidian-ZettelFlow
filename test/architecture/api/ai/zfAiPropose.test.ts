import { describe, it, expect, jest } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";
import type { App } from "obsidian";
import { ZfAi } from "architecture/api/lib/ai/service/ZfAi";
import type { proposeCompletion } from "actions/ai/aiActionCore";

// test/architecture/api/ai → 4 ups → repo root
const SRC = join(__dirname, "..", "..", "..", "..", "src");
const AI_CORE = join("actions", "ai", "aiActionCore.ts");

type Propose = typeof proposeCompletion;
type Outcome = Awaited<ReturnType<Propose>>;

async function zfAi(outcome: Outcome) {
    const propose = jest.fn(async () => outcome) as unknown as Propose;
    const module = new ZfAi({} as App, propose, () => "ready");
    await module.init();
    const api = await module.generate_object();
    return { api, propose: propose as unknown as jest.Mock };
}

describe("zf.ai.propose is the §XII-safe path a script gets (#350, FR-4/AC-4)", () => {
    it("returns what you accepted", async () => {
        const { api } = await zfAi({ verdict: "accepted", text: "the model's answer" });

        await expect((api.propose as (p: string) => Promise<string | null>)("why?")).resolves.toBe("the model's answer");
    });

    it("returns your edit, not the model's text", async () => {
        const { api } = await zfAi({ verdict: "modified", text: "my own wording" });

        await expect((api.propose as (p: string) => Promise<string | null>)("why?")).resolves.toBe("my own wording");
    });

    it("returns null when you reject it — a script gets nothing to write", async () => {
        const { api } = await zfAi({ verdict: "rejected", text: "" });

        await expect((api.propose as (p: string) => Promise<string | null>)("why?")).resolves.toBeNull();
    });

    it("returns null when you dismiss the dialog", async () => {
        const { api } = await zfAi(null);

        await expect((api.propose as (p: string) => Promise<string | null>)("why?")).resolves.toBeNull();
    });

    it("carries the note through, so the verdict can be recorded against an idea", async () => {
        const { api, propose } = await zfAi({ verdict: "accepted", text: "x" });

        await (api.propose as (p: string, o: unknown) => Promise<string | null>)("why?", {
            path: "ideas/atomicity.md",
            subject: "my-script",
        });

        expect(propose).toHaveBeenCalledWith("why?", { subject: "my-script", path: "ideas/atomicity.md" });
    });

    it("defaults the subject rather than recording an anonymous verdict", async () => {
        const { api, propose } = await zfAi({ verdict: "accepted", text: "x" });

        await (api.propose as (p: string) => Promise<string | null>)("why?");

        expect(propose).toHaveBeenCalledWith("why?", { subject: "script", path: null });
    });

    it("lets a script check availability before paying for a call", async () => {
        const { api } = await zfAi(null);

        expect((api.available as () => boolean)()).toBe(true);
    });
});

describe("there is no route to the provider that skips the verdict (#350, AC-5)", () => {
    function sourceFiles(dir: string): string[] {
        const out: string[] = [];
        for (const entry of readdirSync(dir)) {
            const full = join(dir, entry);
            if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
            else if (/\.tsx?$/.test(entry)) out.push(full);
        }
        return out;
    }

    /**
     * The whole point of `zf.ai.propose` is that the convenient path is the principled one. If a second
     * module could call `complete()` directly, a script author would eventually be handed the easier,
     * silent one — and §XII would have a hole through the widest door in the product.
     */
    it("calls the provider from exactly one module", () => {
        const offenders = sourceFiles(SRC)
            .filter((file) => /getProvider\(\)\s*\.\s*complete\(/.test(readFileSync(file, "utf8")))
            .map((file) => relative(SRC, file).split(sep).join("/"));

        expect(offenders).toEqual([AI_CORE.split(sep).join("/")]);
    });

    it("offers no raw-completion member on zf.ai", async () => {
        const { api } = await zfAi(null);

        expect(Object.keys(api).sort()).toEqual(["available", "propose"]);
    });
});
