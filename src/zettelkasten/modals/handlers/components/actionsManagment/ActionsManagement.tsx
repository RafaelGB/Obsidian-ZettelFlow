import React, { useMemo, useState } from "react";
import { ActionsManagementProps } from "./typing";
import { ActionAccordion } from "./ActionAccordion";
import { Search } from "architecture/components/core";
import { actionsStore } from "architecture/api";
import { c } from "architecture";
import { t } from "architecture/lang";
import { DndScope, Sortable } from "architecture/components/dnd";
import { ACTIONS_ACCORDION_DND_ID } from "../shared/Identifiers";
import { ActionsManager } from "../shared/managers/ActionsManager";
import { v4 as uuid4 } from "uuid";
import { ActionAddMenu } from "./ActionAddMenu";

export function ActionsManagement(props: ActionsManagementProps) {
  const { modal } = props;
  const { info } = modal;
  const [actionsState, setActionsState] = useState(info.actions);

  const updateActions = (origin: number, dropped: number) => {
    const newOptionsState = [...actionsState];
    const originEntry = newOptionsState[origin];
    let auxEntry = newOptionsState[dropped];
    newOptionsState[dropped] = originEntry;
    // Once we swap the first element, sort the array between the origin and the dropped
    // element to keep the order
    if (origin < dropped) {
      dropped--;
      while (origin <= dropped) {
        const aux = newOptionsState[dropped];
        newOptionsState[dropped] = auxEntry;
        auxEntry = aux;
        dropped--;
      }
    } else {
      dropped++;
      while (origin >= dropped) {
        const aux = newOptionsState[dropped];
        newOptionsState[dropped] = auxEntry;
        auxEntry = aux;
        dropped++;
      }
    }
    setActionsState(newOptionsState);
    info.actions = newOptionsState;
  };

  const actionsMemo: Record<string, string> = useMemo(() => {
    const record: Record<string, string> = {};
    actionsStore.getActionsKeys().forEach((key) => {
      const label = actionsStore.getAction(key).getLabel();
      record[label] = key;
    });
    return record;
  }, []);

  const managerMemo = useMemo(() => {
    return ActionsManager.init(updateActions);
  }, [actionsState]);

  return (
    <>
      <h3>{t("step_builder_actions_management_title")}</h3>
      <DndScope id={ACTIONS_ACCORDION_DND_ID} manager={managerMemo}>
        <Sortable axis="vertical">
          {actionsState.map((action, index) => {
            return (
              <ActionAccordion
                key={action.id || uuid4()} // LEGACY: This is to keep the id of the action
                modal={modal}
                action={action}
                index={index}
                onRemove={() => {
                  // Check if the action is the last one
                  if (actionsState.length === 1) {
                    info.actions = [];
                    setActionsState([]);
                  } else {
                    // Remove the action from the array with index
                    const filteredActions = [...actionsState].filter(
                      (_, actionIndex) => actionIndex !== index
                    );
                    setActionsState(filteredActions);
                    info.actions = filteredActions;
                  }
                }}
              />
            );
          })}
        </Sortable>
      </DndScope>
      <ActionAddMenu
        onChange={async (value) => {
          if (typeof value === "string") {
            const deepCopy = [...actionsState];
            deepCopy.push(actionsStore.getDefaultActionInfo(value));
            setActionsState(deepCopy);
            info.actions = deepCopy;
          }
        }}
      />
    </>
  );
}
