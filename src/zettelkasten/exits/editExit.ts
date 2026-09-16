import { App, Notice } from "obsidian";
import { t } from "architecture/lang";
import { log } from "architecture";
import { canvas } from "architecture/plugin/canvas";
import type { Flow } from "architecture/plugin/canvas";
import { describeOption } from "application/notes/optionDescription";
import { parseEdgeCondition } from "application/notes/conditionEvaluator";
import { setDefaultExit, type StepExit, type StepExits } from "application/notes/stepExits";
import { ExitEditorModal, noticeExitSaveFailed } from "zettelkasten/modals/ExitEditorModal";
import { readStepSettings, writeStepExits } from "./exitStore";

/**
 * The arrow as a **door into the step that owns it** (#427, epic #422).
 *
 * Clicking an arrow on the canvas used to open a code editor over its label. It now opens that
 * arrow's exit on its source step — the same three questions the step editor asks — and writes it
 * where the step keeps its settings. The arrow's label follows along as the human half, so the
 * diagram reads as words and the condition stops being drawn on it.
 */

/** What to call the step an arrow points at, without making anyone look it up. */
export async function describeDestination(flow: Flow, nodeId: string): Promise<string> {
    const settings = await readStepSettings(flow, nodeId);
    if (settings?.label?.trim()) return settings.label.trim();
    const node = flow.data.nodes.find((candidate) => candidate.id === nodeId);
    if (node?.type === "file" && node.file) {
        const name = node.file.split("/").pop() ?? node.file;
        return name.replace(/\.[^.]+$/, "");
    }
    return t("step_identity_untitled");
}

/**
 * Open the exit editor for one arrow. Returns `false` when the arrow's source cannot own exits — a
 * script node, an unreadable canvas — so the caller can keep the older behaviour instead of
 * pretending the step took the configuration.
 */
export async function openExitEditor(app: App, canvasPath: string, edgeId: string): Promise<boolean> {
    let flow: Flow;
    try {
        flow = await canvas.flows.update(canvasPath);
    } catch (error) {
        log.warn("[exits] could not read the canvas for this arrow", error);
        return false;
    }

    const edge = flow.data.edges.find((candidate) => candidate.id === edgeId);
    if (!edge) return false;

    const settings = await readStepSettings(flow, edge.fromNode);
    if (!settings) return false;

    const exits: StepExits = settings.exits ?? {};
    // No configuration yet: the label is still doing all three jobs, so the form opens holding what
    // the author already wrote — the gate as the condition, the rest as the words.
    const initial: StepExit = exits[edgeId] ?? {
        ...(describeOption(edge.label) ? { says: describeOption(edge.label) } : {}),
        ...(parseEdgeCondition(edge.label) ? { when: parseEdgeCondition(edge.label) } : {}),
    };
    const destination = await describeDestination(flow, edge.toNode);

    new ExitEditorModal(app, destination, initial, async (edited) => {
        await saveExit(flow, edge.fromNode, edgeId, edited);
    }).open();
    return true;
}

/**
 * Persist one exit on its step, and keep the arrow honest: the label becomes the words the exit
 * says (empty when it says nothing), never the condition again.
 */
export async function saveExit(
    flow: Flow,
    stepId: string,
    edgeId: string,
    exit: StepExit
): Promise<void> {
    const settings = await readStepSettings(flow, stepId);
    if (!settings) {
        noticeExitSaveFailed();
        return;
    }
    let exits: StepExits = { ...settings.exits, [edgeId]: exit };
    // Only one step can be the one you land on.
    if (exit.default) exits = setDefaultExit(exits, edgeId);

    const saved = await writeStepExits(flow, stepId, exits);
    if (!saved) {
        noticeExitSaveFailed();
        return;
    }
    await flow.editEdgeLabels({ [edgeId]: exit.says ?? "" });
    new Notice(t("exit_editor_saved"));
}
