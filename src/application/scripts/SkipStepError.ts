/**
 * The signal a script raises when its failure should abandon the rest of its step (#445).
 *
 * Not a `ZettelError`: those are conditions the wizard reports to the person writing the note,
 * and this is an instruction to the builder. It carries the step so the builder knows how much to
 * skip, and the message so the notice can say which script it came from.
 */
export class SkipStepError extends Error {
    constructor(message: string, public readonly stepId: string | undefined) {
        super(message);
        this.name = "SkipStepError";
    }
}
