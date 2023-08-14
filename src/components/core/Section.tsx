import React from "react";
import { c } from "architecture";
import { NoteBuilderProps } from "components/NoteBuilder";

export function Section(props: NoteBuilderProps) {
  const { store } = props;
  const actions = store((store) => store.actions);
  const section = store((store) => store.section);
  const { element } = section;
  return <div className={c("section")}>{element}</div>;
}
