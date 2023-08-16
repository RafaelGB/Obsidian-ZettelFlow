import React from "react";
import { c } from "architecture";
import { t } from "architecture/lang";
import { NoteBuilderProps } from "components/NoteBuilder";

export function Input(noteBuilderType: NoteBuilderProps) {
  const { store } = noteBuilderType;
  const actions = store((store) => store.actions);
  const titleValue = store((store) => store.title);
  return (
    <>
      <input
        value={titleValue}
        type="text"
        name="title"
        autoComplete="off"
        onChange={(event) => {
          const value = event.target.value;
          actions.setTitle(value);
        }}
        required={true}
      />
      <label className={c("input-label")}>{t("note_title_placeholder")}</label>
    </>
  );
}
