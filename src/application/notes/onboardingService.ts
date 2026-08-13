import { log } from "architecture";
import ZettelFlow from "main";

const EXAMPLE_FOLDER = "_ZettelFlow/examples";
const EXAMPLE_STEPS_FOLDER = `${EXAMPLE_FOLDER}/steps`;
const EXAMPLE_NOTES_FOLDER = `${EXAMPLE_FOLDER}/notes`;
export const EXAMPLE_CANVAS_PATH = `${EXAMPLE_FOLDER}/My first flow.canvas`;
export const EXAMPLE_STEP_PATH = `${EXAMPLE_STEPS_FOLDER}/Introduction.md`;

// For file-type canvas nodes ZettelFlow reads step settings from the file's
// frontmatter (key: zettelFlowSettings), NOT from zettelflowConfig on the node.
const STEP_TEMPLATE =
    "---\n" +
    "zettelFlowSettings:\n" +
    "  root: true\n" +
    "  label: Introduction\n" +
    "  actions:\n" +
    "    - type: prompt\n" +
    "      id: zf-example-title\n" +
    "      description: Note title\n" +
    "      hasUI: true\n" +
    "      key: title\n" +
    "      zone: context\n" +
    "      label: Give your note a name\n" +
    "      placeholder: My first note...\n" +
    "      staticBehaviour: false\n" +
    "  targetFolder: _ZettelFlow/examples/notes\n" +
    "  childrenHeader: ''\n" +
    "  optional: false\n" +
    "---\n" +
    "\n" +
    "# {{title}}\n";

// File nodes do not use zettelflowConfig — keep the canvas node minimal.
const EXAMPLE_CANVAS_CONTENT = JSON.stringify(
    {
        nodes: [
            {
                id: "zf-example-001",
                type: "file",
                file: EXAMPLE_STEP_PATH,
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

async function ensureFolder(vault: ZettelFlow["app"]["vault"], path: string): Promise<void> {
    if (!vault.getAbstractFileByPath(path)) {
        await vault.createFolder(path);
    }
}

async function writeFile(
    vault: ZettelFlow["app"]["vault"],
    path: string,
    content: string
): Promise<void> {
    const existing = vault.getFileByPath(path);
    if (existing) {
        await vault.modify(existing, content);
    } else {
        await vault.create(path, content);
    }
}

/**
 * Repairs a stale onboarding step file that was created by an older version of
 * ZettelFlow without the required zettelFlowSettings frontmatter.
 *
 * Returns true if the file was rewritten, false if no repair was needed.
 */
// The old onboarding (before aaac1c5) created Introduction.md with just this line.
// We only auto-repair that exact default; any other content is user-customised.
const OLD_BROKEN_TEMPLATE = "# {{title}}";

export async function repairBrokenExampleFlow(plugin: ZettelFlow): Promise<boolean> {
    if (plugin.settings.ribbonCanvas !== EXAMPLE_CANVAS_PATH) return false;
    const { vault } = plugin.app;
    const stepFile = vault.getFileByPath(EXAMPLE_STEP_PATH);
    if (!stepFile) return false;
    const content = await vault.cachedRead(stepFile);
    if (content.includes("zettelFlowSettings:")) return false;
    if (content.trim() !== OLD_BROKEN_TEMPLATE) return false;
    await vault.modify(stepFile, STEP_TEMPLATE);
    return true;
}

export async function createExampleFlow(plugin: ZettelFlow): Promise<string | null> {
    const vault = plugin.app.vault;
    try {
        await ensureFolder(vault, EXAMPLE_FOLDER);
        await ensureFolder(vault, EXAMPLE_STEPS_FOLDER);
        await ensureFolder(vault, EXAMPLE_NOTES_FOLDER);

        // Step file: always write the latest template so the frontmatter is correct.
        await writeFile(vault, EXAMPLE_STEP_PATH, STEP_TEMPLATE);

        // Canvas: only create when it does not yet exist.
        // An existing canvas may contain user-added nodes — never overwrite it.
        if (!vault.getFileByPath(EXAMPLE_CANVAS_PATH)) {
            await vault.create(EXAMPLE_CANVAS_PATH, EXAMPLE_CANVAS_CONTENT);
        }

        plugin.settings.ribbonCanvas = EXAMPLE_CANVAS_PATH;
        await plugin.saveSettings();

        return EXAMPLE_CANVAS_PATH;
    } catch (error) {
        log.error(`OnboardingService: failed to create example flow — ${String(error)}`);
        return null;
    }
}
