import React, { useMemo } from "react";
import { Select, SelectMapper } from "components/core";
import { NoteBuilderProps } from "./model/NoteBuilderModel";
import { callbackRootBuilder } from "./callbacks/CallbackNote";
import { useNoteBuilderStore } from "./state/NoteBuilderState";

export function RootSelector(info: NoteBuilderProps) {
  const { plugin } = info;
  const { settings } = plugin;

  const title = useNoteBuilderStore((state) => state.title);
  const actions = useNoteBuilderStore((state) => state.actions);
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
      autofocus={true}
    />
  );
}
