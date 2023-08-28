import React from "react";
import { c } from "architecture";
import { NoteBuilderProps, RootSelector } from "components/NoteBuilder";

export function Section(props: NoteBuilderProps) {
  const { store } = props;
  const section = store((store) => store.section);
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
