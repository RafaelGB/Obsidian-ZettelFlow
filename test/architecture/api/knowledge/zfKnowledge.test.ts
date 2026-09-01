import { describe, it, expect } from "@jest/globals";
import type { App } from "obsidian";
import { ZfKnowledge, INDEX_NOT_READY } from "architecture/api/lib/knowledge/service/ZfKnowledge";
import type { KnowledgeApiDeps } from "architecture/api/lib/knowledge/knowledgeApi";
import type { Judgement } from "architecture/knowledge/state";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

const T0 = Date.UTC(2026, 8, 1, 10, 0, 0);

const model = buildModel([
    idea("hub.md", "permanent", [{ to: "h1.md" }, { to: "h2.md" }, { to: "h3.md" }, { to: "h4.md" }]),
    ...["h1", "h2", "h3", "h4"].map((name) => idea(`${name}.md`, "permanent", [])),
]);

const history: Judgement[] = [
    { at: T0, path: "hub.md", subject: "challenge-idea", origin: "ai", verdict: "rejected" },
];

async function api(overrides: Partial<KnowledgeApiDeps> = {}): Promise<Record<string, unknown>> {
    const deps: KnowledgeApiDeps = {
        model: () => model,
        history: () => history,
        ready: () => true,
        ...overrides,
    };
    const module = new ZfKnowledge({} as App, deps);
    await module.init();
    return module.generate_object();
}

describe("zf.knowledge hands a script the model ZettelFlow uses on itself (#350, FR-2/AC-2)", () => {
    it("answers with the live model already bound — no model argument to pass", async () => {
        const zf = await api();

        expect((zf.readyToCultivate as () => number)()).toBeGreaterThanOrEqual(0);
        expect((zf.dashboard as () => unknown)()).toBeTruthy();
        expect((zf.model as () => { size(): number })().size()).toBe(5);
    });

    it("reaches the judgement record too, so agency is queryable from a script", async () => {
        const zf = await api();

        const signals = (zf.agency as (p: string) => { total: number })("hub.md");
        expect(signals.total).toBe(1);
        expect((zf.judgements as (p: string) => unknown[])("hub.md")).toHaveLength(1);
    });

    it("takes arguments where the projection does", async () => {
        const zf = await api();

        expect((zf.neighbors as (p: string) => unknown)("hub.md")).toBeTruthy();
        expect((zf.reasoningPaths as (p: string) => unknown[])("hub.md")).toBeInstanceOf(Array);
    });

    it("reads the model per call, so a script never sees a stale graph", async () => {
        // `fnsManager` caches the built `zf` for the whole session; capturing the model at build time
        // would freeze the graph as it was when the first script ran.
        let current = buildModel([]);
        const zf = await api({ model: () => current });

        expect((zf.model as () => { size(): number })().size()).toBe(0);
        current = model;
        expect((zf.model as () => { size(): number })().size()).toBe(5);
    });
});

describe("an unbuilt index is an error, not an empty vault (#350, FR-3/AC-6)", () => {
    it("throws an identifiable error rather than answering 'nothing found'", async () => {
        const zf = await api({
            ready: () => false,
            model: () => {
                throw new Error(INDEX_NOT_READY);
            },
        });

        expect(() => (zf.debt as () => unknown)()).toThrow(INDEX_NOT_READY);
    });

    it("lets a script check first", async () => {
        const zf = await api({ ready: () => false });

        expect((zf.ready as () => boolean)()).toBe(false);
    });
});

describe("every member documents itself (#350, FR-1/AC-1)", () => {
    it("describes exactly the members it generates", async () => {
        const deps: KnowledgeApiDeps = { model: () => model, history: () => history, ready: () => true };
        const module = new ZfKnowledge({} as App, deps);
        await module.init();

        const generated = Object.keys(await module.generate_object()).sort();
        const described = module.describe().map((doc) => doc.path.replace("zf.knowledge.", "")).sort();

        expect(described).toEqual(generated);
    });

    it("namespaces every description under zf.knowledge", async () => {
        const module = new ZfKnowledge({} as App, { model: () => model, history: () => history, ready: () => true });
        await module.init();

        for (const doc of module.describe()) {
            expect(doc.path.startsWith("zf.knowledge.")).toBe(true);
            expect(doc.signature).toMatch(/=>/);
        }
    });
});
