import React from "react";
import { c } from "architecture";
import { t } from "architecture/lang";
import { useNoteBuilderStore } from "./state/NoteBuilderState";

/**
 * A polite live region announcing each step of the wizard (#407, epic #405).
 *
 * Advancing a step swaps the whole body with no announcement at all, so a screen-reader user had no
 * way to know the wizard had moved on or what it was asking. The region is visually hidden and carries
 * only the step's own header text — F3 extends it with the position ("step 3 · about 2 left").
 */
export function LiveRegion() {
  const header = useNoteBuilderStore((store) => store.header);
  const previousArray = useNoteBuilderStore((store) => store.previousArray);
  const step = previousArray.length + 1;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={c("visually-hidden")}
    >
      {header.title
        ? t("note_builder_step_announcement", String(step), header.title)
        : ""}
    </div>
  );
}
