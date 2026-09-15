import React, { CSSProperties } from "react";
import { c } from "architecture";
import {
  NoteBuilderType,
  RootSelector,
  useNoteBuilderStore,
} from "application/components/noteBuilder";

export function Section(props: NoteBuilderType) {
  const section = useNoteBuilderStore((store) => store.section);
  const { element } = section;
  if (element.key) {
    // The step's canvas colour reaches the stylesheet as a custom property; painting it is the
    // stylesheet's job (#406). A step with no colour sets nothing, so no accent is rendered.
    const accent = section.color
      ? ({ "--zf-step-accent": section.color } as CSSProperties)
      : undefined;
    return (
      <div
        className={c("section")}
        key={`section-${element.key}`}
        style={accent}
      >
        {element}
      </div>
    );
  }
  return <RootSelector {...props} />;
}
