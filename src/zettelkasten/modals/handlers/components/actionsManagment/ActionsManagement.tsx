import React, { useState } from "react";
import { ActionsManagementProps } from "./typing";
import { ActionAccordion } from "./ActionAccordion";

export function ActionsManagement(props: ActionsManagementProps) {
  const { modal } = props;
  const { info } = modal;
  const [actions, setActions] = useState(info.actions);
  // template info.actions map
  const component = actions.map((action, index) => {
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
  return component;
}
