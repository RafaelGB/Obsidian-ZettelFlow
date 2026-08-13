import React, { useMemo } from "react";
import { callbackActionBuilder } from "./callbacks/CallbackNote";
import { useNoteBuilderStore } from "./state/NoteBuilderState";
import { actionsStore } from "architecture/api";
import { ActionBuilderProps } from "./typing";

export function ActionSelector(actionProps: ActionBuilderProps) {
  const { action } = actionProps;

  const actions = useNoteBuilderStore((state) => state.actions);
  const data = useNoteBuilderStore((state) => state.data);
  const position = useNoteBuilderStore((state) => state.position);
  const callbackMemo = useMemo(() => {
    return callbackActionBuilder(
      {
        actions,
        data,
      },
      actionProps
    );
  }, []);

  const zettelAction = actionsStore.getAction(action.type);
  if (!zettelAction.component) {
    return (
      <div key={"not-supported-action"}>Error: {action.type} not supported</div>
    );
  }

  return (
    <div key={`action-step-${position}`}>
      {zettelAction.component({ ...actionProps, callback: callbackMemo })}
    </div>
  );
}
