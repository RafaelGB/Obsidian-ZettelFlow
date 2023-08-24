import React, { useMemo } from "react";
import { ActionBuilderProps } from "./model/NoteBuilderModel";
import { Input } from "components/core";
import { callbackActionBuilder } from "notes/NoteBuilder";
import { TypeService } from "architecture/typing";

export function ActionSelector(info: ActionBuilderProps) {
  const { store, action } = info;

  const actions = store((state) => state.actions);
  const title = store((state) => state.title);
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
    case "bridge":
    // Do nothing - default behavior
    default:
      return (
        <div key={"not-supported-action"}>
          Error: {action.element.type} not supported
        </div>
      );
  }
}
