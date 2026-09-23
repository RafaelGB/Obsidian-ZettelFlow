import { ConfirmStep, TextArea, confirmsOn } from "architecture/components/core";
import { TypeService } from "architecture/typing";
import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import { c } from "architecture";
import React, { useState } from "react";

/**
 * A written answer (#547).
 *
 * The one behaviour that changes in this pass, and it is a fix: bare `Enter` used to **submit**,
 * inside a multi-line text area — so a prompt was a text area you could not write a second line
 * in. `Enter` is a newline now and `Ctrl`/`Cmd`+`Enter` confirms, which is what the Lab's composer
 * has always done and what the hint under the button says.
 */
export function PromptWrapper(props: WrappedActionBuilderProps) {
  const { action, callback } = props;
  const [value, setValue] = useState<string>("");

  return (
    <div className={c("input-group")}>
      <TextArea
        className={["display-grid"]}
        placeholder={
          TypeService.isString(action.placeholder) ? action.placeholder : ""
        }
        onChange={(next) => setValue(next)}
        onKeyDown={(event, current) => {
          if (!confirmsOn(event, "mod-enter")) return;
          event.preventDefault();
          event.stopPropagation();
          callback(current);
        }}
        key={"prompt-action"}
        autofocus
      />
      <ConfirmStep onConfirm={() => callback(value)} accelerator="mod-enter" />
    </div>
  );
}
