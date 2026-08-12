import { log } from "architecture";
import type { StepPhase } from "zettelkasten/phases";

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

export type StarterFlowType = "fleeting" | "literature" | "permanent" | "moc" | "literatureToPermanent";

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
    literatureToPermanent: {
        canvas: `${EXAMPLE_FOLDER}/Literature to Permanent.canvas`,
        step: `${EXAMPLE_STEPS_FOLDER}/LiteratureToPermanent.md`,
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
 * A single `zettelFlowSettings.actions` entry — either an interactive/static `prompt`
 * or a `hasUI:false` cognitive action (#153–#156) composed into a flow (#157).
 */
type ActionEntry =
    | {
        kind: "prompt";
        id: string;
        key: string;
        zone: "context" | "frontmatter";
        hasUI: boolean;
        description?: string;
        label?: string;
        placeholder?: string;
        staticBehaviour?: boolean;
        staticValue?: string;
    }
    | {
        kind: "cognitive";
        /** Registered action type/id, e.g. `find-related`. */
        type: string;
        id: string;
        key: string;
        zone: "context" | "frontmatter";
        limit?: number;
    };

/** Emit the YAML lines for one action entry (shared by the prompt and composed builders). */
function emitActionEntry(entry: ActionEntry): string[] {
    if (entry.kind === "prompt") {
        const lines = ["    - type: prompt", `      id: ${entry.id}`];
        if (entry.description !== undefined) lines.push(`      description: ${entry.description}`);
        lines.push(`      hasUI: ${entry.hasUI}`);
        lines.push(`      key: ${entry.key}`);
        lines.push(`      zone: ${entry.zone}`);
        if (entry.label !== undefined) lines.push(`      label: ${entry.label}`);
        if (entry.placeholder !== undefined) lines.push(`      placeholder: ${entry.placeholder}`);
        lines.push(`      staticBehaviour: ${entry.staticBehaviour ?? false}`);
        if (entry.staticBehaviour && entry.staticValue !== undefined) {
            lines.push(`      staticValue: ${entry.staticValue}`);
        }
        return lines;
    }
    const lines = [
        `    - type: ${entry.type}`,
        `      id: ${entry.id}`,
        "      hasUI: false",
        `      key: ${entry.key}`,
        `      zone: ${entry.zone}`,
    ];
    if (entry.limit !== undefined) lines.push(`      limit: ${entry.limit}`);
    return lines;
}

/**
 * Builds a step markdown file with `zettelFlowSettings` frontmatter from an ordered list of
 * {@link ActionEntry}s. The single step is always the flow root and targets the shared examples
 * notes folder. The prompt-only {@link buildStepTemplate} delegates here so the four shipped flows
 * stay byte-for-byte identical (#157, D6); the composed #157 flow passes cognitive entries too.
 */
function buildComposedStepTemplate(
    label: string,
    phase: StepPhase,
    entries: ActionEntry[],
    body: string
): string {
    const lines: string[] = [];
    lines.push("---");
    lines.push("zettelFlowSettings:");
    lines.push("  root: true");
    lines.push(`  label: ${label}`);
    // Default knowledge-transformation phase for the starter flow (#149) — cosmetic metadata.
    lines.push(`  phase: ${phase}`);
    lines.push("  actions:");
    for (const entry of entries) lines.push(...emitActionEntry(entry));
    lines.push(`  targetFolder: ${EXAMPLE_NOTES_FOLDER}`);
    lines.push("  childrenHeader: ''");
    lines.push("  optional: false");
    lines.push("---");
    lines.push("");
    lines.push(body);
    return lines.join("\n");
}

/** Prompt-only builder (the four shipped flows). Maps each prompt to an entry and delegates. */
function buildStepTemplate(label: string, prompts: PromptSpec[], body: string, phase: StepPhase): string {
    const entries: ActionEntry[] = prompts.map((prompt) => ({
        kind: "prompt",
        id: prompt.id,
        key: prompt.key,
        zone: prompt.zone,
        hasUI: true,
        description: prompt.description,
        label: prompt.label,
        placeholder: prompt.placeholder,
        staticBehaviour: false,
    }));
    return buildComposedStepTemplate(label, phase, entries, body);
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
        "# {{title}}\n",
        "CAPTURE"
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
        "# {{title}}\n\n**Source:** {{source}} — {{author}} (p. {{page}})\n\n{{summary}}\n",
        "PROCESS"
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
        "# {{title}}\n\n{{idea}}\n\n## Connections\n\n{{connect}}\n",
        "DEVELOP"
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
        "# {{title}}\n\n{{about}}\n\n## Notes in this map\n\n",
        "CONNECT"
    ),
    literatureToPermanent: buildComposedStepTemplate(
        "Literature → Permanent",
        "DEVELOP",
        [
            {
                kind: "prompt",
                id: "zf-l2p-title",
                key: "title",
                zone: "context",
                hasUI: true,
                description: "Title",
                label: "Title",
                placeholder: "Name this literature note...",
                staticBehaviour: false,
            },
            {
                kind: "prompt",
                id: "zf-l2p-source",
                key: "source",
                zone: "frontmatter",
                hasUI: true,
                description: "Source",
                label: "Source",
                placeholder: "Book, article, video...",
                staticBehaviour: false,
            },
            {
                kind: "prompt",
                id: "zf-l2p-summary",
                key: "summary",
                zone: "context",
                hasUI: true,
                description: "Your summary",
                label: "Your summary",
                placeholder: "Summarise it in your own words...",
                staticBehaviour: false,
            },
            { kind: "cognitive", type: "extract-claims", id: "zf-l2p-extract", key: "claims", zone: "frontmatter" },
            { kind: "cognitive", type: "find-related", id: "zf-l2p-related", key: "related", zone: "frontmatter", limit: 10 },
            { kind: "cognitive", type: "suggest-link", id: "zf-l2p-suggest", key: "suggestedLinks", zone: "frontmatter", limit: 5 },
            { kind: "cognitive", type: "find-contradiction", id: "zf-l2p-contradiction", key: "contradictions", zone: "frontmatter" },
            { kind: "cognitive", type: "calculate-maturity", id: "zf-l2p-maturity", key: "maturity", zone: "frontmatter" },
            {
                kind: "prompt",
                id: "zf-l2p-promote",
                key: "state",
                zone: "frontmatter",
                hasUI: false,
                staticBehaviour: true,
                staticValue: "permanent",
            },
        ],
        "# {{title}}\n\n**Source:** {{source}}\n\n{{summary}}\n\n## Related\n\n{{related}}\n\n## Suggested connections\n\n{{suggestedLinks}}\n\n## Contradictions\n\n{{contradictions}}\n"
    ),
};

const CANVAS_CONTENTS: Record<StarterFlowType, string> = {
    fleeting: buildCanvas("zf-fleeting-001", STARTER_FLOW_PATHS.fleeting.step),
    literature: buildCanvas("zf-literature-001", STARTER_FLOW_PATHS.literature.step),
    permanent: buildCanvas("zf-permanent-001", STARTER_FLOW_PATHS.permanent.step),
    moc: buildCanvas("zf-moc-001", STARTER_FLOW_PATHS.moc.step),
    literatureToPermanent: buildCanvas("zf-l2p-001", STARTER_FLOW_PATHS.literatureToPermanent.step),
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
