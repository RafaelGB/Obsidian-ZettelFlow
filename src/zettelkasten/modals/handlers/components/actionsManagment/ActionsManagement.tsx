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

  // template info.actions map
  const actionsComponent = actions.map((action, index) => {
    return (
      <ActionAccordion
        key={`action-${index}`}
        modal={modal}
        action={action}
        onRemove={() => {
          info.actions = actions.splice(index, 1);
          setActions(info.actions);
        }}
      />
    );
  });

  return (
    <>
      {actionsComponent}
      <div className={c("actions-management-add")}>
        <Dropdown
          options={actionsMemo}
          confirmNode={<Icon name="plus" />}
          confirmTooltip="Add new action"
          onConfirm={(value) => {
            info.actions.push(actionsStore.getDefaultActionInfo(value));
            setActions(info.actions);
          }}
        />
      </div>
    </>
  );
}
