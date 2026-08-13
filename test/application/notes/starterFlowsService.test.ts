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

    it("the permanent step ships the default Knowledge Pattern on-creation behavior (#170)", async () => {
        const { vault } = makeVault();
        await installStarterFlows(vault, ["permanent"]);
        const content = createdContent(vault, STARTER_FLOW_PATHS.permanent.step);

        // The interactive actions block is unchanged — still the three prompts, no cognitive double-run.
        const actions = parseActionsBlock(content);
        expect(actions.map((a) => a.type)).toEqual(["prompt", "prompt", "prompt"]);
        expect(actions.map((a) => a.key)).toEqual(["title", "idea", "connect"]);

        // The new on-creation block runs the four headless actions, in order.
        const onCreation = parseBlock(content, "onCreation:");
        expect(onCreation.map((a) => a.type)).toEqual([
            "find-related", "find-contradiction", "suggest-link", "calculate-maturity",
        ]);
        expect(onCreation.map((a) => a.key)).toEqual([
            "related", "contradictions", "suggestedLinks", "maturity",
        ]);
        expect(onCreation.every((a) => a.hasUI === "false")).toBe(true);
        expect(onCreation[0].limit).toBe("10"); // find-related
        expect(onCreation[2].limit).toBe("5"); // suggest-link
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

/** Parse the `zettelFlowSettings.actions` list from an emitted step markdown. */
function parseActionsBlock(content: string): Record<string, string>[] {
    return parseBlock(content, "actions:");
}

/** Parse a `zettelFlowSettings.<blockKey>` action list (e.g. `actions:` or `onCreation:`). */
function parseBlock(content: string, blockKey: string): Record<string, string>[] {
    const lines = content.split("\n");
    const start = lines.findIndex((l) => l.trim() === blockKey);
    const entries: Record<string, string>[] = [];
    let current: Record<string, string> | null = null;
    for (let i = start + 1; i < lines.length; i++) {
        const line = lines[i];
        const head = line.match(/^ {4}- ([\w-]+): (.*)$/);
        const field = line.match(/^ {6}([\w-]+): (.*)$/);
        if (head) {
            current = { [head[1]]: head[2] };
            entries.push(current);
        } else if (field && current) {
            current[field[1]] = field[2];
        } else if (/^ {0,2}\S/.test(line)) {
            break; // dedented back to a top-level zettelFlowSettings key
        }
    }
    return entries;
}

describe("literatureToPermanent composed flow (#157, AC-1/AC-2)", () => {
    it("composes the nine cognitive/prompt entries in order (AC-1)", async () => {
        const { vault } = makeVault();
        await installStarterFlows(vault, ["literatureToPermanent"]);
        const content = createdContent(vault, STARTER_FLOW_PATHS.literatureToPermanent.step);
        const actions = parseActionsBlock(content);

        expect(actions.map((a) => a.type)).toEqual([
            "prompt", "prompt", "prompt",
            "extract-claims", "find-related", "suggest-link", "find-contradiction", "calculate-maturity",
            "prompt",
        ]);
        expect(actions.map((a) => a.key)).toEqual([
            "title", "source", "summary",
            "claims", "related", "suggestedLinks", "contradictions", "maturity",
            "state",
        ]);
        expect(actions[4].limit).toBe("10"); // find-related
        expect(actions[5].limit).toBe("5"); // suggest-link
    });

    it("promotes to permanent via a static, no-UI prompt entry (AC-1)", async () => {
        const { vault } = makeVault();
        await installStarterFlows(vault, ["literatureToPermanent"]);
        const promote = parseActionsBlock(
            createdContent(vault, STARTER_FLOW_PATHS.literatureToPermanent.step)
        ).at(-1)!;
        expect(promote.type).toBe("prompt");
        expect(promote.key).toBe("state");
        expect(promote.zone).toBe("frontmatter");
        expect(promote.hasUI).toBe("false");
        expect(promote.staticBehaviour).toBe("true");
        expect(promote.staticValue).toBe("permanent");
    });

    it("makes every step an independent, removable top-level entry (AC-2)", async () => {
        const { vault } = makeVault();
        await installStarterFlows(vault, ["literatureToPermanent"]);
        const content = createdContent(vault, STARTER_FLOW_PATHS.literatureToPermanent.step);
        // Nine distinct "- type:" list items, each with its own key.
        expect(content.match(/^ {4}- type:/gm)).toHaveLength(9);
        expect(new Set(parseActionsBlock(content).map((a) => a.key)).size).toBe(9);
        expect(content).toContain("root: true");
    });
});

describe("installStarterFlows — #157 create-only idempotency for the composed flow (AC-3)", () => {
    it("fresh-installs one canvas + one step and logs once", async () => {
        const infoSpy = jest.spyOn(log, "info");
        const { vault } = makeVault();

        const result = await installStarterFlows(vault, ["literatureToPermanent"]);

        expect(result.installed).toEqual(["literatureToPermanent"]);
        expect(vault.create).toHaveBeenCalledTimes(2);
        const paths = createdPaths(vault);
        expect(paths).toContain(STARTER_FLOW_PATHS.literatureToPermanent.canvas);
        expect(paths).toContain(STARTER_FLOW_PATHS.literatureToPermanent.step);
        expect(infoSpy).toHaveBeenCalledTimes(1);
        infoSpy.mockRestore();
    });

    it("skips the composed flow when both files already exist, writing nothing", async () => {
        const { vault } = makeVault([
            STARTER_FLOW_PATHS.literatureToPermanent.canvas,
            STARTER_FLOW_PATHS.literatureToPermanent.step,
        ]);

        const result = await installStarterFlows(vault, ["literatureToPermanent"]);

        expect(result.skipped).toContain("literatureToPermanent");
        expect(result.installed).not.toContain("literatureToPermanent");
        expect(vault.create).not.toHaveBeenCalled();
        expect(vault.createFolder).not.toHaveBeenCalled();
    });
});

describe("installStarterFlows — #157 byte-for-byte guard for the four shipped flows (D6)", () => {
    it("emits unchanged step content for fleeting/literature/permanent/moc", async () => {
        const { vault } = makeVault();
        await installStarterFlows(vault, ALL_TYPES);
        for (const type of ALL_TYPES) {
            expect(createdContent(vault, STARTER_FLOW_PATHS[type].step)).toMatchSnapshot(type);
        }
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
            literatureToPermanent: "DEVELOP",
        };
        for (const type of ALL_TYPES) {
            const content = createdContent(vault, STARTER_FLOW_PATHS[type].step);
            expect(content).toContain(`phase: ${expected[type]}`);
        }
    });
});
