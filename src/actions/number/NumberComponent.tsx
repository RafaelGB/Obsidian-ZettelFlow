import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import { c } from "architecture";
import React from "react";

export function NumberWrapper(props: WrappedActionBuilderProps) {
  const { callback } = props;
  return (
    <div className={c("input-group")}>
      <input
        type="number"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            callback(parseFloat(e.currentTarget.value));
          }
        }}
        autoFocus
      />
    </div>
  );
}
