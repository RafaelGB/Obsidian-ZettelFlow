import React, { useMemo } from "react";
import { ActionBuilderProps } from "./model/NoteBuilderModel";
import { Calendar, Input } from "components/core";
import { TypeService } from "architecture/typing";
import { callbackActionBuilder } from "./callbacks/CallbackNote";
import { useNoteBuilderStore } from "./state/NoteBuilderState";

export function ActionSelector(info: ActionBuilderProps) {
  const { action } = info;

  const actions = useNoteBuilderStore((state) => state.actions);
  const title = useNoteBuilderStore((state) => state.title);
  const callbackMemo = useMemo(() => {
    return callbackActionBuilder(
      {
        actions: actions,
        title: title,
      },
      info
    );
  }, [title]);
  switch (action.element.type) {
    case "prompt":
      return (
        <Input
          className={["display-grid"]}
          placeholder={
            TypeService.isString(action.element.placeholder)
              ? action.element.placeholder
              : ""
          }
          onKeyDown={(key, value) => {
            if (key === "Enter") {
              callbackMemo(value);
            }
          }}
          key={"prompt-action"}
        />
      );
    case "calendar":
      return (
        <Calendar
          onConfirm={(value) => {
            callbackMemo(value);
          }}
        />
      );
    default:
      return (
        <div key={"not-supported-action"}>
          Error: {action.element.type} not supported
        </div>
      );
  }
}
