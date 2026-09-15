import React from "react";
import { t } from "architecture/lang";
import { WizardState } from "./WizardState";

/**
 * Stands in for a step that was answered before the session was paused (#410, epic #405).
 *
 * A resumed draft restores the step's recorded **result** into the note; it never replays the step,
 * because an action that already wrote something cannot be unwound. Going back to it therefore shows
 * what happened rather than an empty box.
 */
export function RestoredStep() {
  return <WizardState kind="empty" message={t("note_builder_draft_restored_step")} />;
}
