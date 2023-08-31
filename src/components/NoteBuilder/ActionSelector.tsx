import React, { useMemo } from "react";
import { ActionBuilderProps } from "./model/NoteBuilderModel";
import { Calendar, Input } from "components/core";
import { TypeService } from "architecture/typing";
import { callbackActionBuilder } from "./callbacks/CallbackNote";

export function ActionSelector(info: ActionBuilderProps) {
  const { store, action } = info;

  const actions = store((state) => state.actions);
  const title = store((state) => state.title);
  const pos = store((state) => state.position);
  const callbackMemo = useMemo(() => {
    return callbackActionBuilder(
      {
        actions: actions,
        title: title,
      },
      info,
      pos
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
          onKeyDown={(key, value) => {
            if (key === "Enter") {
              // TODO: Add extra info to calendar action
              //callbackMemo(value);
            }
          }}
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
