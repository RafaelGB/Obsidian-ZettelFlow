import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import type { ExecuteInfo } from "architecture/api";
import type { AiActionElement } from "zettelkasten";
import type { JudgementEntry } from "architecture/plugin/judgement/JudgementLog";

const complete = jest.fn<(prompt: string) => Promise<string>>();
const service = {
    gate: jest.fn<() => string>(() => "ready"),
    config: jest.fn(() => ({ enabled: true, endpoint: "https://x", apiKey: "k", model: "m" })),
    getProvider: () => ({ complete }),
};

jest.mock("architecture/ai/AiService", () => ({ AiService: { getInstance: () => service } }));

// Imported after the mock so the module under test picks it up.
import { runAiActionFromPrompt, type AiActionDeps } from "actions/ai/aiActionCore";

const NOTE = "ideas/atomicity.md";

function fakeInfo(silent = false) {
    const frontmatter: Record<string, unknown> = {};
    const info = {
        element: { type: "challenge-idea" },
        content: { addFrontMatter: (o: Record<string, unknown>) => Object.assign(frontmatter, o), get: () => "body" },
        note: { getFinalPath: () => NOTE },
        context: {} as Record<string, unknown>,
        silent,
    } as unknown as ExecuteInfo;
    return { info, frontmatter };
}

const el = { type: "challenge-idea", id: "challenge-idea", key: "challenge", zone: "frontmatter" } as unknown as AiActionElement;
const spec = { notice: () => "done" };

/** A reviewer that always answers the same way, plus a recorder that captures the verdicts. */
function deps(answer: Awaited<ReturnType<AiActionDeps["review"]>>) {
    const recorded: JudgementEntry[] = [];
    const review = jest.fn(async () => answer);
    return { recorded, dep: { review, record: (entry: JudgementEntry) => recorded.push(entry) } as AiActionDeps, review };
}

describe("agency-aware AI: the model proposes, the user commits (#337, §XII)", () => {
    beforeEach(() => {
        service.gate.mockReturnValue("ready");
        complete.mockResolvedValue("This idea assumes atomicity is always desirable.");
    });

    it("writes nothing at all when the proposal is rejected (AC-2)", async () => {
        const { info, frontmatter } = fakeInfo();
        const { recorded, dep } = deps({ verdict: "rejected", text: "" });

        await runAiActionFromPrompt(info, el, "prompt", spec, dep);

        expect(frontmatter).toEqual({});
        expect(info.context).toEqual({});
        expect(recorded).toEqual([
            { path: NOTE, subject: "challenge-idea", origin: "ai", verdict: "rejected" },
        ]);
    });

    it("writes the completion when it is accepted", async () => {
        const { info, frontmatter } = fakeInfo();
        const { recorded, dep } = deps({ verdict: "accepted", text: "This idea assumes atomicity is always desirable." });

        await runAiActionFromPrompt(info, el, "prompt", spec, dep);

        expect(frontmatter.challenge).toBe("This idea assumes atomicity is always desirable.");
        expect(recorded[0].verdict).toBe("accepted");
    });

    it("writes the user's text, not the model's, when it is edited", async () => {
        const { info, frontmatter } = fakeInfo();
        const { dep, recorded } = deps({ verdict: "modified", text: "my own counterargument" });

        await runAiActionFromPrompt(info, el, "prompt", spec, dep);

        expect(frontmatter.challenge).toBe("my own counterargument");
        expect(recorded[0].verdict).toBe("modified");
    });

    it("runs the action's transform over the reviewed text, so an edit is parsed too", async () => {
        const { info, frontmatter } = fakeInfo();
        const { dep } = deps({ verdict: "modified", text: "one\ntwo" });

        await runAiActionFromPrompt(info, el, "prompt", { ...spec, transform: (raw: string) => raw.split("\n") }, dep);

        expect(frontmatter.challenge).toEqual(["one", "two"]);
    });

    it("records nothing and writes nothing when the user dismisses the proposal", async () => {
        const { info, frontmatter } = fakeInfo();
        const { recorded, dep } = deps(null);

        await runAiActionFromPrompt(info, el, "prompt", spec, dep);

        expect(frontmatter).toEqual({});
        expect(recorded).toEqual([]);
    });

    it("never asks for a verdict it cannot act on: no call, no review when disabled", async () => {
        service.gate.mockReturnValue("disabled");
        const { info } = fakeInfo();
        const { dep, review } = deps({ verdict: "accepted", text: "x" });

        await runAiActionFromPrompt(info, el, "prompt", spec, dep);

        expect(complete).not.toHaveBeenCalled();
        expect(review).not.toHaveBeenCalled();
    });

    it("asks for no verdict when the request fails", async () => {
        complete.mockRejectedValue(new Error("network down"));
        const { info, frontmatter } = fakeInfo();
        const { dep, review } = deps({ verdict: "accepted", text: "x" });

        await runAiActionFromPrompt(info, el, "prompt", spec, dep);

        expect(review).not.toHaveBeenCalled();
        expect(frontmatter).toEqual({});
    });
});

describe("AI never runs in an automation (#337, AC-4)", () => {
    beforeEach(() => {
        service.gate.mockReturnValue("ready");
        complete.mockResolvedValue("something");
    });

    it("makes no provider call and no write during a headless run", async () => {
        const { info, frontmatter } = fakeInfo(true);
        const { recorded, dep } = deps({ verdict: "accepted", text: "x" });

        await runAiActionFromPrompt(info, el, "prompt", spec, dep);

        expect(complete).not.toHaveBeenCalled();
        expect(frontmatter).toEqual({});
        expect(recorded).toEqual([]);
    });

    it("has no setting that could re-enable it", () => {
        expect(service.config()).not.toHaveProperty("allowInAutomations");
    });
});
