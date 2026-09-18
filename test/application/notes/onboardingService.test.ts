import { describe, it, expect, jest } from "@jest/globals";
import {
    createExampleFlow,
    repairBrokenExampleFlow,
    EXAMPLE_CANVAS_PATH,
    EXAMPLE_STEP_PATH,
    type OnboardingWriter,
} from "application/notes/onboardingService";

const mockTFile = { path: EXAMPLE_STEP_PATH };
const mockTCanvas = { path: EXAMPLE_CANVAS_PATH };

const makeMockPlugin = (stepExists = false, canvasExists = false) => {
    const vault = {
        getAbstractFileByPath: jest.fn<(p: string) => null | object>().mockReturnValue(null),
        getFileByPath: jest.fn<(p: string) => null | object>((p) => {
            if (p === EXAMPLE_STEP_PATH && stepExists) return mockTFile;
            if (p === EXAMPLE_CANVAS_PATH && canvasExists) return mockTCanvas;
            return null;
        }),
        createFolder: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        create: jest.fn<() => Promise<object>>().mockResolvedValue({}),
        modify: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };
    const plugin = {
        app: { vault },
        settings: { ribbonCanvas: "" },
        saveSettings: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    } as unknown as import("main").default;
    // Vault mutation goes through the services now (#456), so onboarding takes a writer port.
    // This one lands on the same fake vault, which is what every assertion below reads.
    const writer: OnboardingWriter = {
        create: async (path, content) => {
            await vault.create(path, content);
        },
        overwrite: async (file, content) => {
            await vault.modify(file, content);
        },
    };
    return { plugin, vault, writer };
};

describe("onboarding constants", () => {
    it("EXAMPLE_CANVAS_PATH ends with .canvas", () => {
        expect(EXAMPLE_CANVAS_PATH.endsWith(".canvas")).toBe(true);
    });

    it("EXAMPLE_STEP_PATH ends with .md", () => {
        expect(EXAMPLE_STEP_PATH.endsWith(".md")).toBe(true);
    });

    it("both paths live inside _ZettelFlow/examples", () => {
        expect(EXAMPLE_CANVAS_PATH.startsWith("_ZettelFlow/examples")).toBe(true);
        expect(EXAMPLE_STEP_PATH.startsWith("_ZettelFlow/examples")).toBe(true);
    });
});

describe("createExampleFlow — fresh vault (no files exist)", () => {
    it("returns the canvas path on success", async () => {
        const { plugin, writer } = makeMockPlugin();
        expect(await createExampleFlow(plugin, writer)).toBe(EXAMPLE_CANVAS_PATH);
    });

    it("sets ribbonCanvas on plugin settings", async () => {
        const { plugin, writer } = makeMockPlugin();
        await createExampleFlow(plugin, writer);
        expect(plugin.settings.ribbonCanvas).toBe(EXAMPLE_CANVAS_PATH);
    });

    it("calls saveSettings once", async () => {
        const { plugin, writer } = makeMockPlugin();
        await createExampleFlow(plugin, writer);
        expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    });

    it("calls vault.create for the step file", async () => {
        const { plugin, vault, writer } = makeMockPlugin();
        await createExampleFlow(plugin, writer);
        expect(vault.create).toHaveBeenCalledWith(EXAMPLE_STEP_PATH, expect.stringContaining("zettelFlowSettings"));
    });

    it("STEP_TEMPLATE contains zettelFlowSettings.root YAML", async () => {
        const { plugin, vault, writer } = makeMockPlugin();
        await createExampleFlow(plugin, writer);
        const stepCall = (vault.create as jest.MockedFunction<typeof vault.create>).mock.calls.find(
            ([path]) => path === EXAMPLE_STEP_PATH
        );
        expect(stepCall).toBeDefined();
        const content = stepCall![1] as string;
        expect(content).toContain("zettelFlowSettings:");
        expect(content).toContain("root: true");
        expect(content).toContain("type: prompt");
    });

    it("canvas JSON does not contain zettelflowConfig", async () => {
        const { plugin, vault, writer } = makeMockPlugin();
        await createExampleFlow(plugin, writer);
        const canvasCall = (vault.create as jest.MockedFunction<typeof vault.create>).mock.calls.find(
            ([path]) => path === EXAMPLE_CANVAS_PATH
        );
        expect(canvasCall).toBeDefined();
        const content = canvasCall![1] as string;
        expect(content).not.toContain("zettelflowConfig");
    });

    it("skips createFolder when folders already exist", async () => {
        const { plugin, vault, writer } = makeMockPlugin();
        vault.getAbstractFileByPath.mockReturnValue({ path: "existing" });
        await createExampleFlow(plugin, writer);
        expect(vault.createFolder).not.toHaveBeenCalled();
    });

    it("returns null when vault.create rejects", async () => {
        const { plugin, vault, writer } = makeMockPlugin();
        vault.create.mockRejectedValue(new Error("disk full"));
        expect(await createExampleFlow(plugin, writer)).toBeNull();
    });

    it("does not call saveSettings when vault.create fails", async () => {
        const { plugin, vault, writer } = makeMockPlugin();
        vault.create.mockRejectedValue(new Error("fail"));
        await createExampleFlow(plugin, writer);
        expect(plugin.saveSettings).not.toHaveBeenCalled();
    });
});

// ─── repairBrokenExampleFlow ─────────────────────────────────────────────────

describe("repairBrokenExampleFlow", () => {
    const BROKEN_CONTENT = "# {{title}}\n"; // old onboarding — no frontmatter
    const CORRECT_CONTENT = "---\nzettelFlowSettings:\n  root: true\n---\n# body\n";

    function makeRepairPlugin(opts: {
        stepContent: string;
        stepExists: boolean;
        ribbonCanvas: string;
    }) {
        const stepTFile = { path: EXAMPLE_STEP_PATH };
        const vault = {
            getFileByPath: jest.fn<(p: string) => null | object>((p) =>
                opts.stepExists && p === EXAMPLE_STEP_PATH ? stepTFile : null
            ),
            cachedRead: jest.fn<() => Promise<string>>().mockResolvedValue(opts.stepContent),
            modify: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        };
        const plugin = {
            app: { vault },
            settings: { ribbonCanvas: opts.ribbonCanvas },
            saveSettings: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        } as unknown as import("main").default;
        const writer: OnboardingWriter = {
            create: async () => undefined,
            overwrite: async (file, content) => {
                await vault.modify(file, content);
            },
        };
        return { plugin, vault, writer };
    }

    it("repairs file when it exists but has no zettelFlowSettings frontmatter", async () => {
        const { plugin, vault, writer } = makeRepairPlugin({
            stepExists: true,
            stepContent: BROKEN_CONTENT,
            ribbonCanvas: EXAMPLE_CANVAS_PATH,
        });

        const repaired = await repairBrokenExampleFlow(plugin, writer);

        expect(repaired).toBe(true);
        expect(vault.modify).toHaveBeenCalledWith(
            { path: EXAMPLE_STEP_PATH },
            expect.stringContaining("zettelFlowSettings:")
        );
    });

    it("does NOT overwrite a file with custom content that lacks frontmatter", async () => {
        const { plugin, vault, writer } = makeRepairPlugin({
            stepExists: true,
            stepContent: "# My custom introduction\n\nUser notes here.\n",
            ribbonCanvas: EXAMPLE_CANVAS_PATH,
        });

        const repaired = await repairBrokenExampleFlow(plugin, writer);

        expect(repaired).toBe(false);
        expect(vault.modify).not.toHaveBeenCalled();
    });

    it("does NOT overwrite a file that already has correct frontmatter", async () => {
        const { plugin, vault, writer } = makeRepairPlugin({
            stepExists: true,
            stepContent: CORRECT_CONTENT,
            ribbonCanvas: EXAMPLE_CANVAS_PATH,
        });

        const repaired = await repairBrokenExampleFlow(plugin, writer);

        expect(repaired).toBe(false);
        expect(vault.modify).not.toHaveBeenCalled();
    });

    it("is a no-op when the step file does not exist yet", async () => {
        const { plugin, vault, writer } = makeRepairPlugin({
            stepExists: false,
            stepContent: "",
            ribbonCanvas: EXAMPLE_CANVAS_PATH,
        });

        const repaired = await repairBrokenExampleFlow(plugin, writer);

        expect(repaired).toBe(false);
        expect(vault.modify).not.toHaveBeenCalled();
        expect(vault.cachedRead).not.toHaveBeenCalled();
    });

    it("is a no-op when ribbonCanvas does not point to the example canvas", async () => {
        const { plugin, vault, writer } = makeRepairPlugin({
            stepExists: true,
            stepContent: BROKEN_CONTENT,
            ribbonCanvas: "other/canvas.canvas",
        });

        const repaired = await repairBrokenExampleFlow(plugin, writer);

        expect(repaired).toBe(false);
        expect(vault.modify).not.toHaveBeenCalled();
    });
});

describe("createExampleFlow — files already exist", () => {
    it("overwrites the step file but preserves the canvas when both exist", async () => {
        const { plugin, vault, writer } = makeMockPlugin(true, true);
        await createExampleFlow(plugin, writer);
        // Step file: overwritten to apply latest template
        expect(vault.modify).toHaveBeenCalledWith(mockTFile, expect.stringContaining("zettelFlowSettings"));
        // Canvas: NOT overwritten — user data is preserved
        const canvasModify = (vault.modify.mock.calls as [object, string][]).find(
            ([f]) => (f as { path: string }).path === EXAMPLE_CANVAS_PATH
        );
        expect(canvasModify).toBeUndefined();
        // Canvas: NOT re-created (already exists)
        const canvasCreate = (vault.create.mock.calls as [string, string][]).find(
            ([p]) => p === EXAMPLE_CANVAS_PATH
        );
        expect(canvasCreate).toBeUndefined();
    });

    it("still sets ribbonCanvas and saves settings", async () => {
        const { plugin, writer } = makeMockPlugin(true, true);
        await createExampleFlow(plugin, writer);
        expect(plugin.settings.ribbonCanvas).toBe(EXAMPLE_CANVAS_PATH);
        expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    });
});
