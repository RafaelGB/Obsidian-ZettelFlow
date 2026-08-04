import { describe, it, expect, jest } from "@jest/globals";
import {
    createExampleFlow,
    repairBrokenExampleFlow,
    EXAMPLE_CANVAS_PATH,
    EXAMPLE_STEP_PATH,
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
    return { plugin, vault };
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
        const { plugin } = makeMockPlugin();
        expect(await createExampleFlow(plugin)).toBe(EXAMPLE_CANVAS_PATH);
    });

    it("sets ribbonCanvas on plugin settings", async () => {
        const { plugin } = makeMockPlugin();
        await createExampleFlow(plugin);
        expect(plugin.settings.ribbonCanvas).toBe(EXAMPLE_CANVAS_PATH);
    });

    it("calls saveSettings once", async () => {
        const { plugin } = makeMockPlugin();
        await createExampleFlow(plugin);
        expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    });

    it("calls vault.create for the step file", async () => {
        const { plugin, vault } = makeMockPlugin();
        await createExampleFlow(plugin);
        expect(vault.create).toHaveBeenCalledWith(EXAMPLE_STEP_PATH, expect.stringContaining("zettelFlowSettings"));
    });

    it("STEP_TEMPLATE contains zettelFlowSettings.root YAML", async () => {
        const { plugin, vault } = makeMockPlugin();
        await createExampleFlow(plugin);
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
        const { plugin, vault } = makeMockPlugin();
        await createExampleFlow(plugin);
        const canvasCall = (vault.create as jest.MockedFunction<typeof vault.create>).mock.calls.find(
            ([path]) => path === EXAMPLE_CANVAS_PATH
        );
        expect(canvasCall).toBeDefined();
        const content = canvasCall![1] as string;
        expect(content).not.toContain("zettelflowConfig");
    });

    it("skips createFolder when folders already exist", async () => {
        const { plugin, vault } = makeMockPlugin();
        vault.getAbstractFileByPath.mockReturnValue({ path: "existing" });
        await createExampleFlow(plugin);
        expect(vault.createFolder).not.toHaveBeenCalled();
    });

    it("returns null when vault.create rejects", async () => {
        const { plugin, vault } = makeMockPlugin();
        vault.create.mockRejectedValue(new Error("disk full"));
        expect(await createExampleFlow(plugin)).toBeNull();
    });

    it("does not call saveSettings when vault.create fails", async () => {
        const { plugin, vault } = makeMockPlugin();
        vault.create.mockRejectedValue(new Error("fail"));
        await createExampleFlow(plugin);
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
        return { plugin, vault };
    }

    it("repairs file when it exists but has no zettelFlowSettings frontmatter", async () => {
        const { plugin, vault } = makeRepairPlugin({
            stepExists: true,
            stepContent: BROKEN_CONTENT,
            ribbonCanvas: EXAMPLE_CANVAS_PATH,
        });

        const repaired = await repairBrokenExampleFlow(plugin);

        expect(repaired).toBe(true);
        expect(vault.modify).toHaveBeenCalledWith(
            { path: EXAMPLE_STEP_PATH },
            expect.stringContaining("zettelFlowSettings:")
        );
    });

    it("does NOT overwrite a file that already has correct frontmatter", async () => {
        const { plugin, vault } = makeRepairPlugin({
            stepExists: true,
            stepContent: CORRECT_CONTENT,
            ribbonCanvas: EXAMPLE_CANVAS_PATH,
        });

        const repaired = await repairBrokenExampleFlow(plugin);

        expect(repaired).toBe(false);
        expect(vault.modify).not.toHaveBeenCalled();
    });

    it("is a no-op when the step file does not exist yet", async () => {
        const { plugin, vault } = makeRepairPlugin({
            stepExists: false,
            stepContent: "",
            ribbonCanvas: EXAMPLE_CANVAS_PATH,
        });

        const repaired = await repairBrokenExampleFlow(plugin);

        expect(repaired).toBe(false);
        expect(vault.modify).not.toHaveBeenCalled();
        expect(vault.cachedRead).not.toHaveBeenCalled();
    });

    it("is a no-op when ribbonCanvas does not point to the example canvas", async () => {
        const { plugin, vault } = makeRepairPlugin({
            stepExists: true,
            stepContent: BROKEN_CONTENT,
            ribbonCanvas: "other/canvas.canvas",
        });

        const repaired = await repairBrokenExampleFlow(plugin);

        expect(repaired).toBe(false);
        expect(vault.modify).not.toHaveBeenCalled();
    });
});

describe("createExampleFlow — files already exist (overwrite)", () => {
    it("calls vault.modify instead of vault.create when files exist", async () => {
        const { plugin, vault } = makeMockPlugin(true, true);
        await createExampleFlow(plugin);
        expect(vault.modify).toHaveBeenCalledWith(mockTFile, expect.stringContaining("zettelFlowSettings"));
        expect(vault.modify).toHaveBeenCalledWith(mockTCanvas, expect.any(String));
        expect(vault.create).not.toHaveBeenCalled();
    });

    it("still sets ribbonCanvas and saves settings after modify", async () => {
        const { plugin } = makeMockPlugin(true, true);
        await createExampleFlow(plugin);
        expect(plugin.settings.ribbonCanvas).toBe(EXAMPLE_CANVAS_PATH);
        expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    });
});
