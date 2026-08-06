import { log } from "architecture";

/**
 * Curated starter flows for the four classic Zettelkasten note types.
 *
 * Each flow is a complete, runnable ZettelFlow flow: a canvas whose single file
 * node points at a step markdown file carrying valid `zettelFlowSettings`
 * frontmatter (same contract as {@link ./onboardingService}). Installation is
 * idempotent and NEVER overwrites existing user files — it only ever creates.
 *
 * This module intentionally imports nothing from `"obsidian"` so the install
 * logic can be unit-tested with a mock vault (see {@link StarterFlowVault}).
 */

export type StarterFlowType = "fleeting" | "literature" | "permanent" | "moc";

export type StarterFlowInstallResult = {
    installed: StarterFlowType[];
    skipped: StarterFlowType[];
};

/**
 * Minimal subset of Obsidian's `Vault` used by the installer. Declared as an
 * interface so tests can pass a mock — Obsidian's real `Vault` is structurally
 * assignable to it.
 */
export interface StarterFlowVault {
    // `unknown` here stands in for Obsidian's `TAbstractFile | null` / `TFile | null`;
    // callers only ever check for null, so the concrete type is irrelevant.
    getAbstractFileByPath(path: string): unknown;
    getFileByPath(path: string): unknown;
    createFolder(path: string): Promise<unknown>;
    create(path: string, data: string): Promise<unknown>;
}

const EXAMPLE_FOLDER = "_ZettelFlow/examples";
const EXAMPLE_STEPS_FOLDER = `${EXAMPLE_FOLDER}/steps`;
const EXAMPLE_NOTES_FOLDER = `${EXAMPLE_FOLDER}/notes`;

/** Expected canvas + step path for each starter flow. Exported so tests can reference them. */
export const STARTER_FLOW_PATHS: Record<StarterFlowType, { canvas: string; step: string }> = {
    fleeting: {
        canvas: `${EXAMPLE_FOLDER}/Fleeting note.canvas`,
        step: `${EXAMPLE_STEPS_FOLDER}/Fleeting.md`,
    },
    literature: {
        canvas: `${EXAMPLE_FOLDER}/Literature note.canvas`,
        step: `${EXAMPLE_STEPS_FOLDER}/Literature.md`,
    },
    permanent: {
        canvas: `${EXAMPLE_FOLDER}/Permanent note.canvas`,
        step: `${EXAMPLE_STEPS_FOLDER}/Permanent.md`,
    },
    moc: {
        canvas: `${EXAMPLE_FOLDER}/Structure map.canvas`,
        step: `${EXAMPLE_STEPS_FOLDER}/Structure.md`,
    },
};

interface PromptSpec {
    id: string;
    key: string;
    zone: "context" | "frontmatter";
    description: string;
    label: string;
    placeholder: string;
}

/**
 * Builds a step markdown file with `zettelFlowSettings` frontmatter following the
 * exact shape used by the onboarding example flow. The single step is always the
 * flow root and targets the shared examples notes folder.
 */
function buildStepTemplate(label: string, prompts: PromptSpec[], body: string): string {
    const lines: string[] = [];
    lines.push("---");
    lines.push("zettelFlowSettings:");
    lines.push("  root: true");
    lines.push(`  label: ${label}`);
    lines.push("  actions:");
    for (const prompt of prompts) {
        lines.push("    - type: prompt");
        lines.push(`      id: ${prompt.id}`);
        lines.push(`      description: ${prompt.description}`);
        lines.push("      hasUI: true");
        lines.push(`      key: ${prompt.key}`);
        lines.push(`      zone: ${prompt.zone}`);
        lines.push(`      label: ${prompt.label}`);
        lines.push(`      placeholder: ${prompt.placeholder}`);
        lines.push("      staticBehaviour: false");
    }
    lines.push(`  targetFolder: ${EXAMPLE_NOTES_FOLDER}`);
    lines.push("  childrenHeader: ''");
    lines.push("  optional: false");
    lines.push("---");
    lines.push("");
    lines.push(body);
    return lines.join("\n");
}

/** File-type canvas nodes read their config from the step frontmatter — no zettelflowConfig here. */
function buildCanvas(nodeId: string, stepPath: string): string {
    return JSON.stringify(
        {
            nodes: [
                {
                    id: nodeId,
                    type: "file",
                    file: stepPath,
                    x: -175,
                    y: -80,
                    width: 350,
                    height: 160,
                },
            ],
            edges: [],
        },
        null,
        2
    );
}

const STEP_TEMPLATES: Record<StarterFlowType, string> = {
    fleeting: buildStepTemplate(
        "Fleeting note",
        [
            {
                id: "zf-fleeting-title",
                key: "title",
                zone: "context",
                description: "Capture your thought",
                label: "Capture your thought",
                placeholder: "What is on your mind?...",
            },
        ],
        "# {{title}}\n"
    ),
    literature: buildStepTemplate(
        "Literature note",
        [
            {
                id: "zf-lit-title",
                key: "title",
                zone: "context",
                description: "Title",
                label: "Title",
                placeholder: "Give this literature note a name...",
            },
            {
                id: "zf-lit-source",
                key: "source",
                zone: "frontmatter",
                description: "Source",
                label: "Source",
                placeholder: "Book, article, video...",
            },
            {
                id: "zf-lit-author",
                key: "author",
                zone: "frontmatter",
                description: "Author",
                label: "Author",
                placeholder: "Who created it?...",
            },
            {
                id: "zf-lit-page",
                key: "page",
                zone: "frontmatter",
                description: "Page or location",
                label: "Page or location",
                placeholder: "e.g. p. 42...",
            },
            {
                id: "zf-lit-summary",
                key: "summary",
                zone: "context",
                description: "Your summary",
                label: "Your summary",
                placeholder: "Summarise it in your own words...",
            },
        ],
        "# {{title}}\n\n**Source:** {{source}} — {{author}} (p. {{page}})\n\n{{summary}}\n"
    ),
    permanent: buildStepTemplate(
        "Permanent note",
        [
            {
                id: "zf-perm-title",
                key: "title",
                zone: "context",
                description: "Title",
                label: "Title",
                placeholder: "Name the idea...",
            },
            {
                id: "zf-perm-idea",
                key: "idea",
                zone: "context",
                description: "The atomic idea",
                label: "The atomic idea",
                placeholder: "State one idea, in your own words...",
            },
            {
                id: "zf-perm-connect",
                key: "connect",
                zone: "context",
                description: "How does this connect to what you already know?",
                label: "How does this connect to what you already know?",
                placeholder: "Link it to existing notes...",
            },
        ],
        "# {{title}}\n\n{{idea}}\n\n## Connections\n\n{{connect}}\n"
    ),
    moc: buildStepTemplate(
        "Structure note",
        [
            {
                id: "zf-moc-title",
                key: "title",
                zone: "context",
                description: "Map title",
                label: "Map title",
                placeholder: "Name this map of content...",
            },
            {
                id: "zf-moc-about",
                key: "about",
                zone: "context",
                description: "What does this map organise?",
                label: "What does this map organise?",
                placeholder: "Describe the theme this map gathers...",
            },
        ],
        "# {{title}}\n\n{{about}}\n\n## Notes in this map\n\n"
    ),
};

const CANVAS_CONTENTS: Record<StarterFlowType, string> = {
    fleeting: buildCanvas("zf-fleeting-001", STARTER_FLOW_PATHS.fleeting.step),
    literature: buildCanvas("zf-literature-001", STARTER_FLOW_PATHS.literature.step),
    permanent: buildCanvas("zf-permanent-001", STARTER_FLOW_PATHS.permanent.step),
    moc: buildCanvas("zf-moc-001", STARTER_FLOW_PATHS.moc.step),
};

async function ensureFolder(vault: StarterFlowVault, path: string): Promise<void> {
    if (!vault.getAbstractFileByPath(path)) {
        await vault.createFolder(path);
    }
}

/**
 * Installs the selected starter flows into the vault.
 *
 * For each type: if BOTH the canvas and the step file already exist the type is
 * skipped and nothing is written. Otherwise the missing file(s) are created and
 * the type is reported as installed. This service only ever creates — it never
 * modifies or overwrites existing files, so it is safe to run repeatedly.
 *
 * Emits `log.info` exactly once per created flow.
 */
export async function installStarterFlows(
    vault: StarterFlowVault,
    types: StarterFlowType[]
): Promise<StarterFlowInstallResult> {
    const installed: StarterFlowType[] = [];
    const skipped: StarterFlowType[] = [];

    for (const type of types) {
        const paths = STARTER_FLOW_PATHS[type];
        const canvasExists = vault.getFileByPath(paths.canvas) !== null;
        const stepExists = vault.getFileByPath(paths.step) !== null;

        if (canvasExists && stepExists) {
            skipped.push(type);
            continue;
        }

        await ensureFolder(vault, EXAMPLE_FOLDER);
        await ensureFolder(vault, EXAMPLE_STEPS_FOLDER);
        await ensureFolder(vault, EXAMPLE_NOTES_FOLDER);

        if (!stepExists) {
            await vault.create(paths.step, STEP_TEMPLATES[type]);
        }
        if (!canvasExists) {
            await vault.create(paths.canvas, CANVAS_CONTENTS[type]);
        }

        installed.push(type);
        log.info(`StarterFlowsService: created ${type} starter flow (${paths.canvas})`);
    }

    return { installed, skipped };
}
