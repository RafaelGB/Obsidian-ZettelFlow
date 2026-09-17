import { describe, it, expect } from "@jest/globals";
import { stepIdentity } from "zettelkasten/modals/handlers/stepIdentity";
import type { StepBuilderInfo } from "zettelkasten";

function info(extra: Partial<StepBuilderInfo> = {}): StepBuilderInfo {
    return {
        type: "text",
        contentEl: undefined as unknown as HTMLElement,
        root: false,
        actions: [],
        label: "",
        ...extra,
    } as StepBuilderInfo;
}

const asks = (n: number) =>
    Array.from({ length: n }, (_, index) => ({
        type: "prompt",
        id: `a${index}`,
        hasUI: true,
    }));

describe("the step editor knows what it is editing (#424)", () => {
    it("names the step by its label, then its file name, then says it is unnamed", () => {
        expect(stepIdentity(info({ label: "Fuente" })).title).toBe("Fuente");
        expect(stepIdentity(info({ filename: "source-step" })).title).toBe("source-step");
        expect(stepIdentity(info()).titleKey).toBe("step_identity_untitled");
    });

    it("says which kind of node it lives on", () => {
        expect(stepIdentity(info({ type: "text" })).kindKey).toBe("step_identity_kind_inline");
        expect(stepIdentity(info({ type: "group" })).kindKey).toBe("step_identity_kind_group");
        expect(stepIdentity(info({ type: "file" })).kindKey).toBe("step_identity_kind_note");
    });

    it("reuses the #151 block vocabulary rather than inventing one", () => {
        expect(stepIdentity(info()).block).toBe("action");
        expect(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            stepIdentity(info({ root: true, trigger: { event: "create" } as any })).block
        ).toBe("when");
        expect(stepIdentity(info({ wait: { mode: "confirm" } })).block).toBe("wait");
    });

    it("badges what is switched on, and nothing else", () => {
        expect(stepIdentity(info()).badges).toEqual([]);
        const busy = stepIdentity(
            info({
                root: true,
                optional: true,
                wait: { mode: "confirm" },
                satellite: {
                    template: "t.md",
                    title: "{{title}}",
                    relation: { type: "inspired-by", direction: "satellite-to-main" },
                },
            })
        );
        expect(busy.badges).toEqual([
            "step_identity_badge_root",
            "step_identity_badge_wait",
            "step_identity_badge_optional",
            "step_identity_badge_satellite",
        ]);
    });

    it("summarises a leaf that asks two things and files them", () => {
        const summary = stepIdentity(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            info({ actions: asks(2) as any, targetFolder: "Sources" })
        ).summary;
        expect(summary).toEqual([
            { key: "step_identity_asks", value: "2" },
            { key: "step_identity_writes_to", value: "Sources" },
        ]);
    });

    it("counts only the questions, not the background work", () => {
        const summary = stepIdentity(
            info({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                actions: [...asks(1), { type: "script", id: "s", hasUI: false }] as any,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onCreation: [{ type: "calculate-maturity", id: "m" }] as any,
            })
        ).summary;
        expect(summary).toContainEqual({ key: "step_identity_asks", value: "1" });
        expect(summary).toContainEqual({ key: "step_identity_background", value: "2" });
    });

    it("mentions a template and a linked note when they exist", () => {
        const summary = stepIdentity(
            info({
                body: "# {{title}}\n",
                satellite: {
                    template: "t.md",
                    title: "{{title}} — idea",
                    relation: { type: "inspired-by", direction: "satellite-to-main" },
                },
            })
        ).summary;
        expect(summary).toContainEqual({ key: "step_identity_applies_template" });
        expect(summary).toContainEqual({ key: "step_identity_linked_note" });
    });

    it("admits when a step does nothing yet", () => {
        expect(stepIdentity(info()).summary).toEqual([{ key: "step_identity_does_nothing" }]);
        expect(stepIdentity(info({ body: "   " })).summary).toEqual([
            { key: "step_identity_does_nothing" },
        ]);
    });

    it("offers the way back to the canvas only when it came from one", () => {
        expect(stepIdentity(info({ nodeId: "n1" })).canReveal).toBe(true);
        expect(stepIdentity(info()).canReveal).toBe(false);
    });
});
