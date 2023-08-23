import React from "react";
import { ActionSelectorProps } from "./model/NoteBuilderModel";

export function ActionSelector(info: ActionSelectorProps) {
  const { store, action } = info;

  const actions = store((state) => state.actions);
  const title = store((state) => state.title);
  switch (action.element.type) {
    default:
      return (
        <div key={"elementBuilderTest"}>
          Error: {action.element.type} not supported
        </div>
      );
  }
}
