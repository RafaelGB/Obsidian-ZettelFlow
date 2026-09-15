import React, { CSSProperties } from "react";
import { c } from "architecture";
import {
  NoteBuilderType,
  RootSelector,
  useNoteBuilderStore,
} from "application/components/noteBuilder";
import { stepAccent } from "application/components/noteBuilder/presentation";

export function Section(props: NoteBuilderType) {
  const section = useNoteBuilderStore((store) => store.section);
  const currentNode = useNoteBuilderStore((store) => store.currentNode);
  const { element } = section;
  if (element.key) {
    // The step's canvas colour reaches the stylesheet as a custom property; painting it is the
    // stylesheet's job (#406). It comes from the current node (#409) — `section.color` is only ever
    // "" or "info", so the accent it used to carry was never a colour at all.
    const value = stepAccent(currentNode?.color);
    const accent = value
      ? ({ "--zf-step-accent": value } as CSSProperties)
      : undefined;
    const classes = value ? c("section", "section-accented") : c("section");
    return (
      <div className={classes} key={`section-${element.key}`} style={accent}>
        {element}
      </div>
    );
  }
  return <RootSelector {...props} />;
}
