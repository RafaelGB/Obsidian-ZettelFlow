import React from "react";
import { c } from "architecture";
import { NoteBuilderType, RootSelector } from "components/NoteBuilder";
import { useNoteBuilderStore } from "components/NoteBuilder/state/NoteBuilderState";

export function Section(props: NoteBuilderType) {
  const section = useNoteBuilderStore((store) => store.section);
  const { element } = section;
  if (element.key) {
    return (
      <div
        className={c("section")}
        key={`section-${element.key}`}
        style={{
          borderColor: section.color,
        }}
      >
        {element}
      </div>
    );
  }
  return <RootSelector {...props} />;
}
