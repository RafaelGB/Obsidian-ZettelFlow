import { AbstractHandlerClass } from "architecture/patterns";
import { Notice, Setting } from "obsidian";
import { t } from "architecture/lang";
import { StepWaitHandler } from "./StepWaitHandler";
import { AbstractStepModal } from "../AbstractStepModal";
import { STEP_PHASES, PHASE_LABEL_KEY, isStepPhase, type StepPhase } from "zettelkasten/phases";
import { phaseCanvasColor } from "zettelkasten/phases/phaseColor";
import { canvas } from "architecture/plugin/canvas";
import { FileService } from "architecture/plugin";
import { log } from "architecture";

/** Sentinel dropdown value for "no phase" — mapped back to `undefined` on the step. */
const UNPHASED = "__unphased__";

/**
 * Lets the user tag a step with an optional knowledge-transformation phase (#149). Selecting the
 * "unphased" option clears the phase (stored as absent). Cosmetic — it does not affect execution.
 *
 * Since #429 the phase can also **mean a colour**: the node is offered its phase's colour with one
 * click, or painted automatically when the setting is on. Never silently otherwise — a canvas
 * someone coloured by hand is theirs — and clearing a phase never clears a colour.
 */
export class PhaseSelectorHandler extends AbstractHandlerClass<AbstractStepModal> {
    name = t('step_builder_phase_title');
    description = t('step_builder_phase_description');
    handle(modal: AbstractStepModal): AbstractStepModal {
        const { info } = modal;
        const { phase } = info;
        new Setting(modal.groupEl("shown"))
            .setName(this.name)
            .setDesc(this.description)
            .addDropdown(dropdown => {
                dropdown.addOption(UNPHASED, t('step_phase_unphased'));
                for (const stepPhase of STEP_PHASES) {
                    dropdown.addOption(stepPhase, t(PHASE_LABEL_KEY[stepPhase]));
                }
                dropdown
                    .setValue(phase ?? UNPHASED)
                    .onChange((value) => {
                        info.phase = isStepPhase(value) ? value : undefined;
                        // Automatic is opt-in; clearing a phase leaves the colour alone (AC-3).
                        if (info.phase && modal.getPlugin().settings.colourNodesByPhase) {
                            void this.paint(modal, info.phase, true);
                        }
                        modal.refresh();
                    });
            });

        this.offerColour(modal);
        return this.goNext(modal);
    }

    /**
     * The suggestion (FR-1): one click, and only when there is a node to paint and a phase to paint
     * it with. Nothing changes until it is pressed.
     */
    private offerColour(modal: AbstractStepModal): void {
        const { info } = modal;
        if (!info.phase || !info.nodeId || modal.mode !== "embed") return;
        if (modal.getPlugin().settings.colourNodesByPhase) return;

        const phase = info.phase;
        new Setting(modal.groupEl("shown"))
            .setName(t("step_phase_colour_suggest"))
            .setDesc(t("canvas_legend_colours"))
            .addButton((button) =>
                button
                    .setButtonText(t("step_phase_colour_suggest"))
                    .onClick(() => void this.paint(modal, phase, false))
            );
    }

    /** Paint the node with its phase's colour, through the flow that owns the canvas file. */
    private async paint(modal: AbstractStepModal, phase: StepPhase, silent: boolean): Promise<void> {
        const { info } = modal;
        const colour = phaseCanvasColor(phase);
        if (!colour || !info.nodeId || !info.folder || !info.filename) return;
        const path = info.folder.path
            .concat(FileService.PATH_SEPARATOR)
            .concat(info.filename)
            .concat(".canvas");
        try {
            const flow = await canvas.flows.update(path);
            await flow.editNodeColor(info.nodeId, colour);
            if (!silent) new Notice(t("step_phase_colour_done"));
        } catch (error) {
            log.warn("[phase] could not colour this node", error);
            new Notice(t("step_phase_colour_failed"));
        }
    }

    public manageNextHandler(): void {
        this.nextHandler = new StepWaitHandler();
    }
}
