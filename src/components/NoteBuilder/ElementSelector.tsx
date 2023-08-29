import React, { useMemo } from "react";
import { ElementBuilderProps } from "./model/NoteBuilderModel";
import { Select, SelectMapper } from "components/core";
import { callbackElementBuilder } from "notes/NoteBuilder";

export function ElementSelector(info: ElementBuilderProps) {
  const { store, childen, plugin } = info;
  const { settings } = plugin;
  const actions = store((state) => state.actions);
  const title = store((state) => state.title);
  const pos = store((state) => state.position);
  const callbackMemo = useMemo(() => {
    return callbackElementBuilder(
      {
        actions,
        title,
      },
      info,
      pos
    );
  }, [title]);
  return (
    <Select
      key="select-element-section"
      options={SelectMapper.zettelFlowElementRecord2Options(
        childen,
        settings.nodes
      )}
      callback={(selected) => {
        const selectedStep = childen.find((step) => step.id === selected);
        if (!selectedStep) throw new Error("Selected step not found");
        callbackMemo(selectedStep);
      }}
    />
  );
}
