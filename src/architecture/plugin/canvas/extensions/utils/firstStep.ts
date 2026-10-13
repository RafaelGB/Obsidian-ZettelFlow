import type { StepSettings } from "zettelkasten";

/**
 * The first step of an empty flow starts it (#793).
 *
 * *Create the first step* used to make a step that did not start the flow, so a newcomer who did
 * not know to open *When does it appear?* and turn on *Starts the flow* had a flow the wizard
 * could not enter. A flow with one step has one place to start; the editor still lets you move it.
 */
export function asFirstStep(step: StepSettings, first: boolean): StepSettings {
    return first ? { ...step, root: true } : step;
}
