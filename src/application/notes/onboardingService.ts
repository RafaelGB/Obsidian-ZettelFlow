import { log } from "architecture";
import ZettelFlow from "main";

const EXAMPLE_FOLDER = "_ZettelFlow/examples";
const EXAMPLE_STEPS_FOLDER = `${EXAMPLE_FOLDER}/steps`;
const EXAMPLE_NOTES_FOLDER = `${EXAMPLE_FOLDER}/notes`;
export const EXAMPLE_CANVAS_PATH = `${EXAMPLE_FOLDER}/My first flow.canvas`;
export const EXAMPLE_STEP_PATH = `${EXAMPLE_STEPS_FOLDER}/Introduction.md`;

const STEP_TEMPLATE = "# {{title}}\n";

const STEP_CONFIG =
    "root: true\n" +
    "label: Introduction\n" +
    "actions:\n" +
    "  - type: prompt\n" +
    "    id: zf-example-title\n" +
    "    description: Note title\n" +
    "    hasUI: true\n" +
    "    key: title\n" +
    "    zone: context\n" +
    "    label: 'Give your note a name'\n" +
    "    placeholder: 'My first note...'\n" +
    "    staticBehaviour: false\n" +
    "targetFolder: _ZettelFlow/examples/notes\n" +
    "childrenHeader: ''\n" +
    "optional: false\n";

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
                color: "3",
                zettelflowConfig: STEP_CONFIG,
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

export async function createExampleFlow(plugin: ZettelFlow): Promise<string | null> {
    const vault = plugin.app.vault;
    try {
        await ensureFolder(vault, EXAMPLE_FOLDER);
        await ensureFolder(vault, EXAMPLE_STEPS_FOLDER);
        await ensureFolder(vault, EXAMPLE_NOTES_FOLDER);

        if (!vault.getAbstractFileByPath(EXAMPLE_STEP_PATH)) {
            await vault.create(EXAMPLE_STEP_PATH, STEP_TEMPLATE);
        }

        if (!vault.getAbstractFileByPath(EXAMPLE_CANVAS_PATH)) {
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
