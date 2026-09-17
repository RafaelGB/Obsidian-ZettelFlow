import type { ScriptErrorPolicy } from "application/scripts/errorPolicy";
import { FinalElement } from "application/notes"

export type CodeElement = {
    code: string,
    /**
     * What a failure here should do to the work around it (#445): notify (the default, and what
     * the product has always done) · silent · skip the rest of this step · stop the note build.
     */
    onError?: ScriptErrorPolicy,
} & FinalElement;