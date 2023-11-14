import React, { useMemo, useState } from "react";
import { ActionsManagementProps } from "./typing";
import { ActionAccordion } from "./ActionAccordion";
import { Dropdown } from "architecture/components/core";
import { actionsStore } from "architecture/api";
import { Icon } from "architecture/components/icon";
import { c } from "architecture";
import { t } from "architecture/lang";

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
      <h3>{t("step_builder_actions_management_title")}</h3>
      {actions.map((action, index) => {
        return (
          <ActionAccordion
            key={`action-${index}-${action.type}`}
            modal={modal}
            action={action}
            onRemove={() => {
              // Check if the action is the last one
              if (actions.length === 1) {
                info.actions = [];
                setActions([]);
              } else {
                // Remove the action from the array with index
                const deepCopy = actions.slice();
                info.actions = deepCopy.splice(index, 1);
                setActions(deepCopy);
              }
            }}
          />
        );
      })}
      <div className={c("actions-management-add")}>
        <Dropdown
          key={`dropdown-${info.actions.length}`}
          options={actionsMemo}
          confirmNode={<Icon name="plus" />}
          confirmTooltip={t(
            "step_builder_actions_management_add_action_tooltip"
          )}
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
