import { AbstractHandlerClass } from "architecture/patterns";
import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { RootToggleHandler } from "./RootToggleHandler";
import { AbstractStepModal } from "../AbstractStepModal";
import { STEP_PHASES, PHASE_LABEL_KEY, isStepPhase } from "zettelkasten/phases";

/** Sentinel dropdown value for "no phase" — mapped back to `undefined` on the step. */
const UNPHASED = "__unphased__";

/**
 * Lets the user tag a step with an optional knowledge-transformation phase (#149). Selecting the
 * "unphased" option clears the phase (stored as absent). Cosmetic — it does not affect execution.
 */
export class PhaseSelectorHandler extends AbstractHandlerClass<AbstractStepModal> {
    name = t('step_builder_phase_title');
    description = t('step_builder_phase_description');
    handle(modal: AbstractStepModal): AbstractStepModal {
        const { info } = modal;
        const { contentEl, phase } = info;
        new Setting(contentEl)
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
                    });
            });
        return this.goNext(modal);
    }

    public manageNextHandler(): void {
        this.nextHandler = new RootToggleHandler();
    }
}
