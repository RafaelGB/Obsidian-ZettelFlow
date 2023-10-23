import React, { useMemo } from "react";
import { NoteBuilderType } from "./model/NoteBuilderModel";
import { callbackRootBuilder } from "./callbacks/CallbackNote";
import { useNoteBuilderStore } from "./state/NoteBuilderState";
import { Select, SelectMapper } from "components/select";

export function RootSelector(info: NoteBuilderType) {
  const { plugin } = info;
  const { settings } = plugin;

  const actions = useNoteBuilderStore((state) => state.actions);
  const data = useNoteBuilderStore((state) => state.data);
  const callbackMemo = useMemo(
    () =>
      callbackRootBuilder(
        {
          actions,
          data,
        },
        info
      ),
    []
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
