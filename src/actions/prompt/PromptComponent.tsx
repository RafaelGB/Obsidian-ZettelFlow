import { TextArea } from "architecture/components/core";
import { TypeService } from "architecture/typing";
import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import React from "react";

export function PromptWrapper(props: WrappedActionBuilderProps) {
  const { action, callback } = props;
  return (
    <TextArea
      className={["display-grid"]}
      placeholder={
        TypeService.isString(action.placeholder) ? action.placeholder : ""
      }
      onKeyDown={(key, value) => {
        if (key === "Enter") {
          callback(value);
        }
      }}
      key={"prompt-action"}
      autofocus
    />
  );
}
