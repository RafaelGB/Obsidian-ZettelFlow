import { describe, it, expect, jest } from "@jest/globals";

import { crystallizeThroughFlow, type ThroughFlowDeps } from "architecture/plugin/thinking/crystallizeThroughFlow";
import { planCrystallization, renderCrystallized } from "application/thinking/crystallize";
import { newThought } from "application/thinking/thought";
import type { CrystallizeSeed } from "application/thinking/crystallize";

const plan = planCrystallization([
    newThought({ text: "first thought", id: "t1", at: 1 }),
    newThought({ text: "second thought", id: "t2", at: 2 }),
])!;

/** Fakes for the flow, the wizard and the log; `build` plays the wizard reaching a note. */
function harness(load: () => Promise<unknown> = async () => ({ canvasPath: "Flows/Think.canvas" })) {
    let built: ((path: string) => void) | undefined;
    const seen: { seed?: CrystallizeSeed } = {};
    const deps: ThroughFlowDeps = {
        loadFlow: jest.fn(load) as never,
        openWizard: jest.fn((_flow, seed: CrystallizeSeed, onBuilt: (path: string) => void) => {
            seen.seed = seed;
            built = onBuilt;
        }) as never,
        record: jest.fn(),
    };
    const onDone = jest.fn();
    return { deps, onDone, seen, build: (path: string) => built?.(path) };
}

describe("crystallize through a flow (#712)", () => {
    it("opens the flow with the title you accepted and the content crystallizing writes", async () => {
        const h = harness();
        const result = await crystallizeThroughFlow({ plan, title: "My title", body: "edited", flowPath: "Flows/Think.canvas", onDone: h.onDone }, h.deps);
        expect(result).toBe("opened");
        expect(h.seen.seed?.title).toBe("My title");
        expect(h.seen.seed?.content).toBe(renderCrystallized(plan, "edited", "Born from", (count) => `and ${count} more`));
    });

    it("records the human verdict only when the note is built, then hands its path back", async () => {
        const h = harness();
        await crystallizeThroughFlow({ plan, title: "t", body: "b", flowPath: "Flows/Think.canvas", onDone: h.onDone }, h.deps);
        expect(h.deps.record).not.toHaveBeenCalled();
        h.build("Crystallized/t.md");
        expect(h.deps.record).toHaveBeenCalledWith("Crystallized/t.md", plan);
        expect(h.onDone).toHaveBeenCalledWith("Crystallized/t.md");
    });

    it("a wizard closed before it builds leaves no verdict and nothing done", async () => {
        const h = harness();
        await crystallizeThroughFlow({ plan, title: "t", body: "b", flowPath: "Flows/Think.canvas", onDone: h.onDone }, h.deps);
        expect(h.deps.record).not.toHaveBeenCalled();
        expect(h.onDone).not.toHaveBeenCalled();
    });

    it("a flow that cannot be opened fails out loud: nothing written, nothing recorded, no fallback", async () => {
        const h = harness(async () => {
            throw new Error("missing canvas");
        });
        const result = await crystallizeThroughFlow({ plan, title: "t", body: "b", flowPath: "Gone.canvas", onDone: h.onDone }, h.deps);
        expect(result).toBe("failed");
        expect(h.deps.openWizard).not.toHaveBeenCalled();
        expect(h.deps.record).not.toHaveBeenCalled();
        expect(h.onDone).not.toHaveBeenCalled();
    });
});

describe("a flow's note goes back to its paragraph too (#751 P6)", () => {
    it("adds the passages' source entries once the note is built, never before", async () => {
        const passage = planCrystallization([
            {
                id: "h1",
                at: 1,
                text: "",
                links: [],
                about: "Books/tfs.epub",
                quote: { exact: "A general law of least effort applies", prefix: "", suffix: "" },
                locator: { at: 6, label: "3 · The lazy controller", chapter: "OEBPS/ch03.xhtml" },
            },
        ])!;
        const h = harness();
        const addSources = jest.fn(async () => true);
        const deps = { ...h.deps, addSources };
        await crystallizeThroughFlow({ plan: passage, title: "t", body: "b", flowPath: "Flows/Think.canvas", onDone: h.onDone }, deps);
        // The seed carries no properties block: the template owns the frontmatter.
        expect(h.seen.seed?.content.startsWith("---")).toBe(false);
        expect(addSources).not.toHaveBeenCalled();
        h.build("Crystallized/t.md");
        expect(addSources).toHaveBeenCalledWith("Crystallized/t.md", [expect.stringMatching(/^\[\[Books\/tfs\.epub#OEBPS\/ch03\.xhtml\|tfs\]\] · 3 · The lazy controller · “‹A general law/)]);
    });

    it("a note with no passage gets no property write", async () => {
        const h = harness();
        const addSources = jest.fn(async () => true);
        await crystallizeThroughFlow({ plan, title: "t", body: "b", flowPath: "Flows/Think.canvas", onDone: h.onDone }, { ...h.deps, addSources });
        h.build("Crystallized/t.md");
        expect(addSources).not.toHaveBeenCalled();
    });
});
