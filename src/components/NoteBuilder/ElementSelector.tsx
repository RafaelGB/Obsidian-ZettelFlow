import React, { useMemo } from "react";
import { ElementBuilderProps } from "./model/NoteBuilderModel";
import { Select, SelectMapper } from "components/core";
import { callbackElementBuilder } from "./callbacks/CallbackNote";
import { useNoteBuilderStore } from "./state/NoteBuilderState";

export function ElementSelector(info: ElementBuilderProps) {
  const { childen, plugin } = info;
  const { settings } = plugin;
  const actions = useNoteBuilderStore((state) => state.actions);
  const title = useNoteBuilderStore((state) => state.title);
  const callbackMemo = useMemo(() => {
    return callbackElementBuilder(
      {
        actions,
        title,
      },
      info
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
      autofocus={true}
    />
  );
}
