import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import React from "react";

export function NumberWrapper(props: WrappedActionBuilderProps) {
  const { callback } = props;
  return (
    <input
      type="number"
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          callback(parseFloat(e.currentTarget.value));
        }
      }}
    />
  );
}
