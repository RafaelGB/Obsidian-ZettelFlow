import { describe, it, expect, jest } from "@jest/globals";
import { log } from "architecture";
import {
    installStarterFlows,
    STARTER_FLOW_PATHS,
    StarterFlowType,
} from "application/notes/starterFlowsService";

const ALL_TYPES: StarterFlowType[] = ["fleeting", "literature", "permanent", "moc"];

function allFilePaths(): string[] {
    return ALL_TYPES.flatMap((type) => [
        STARTER_FLOW_PATHS[type].canvas,
        STARTER_FLOW_PATHS[type].step,
    ]);
}

/**
 * Mock vault backed by a single Set of "existing" paths. `create`/`createFolder`
 * add to the set so idempotency across a single run behaves like the real vault.
 */
function makeVault(preexisting: string[] = []) {
    const files = new Set<string>(preexisting);
    const vault = {
        getAbstractFileByPath: jest.fn<(p: string) => object | null>((p) =>
            files.has(p) ? { path: p } : null
        ),
        getFileByPath: jest.fn<(p: string) => object | null>((p) =>
            files.has(p) ? { path: p } : null
        ),
        createFolder: jest.fn<(p: string) => Promise<object>>(async (p) => {
            files.add(p);
            return { path: p };
        }),
        create: jest.fn<(p: string, d: string) => Promise<object>>(async (p) => {
            files.add(p);
            return { path: p };
        }),
    };
    return { vault, files };
}

function createdPaths(vault: ReturnType<typeof makeVault>["vault"]): string[] {
    return vault.create.mock.calls.map((call) => call[0]);
}

function createdContent(
    vault: ReturnType<typeof makeVault>["vault"],
    path: string
): string {
    const call = vault.create.mock.calls.find((c) => c[0] === path);
    expect(call).toBeDefined();
    return call![1];
}

describe("STARTER_FLOW_PATHS", () => {
    it("has distinct canvas/step paths under _ZettelFlow/examples", () => {
        const seen = new Set<string>();
        for (const type of ALL_TYPES) {
            const { canvas, step } = STARTER_FLOW_PATHS[type];
            expect(canvas.endsWith(".canvas")).toBe(true);
            expect(step.endsWith(".md")).toBe(true);
            expect(canvas.startsWith("_ZettelFlow/examples")).toBe(true);
            expect(step.startsWith("_ZettelFlow/examples/steps")).toBe(true);
            seen.add(canvas);
            seen.add(step);
        }
        // 4 canvases + 4 steps, all unique
        expect(seen.size).toBe(8);
    });
});

describe("installStarterFlows — AC-1 fresh install of all types", () => {
    it("creates one canvas + one step per type (8 files) and reports all installed", async () => {
        const { vault } = makeVault();
        const result = await installStarterFlows(vault, ALL_TYPES);

        expect(result.installed).toHaveLength(4);
        expect(result.skipped).toHaveLength(0);
        expect(vault.create).toHaveBeenCalledTimes(8);

        const paths = createdPaths(vault);
        for (const type of ALL_TYPES) {
            expect(paths).toContain(STARTER_FLOW_PATHS[type].canvas);
            expect(paths).toContain(STARTER_FLOW_PATHS[type].step);
        }
    });
});

describe("installStarterFlows — AC-2 idempotent", () => {
    it("skips a type whose canvas and step already exist without writing its files", async () => {
        const { vault } = makeVault([
            STARTER_FLOW_PATHS.fleeting.canvas,
            STARTER_FLOW_PATHS.fleeting.step,
        ]);

        const result = await installStarterFlows(vault, ["fleeting"]);

        expect(result.skipped).toContain("fleeting");
        expect(result.installed).not.toContain("fleeting");
        const paths = createdPaths(vault);
        expect(paths).not.toContain(STARTER_FLOW_PATHS.fleeting.canvas);
        expect(paths).not.toContain(STARTER_FLOW_PATHS.fleeting.step);
    });

    it("a second run with everything present creates nothing", async () => {
        const { vault } = makeVault(allFilePaths());

        const result = await installStarterFlows(vault, ALL_TYPES);

        expect(result.installed).toHaveLength(0);
        expect(result.skipped).toHaveLength(4);
        expect(vault.create).not.toHaveBeenCalled();
    });
});

describe("installStarterFlows — AC-5 no redundant writes", () => {
    it("does not create files or folders when everything is present", async () => {
        const { vault } = makeVault(allFilePaths());

        await installStarterFlows(vault, ALL_TYPES);

        expect(vault.create).not.toHaveBeenCalled();
        expect(vault.createFolder).not.toHaveBeenCalled();
    });
});

describe("installStarterFlows — AC-3 type-appropriate content", () => {
    it("the literature step references source, author, page and summary", async () => {
        const { vault } = makeVault();
        await installStarterFlows(vault, ["literature"]);

        const content = createdContent(vault, STARTER_FLOW_PATHS.literature.step);
        expect(content).toContain("source");
        expect(content).toContain("author");
        expect(content).toContain("page");
        expect(content).toContain("summary");
    });

    it("the permanent step references idea and connect", async () => {
        const { vault } = makeVault();
        await installStarterFlows(vault, ["permanent"]);

        const content = createdContent(vault, STARTER_FLOW_PATHS.permanent.step);
        expect(content).toContain("idea");
        expect(content).toContain("connect");
    });

    it("every canvas is valid JSON and never contains zettelflowConfig", async () => {
        const { vault } = makeVault();
        await installStarterFlows(vault, ALL_TYPES);

        for (const type of ALL_TYPES) {
            const content = createdContent(vault, STARTER_FLOW_PATHS[type].canvas);
            expect(() => JSON.parse(content)).not.toThrow();
            expect(content).not.toContain("zettelflowConfig");
        }
    });

    it("every step carries root zettelFlowSettings with a prompt action", async () => {
        const { vault } = makeVault();
        await installStarterFlows(vault, ALL_TYPES);

        for (const type of ALL_TYPES) {
            const content = createdContent(vault, STARTER_FLOW_PATHS[type].step);
            expect(content).toContain("zettelFlowSettings:");
            expect(content).toContain("root: true");
            expect(content).toContain("type: prompt");
        }
    });
});

describe("installStarterFlows — AC-4 observability", () => {
    it("logs once per created flow", async () => {
        const infoSpy = jest.spyOn(log, "info");
        const { vault } = makeVault();

        await installStarterFlows(vault, ALL_TYPES);

        expect(infoSpy).toHaveBeenCalledTimes(4);
        infoSpy.mockRestore();
    });

    it("does not log for skipped flows", async () => {
        const infoSpy = jest.spyOn(log, "info");
        const { vault } = makeVault(allFilePaths());

        await installStarterFlows(vault, ALL_TYPES);

        expect(infoSpy).not.toHaveBeenCalled();
        infoSpy.mockRestore();
    });
});

describe("installStarterFlows — AC-6 partial mix", () => {
    it("installs the missing types and skips the present one", async () => {
        const { vault } = makeVault([
            STARTER_FLOW_PATHS.permanent.canvas,
            STARTER_FLOW_PATHS.permanent.step,
        ]);

        const result = await installStarterFlows(vault, ALL_TYPES);

        expect(result.installed).toHaveLength(3);
        expect(result.skipped).toEqual(["permanent"]);
        const paths = createdPaths(vault);
        expect(paths).not.toContain(STARTER_FLOW_PATHS.permanent.canvas);
        expect(paths).not.toContain(STARTER_FLOW_PATHS.permanent.step);
    });
});

describe("installStarterFlows — #149 default knowledge phases", () => {
    it("stamps each starter step with its default phase token", async () => {
        const { vault } = makeVault();
        await installStarterFlows(vault, ALL_TYPES);

        const expected: Record<StarterFlowType, string> = {
            fleeting: "CAPTURE",
            literature: "PROCESS",
            permanent: "DEVELOP",
            moc: "CONNECT",
        };
        for (const type of ALL_TYPES) {
            const content = createdContent(vault, STARTER_FLOW_PATHS[type].step);
            expect(content).toContain(`phase: ${expected[type]}`);
        }
    });
});
