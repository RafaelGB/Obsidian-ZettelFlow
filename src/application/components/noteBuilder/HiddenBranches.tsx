import React, { useState } from "react";
import { c } from "architecture";
import { tCount } from "architecture/lang";
import { explainBranch } from "application/notes/branchExplanationText";
import { useNoteBuilderStore } from "./state/NoteBuilderState";

/**
 * The options this step is *not* offering, and why (#414, epic #405).
 *
 * A closed `if:` edge used to remove a branch in silence — the strongest possible recommendation,
 * made on the user's behalf with no explanation, and invisible to the flow's author too. This states
 * it. It does not offer a way in: the gate is legible, not bypassable.
 *
 * Renders nothing at all when nothing is hidden, and always starts collapsed.
 */
export function HiddenBranches() {
  const hidden = useNoteBuilderStore((store) => store.hiddenBranches);
  const [open, setOpen] = useState(false);

  if (hidden.length === 0) return null;

  return (
    <div className={c("hidden-branches")}>
      <button
        type="button"
        className={c("hidden-branches-toggle")}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {tCount(hidden.length, "note_builder_hidden", String(hidden.length))}
      </button>
      {open && (
        <ul className={c("hidden-branches-list")}>
          {hidden.map((branch) => (
            <li className={c("hidden-branches-item")} key={branch.id}>
              <span className={c("hidden-branches-label")}>{branch.label}</span>
              <span className={c("hidden-branches-reason")}>{explainBranch(branch.reason, branch.expression)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
