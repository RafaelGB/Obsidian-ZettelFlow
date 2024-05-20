import React, { useMemo, useState } from "react";
import { ActionAddMenuProps } from "./typing";
import { c } from "architecture";
import { actionsStore } from "architecture/api";

export function ActionAddMenu(props: ActionAddMenuProps) {
  const { onChange } = props;
  // Open/close action selector menu
  const [display, setDisplay] = useState(false);
  // Hooks
  const actionsMemo: Record<string, string> = useMemo(() => {
    const record: Record<string, string> = {};
    actionsStore.getActionsKeys().forEach((key) => {
      const label = actionsStore.getAction(key).getLabel();
      record[label] = key;
    });
    return record;
  }, []);

  return <div className={c("actions-management-add")}>TODO</div>;
}
