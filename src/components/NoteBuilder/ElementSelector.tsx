import React from "react";
import { ElementBuilderProps } from "./model/NoteBuilderModel";
import { Select, SelectMapper } from "components/core";
import { callbackElementBuilder } from "notes/NoteBuilder";

export function ElementSelector(info: ElementBuilderProps) {
  const { store, childen } = info;

  const actions = store((state) => state.actions);
  return (
    <Select
      key="select-element-section"
      options={SelectMapper.ZettelFlowElement2Options(childen)}
      callback={callbackElementBuilder(
        {
          actions,
        },
        info
      )}
    />
  );
}
