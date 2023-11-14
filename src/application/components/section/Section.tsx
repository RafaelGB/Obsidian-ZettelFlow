import React from "react";
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
