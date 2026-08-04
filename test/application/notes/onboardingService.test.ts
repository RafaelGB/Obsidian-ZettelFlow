import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import {
    createExampleFlow,
    EXAMPLE_CANVAS_PATH,
    EXAMPLE_STEP_PATH,
} from "application/notes/onboardingService";

const makeMockPlugin = () => {
    const vault = {
        getAbstractFileByPath: jest.fn<() => null | object>().mockReturnValue(null),
        createFolder: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        create: jest.fn<() => Promise<object>>().mockResolvedValue({}),
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

describe("createExampleFlow", () => {
    it("returns the canvas path on success", async () => {
        const { plugin } = makeMockPlugin();
        const result = await createExampleFlow(plugin);
        expect(result).toBe(EXAMPLE_CANVAS_PATH);
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

    it("skips createFolder when the folder already exists", async () => {
        const { plugin, vault } = makeMockPlugin();
        vault.getAbstractFileByPath.mockReturnValue({ path: "existing" });
        await createExampleFlow(plugin);
        expect(vault.createFolder).not.toHaveBeenCalled();
    });

    it("returns null when vault.create rejects", async () => {
        const { plugin, vault } = makeMockPlugin();
        vault.create.mockRejectedValue(new Error("disk full"));
        const result = await createExampleFlow(plugin);
        expect(result).toBeNull();
    });

    it("does not call saveSettings when vault.create fails", async () => {
        const { plugin, vault } = makeMockPlugin();
        vault.create.mockRejectedValue(new Error("fail"));
        await createExampleFlow(plugin);
        expect(plugin.saveSettings).not.toHaveBeenCalled();
    });
});
