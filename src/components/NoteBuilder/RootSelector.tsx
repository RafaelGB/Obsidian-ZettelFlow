import React from "react";
import { Select, SelectMapper } from "components/core";
import { NoteBuilderProps } from "./model/NoteBuilderModel";
import { callbackRootBuilder } from "notes/NoteBuilder";

export function RootSelector(info: NoteBuilderProps) {
  const { plugin, store } = info;
  const { settings } = plugin;

  const title = store((state) => state.title);
  const actions = store((state) => state.actions);
  return (
    <Select
      key="select-root-section"
      options={SelectMapper.zettelFlowOptionRecord2Options(
        settings.rootSection
      )}
      callback={callbackRootBuilder(
        {
          title,
          actions,
        },
        info
      )}
    />
  );
}
