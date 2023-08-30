import React, { useMemo } from "react";
import { Select, SelectMapper } from "components/core";
import { NoteBuilderProps } from "./model/NoteBuilderModel";
import { callbackRootBuilder } from "./callbacks/CallbackNote";

export function RootSelector(info: NoteBuilderProps) {
  const { plugin, store } = info;
  const { settings } = plugin;

  const title = store((state) => state.title);
  const actions = store((state) => state.actions);
  const callbackMemo = useMemo(
    () =>
      callbackRootBuilder(
        {
          title,
          actions,
        },
        info
      ),
    [title, actions, info]
  );
  return (
    <Select
      key="select-root-section"
      options={SelectMapper.zettelFlowElementRecord2Options(
        settings.workflow,
        settings.nodes
      )}
      callback={(selected) => {
        const selectedStep = settings.workflow.find(
          (step) => step.id === selected
        );
        if (!selectedStep) throw new Error("Selected step not found");
        callbackMemo(selectedStep);
      }}
    />
  );
}
