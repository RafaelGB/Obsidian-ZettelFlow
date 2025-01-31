import React, { useMemo, useState } from "react";
import { ActionsManagementProps } from "./typing";
import { ActionAccordion } from "./ActionAccordion";
import { Action, actionsStore } from "architecture/api";
import { t } from "architecture/lang";
import { DndScope, Sortable } from "architecture/components/dnd";
import { ACTIONS_ACCORDION_DND_ID } from "../shared/Identifiers";
import { ActionsManager } from "../shared/managers/ActionsManager";
import { v4 as uuid4 } from "uuid";
import { ActionAddMenu } from "./ActionAddMenu";
import { ActionBuilderMapper } from "zettelkasten/mappers/ActionBuilderMapper";

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
        modal={modal}
        onChange={async (value, isTemplate) => {
          if (typeof value === "string") {
            const deepCopy = [...actionsState];
            let newAction: Action;
            if (isTemplate) {
              const templateAction =
                modal.getPlugin().settings.installedTemplates.actions[value];
              newAction =
                ActionBuilderMapper.CommunityActionSettings2Action(
                  templateAction
                );
            } else {
              newAction = actionsStore.getDefaultActionInfo(value);
            }
            deepCopy.push(newAction);
            setActionsState(deepCopy);
            info.actions = deepCopy;
          }
        }}
      />
    </>
  );
}
