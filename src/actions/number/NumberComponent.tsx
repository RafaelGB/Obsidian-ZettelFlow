import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import { ConfirmStep, confirmsOn } from "architecture/components/core";
import { c } from "architecture";
import React, { useState } from "react";

/**
 * A number, asked the way every other step asks (#547).
 *
 * It used to be a bare `<input type="number">` inside a `div`, with `Enter` wired inline and no
 * way to confirm with the mouse at all — so the one step you could not finish by clicking was
 * this one. The field stays a number field, because that is what an OS gives you a number keypad
 * for; what changed is that the answer ends the way the others do.
 */
export function NumberWrapper(props: WrappedActionBuilderProps) {
  const { callback } = props;
  const [value, setValue] = useState<string>("");

  const confirm = (): void => callback(parseFloat(value));

  return (
    <div className={c("input-group")}>
      <input
        type="number"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (!confirmsOn(event)) return;
          event.preventDefault();
          event.stopPropagation();
          confirm();
        }}
        autoFocus
      />
      <ConfirmStep
        onConfirm={confirm}
        // A step that accepts an empty answer writes `NaN` into the note, which is worse than
        // asking again. The calendar has refused a bad value since it shipped; now so does this.
        canConfirm={() => Number.isFinite(parseFloat(value))}
      />
    </div>
  );
}
