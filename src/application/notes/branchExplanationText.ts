import { t } from "architecture/lang";
import type { BranchReason } from "./branchVisibility";

/**
 * A closed branch, in words (#414) — one phrasing, wherever it is said.
 *
 * The wizard says it to the person writing a note and the rehearsal (#430) says it to the flow's
 * author. Two copies of the same sentence drift; this is the sentence.
 */
export function explainBranch(reason: BranchReason, expression: string): string {
    switch (reason.kind) {
        case "comparison":
            return t("note_builder_hidden_reason", reason.path, reason.found, reason.expected);
        case "all-failed":
            return t("note_builder_hidden_all_failed", reason.comparisons.join(", "));
        default:
            return t("note_builder_hidden_expression", expression);
    }
}
