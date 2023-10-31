import React, { useMemo, useState } from "react";
import { ActionsManagementProps } from "./typing";
import { ActionAccordion } from "./ActionAccordion";
import { Dropdown } from "architecture/components/core";
import { actionsStore } from "architecture/api";
import { Icon } from "architecture/components/icon";
import { c } from "architecture";

export function ActionsManagement(props: ActionsManagementProps) {
  const { modal } = props;
  const { info } = modal;
  const [actions, setActions] = useState(info.actions);

  const actionsMemo: Record<string, string> = useMemo(() => {
    const record: Record<string, string> = {};
    actionsStore.getActionsKeys().forEach((key) => {
      record[key] = actionsStore.getAction(key).getLabel();
    });
    return record;
  }, []);
  return (
    <>
      {actions.map((action, index) => {
        return (
          <ActionAccordion
            key={`action-${index}-${action.type}`}
            modal={modal}
            action={action}
            onRemove={() => {
              const deepCopy = actions.slice();
              info.actions = deepCopy.splice(index, 1);
              setActions(deepCopy);
            }}
          />
        );
      })}
      <div className={c("actions-management-add")}>
        <Dropdown
          key={`dropdown-${info.actions.length}`}
          options={actionsMemo}
          confirmNode={<Icon name="plus" />}
          confirmTooltip="Add new action"
          onConfirm={(value) => {
            const deepCopy = actions.slice();
            deepCopy.push(actionsStore.getDefaultActionInfo(value));
            setActions(deepCopy);
            info.actions = deepCopy;
          }}
        />
      </div>
    </>
  );
}
