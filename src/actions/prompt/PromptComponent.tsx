import { TypeService } from "architecture/typing";
import { WrappedActionBuilderProps } from "components/NoteBuilder";
import { TextArea } from "components/core";
import React from "react";

export function PromptWrapper(props: WrappedActionBuilderProps) {
  const { action, callback } = props;
  return (
    <TextArea
      className={["display-grid"]}
      placeholder={
        TypeService.isString(action.element.placeholder)
          ? action.element.placeholder
          : ""
      }
      onKeyDown={(key, value) => {
        if (key === "Enter") {
          callback(value);
        }
      }}
      key={"prompt-action"}
    />
  );
}
