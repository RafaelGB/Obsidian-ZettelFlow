import React from "react";
import { c } from "architecture";
import { t } from "architecture/lang";
import { useNoteBuilderStore } from "./state/NoteBuilderState";

/**
 * The path walked so far (#408, epic #405): canvas → step → step → current.
 *
 * Display only. Making an entry activatable — jumping back to any step — is #413, which also has to
 * answer what happens to the answers given after it.
 */
export function Breadcrumb() {
  const previousArray = useNoteBuilderStore((store) => store.previousArray);
  const previousSections = useNoteBuilderStore((store) => store.previousSections);
  const header = useNoteBuilderStore((store) => store.header);
  const activeCanvasName = useNoteBuilderStore((store) => store.activeCanvasName);

  const walked = previousArray
    .map((position) => previousSections.get(position)?.header.title)
    .filter((title): title is string => Boolean(title));

  if (walked.length === 0 && !activeCanvasName) return null;

  const full = [activeCanvasName, ...walked, header.title].filter(Boolean).join(" › ");

  return (
    <nav className={c("breadcrumb")} aria-label={t("note_builder_breadcrumb_label")}>
      <ol className={c("breadcrumb-list")} title={full}>
        {activeCanvasName && (
          <li className={c("breadcrumb-item", "breadcrumb-item-canvas")}>
            {activeCanvasName}
          </li>
        )}
        {walked.map((title, index) => (
          <li className={c("breadcrumb-item")} key={`crumb-${index}-${title}`}>
            {title}
          </li>
        ))}
        <li className={c("breadcrumb-item", "breadcrumb-item-current")} aria-current="step">
          {header.title}
        </li>
      </ol>
    </nav>
  );
}
