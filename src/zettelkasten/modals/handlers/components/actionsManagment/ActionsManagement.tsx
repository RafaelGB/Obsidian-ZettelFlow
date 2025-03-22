// ActionsManagement.tsx
import React, { useState } from "react";
import { ActionsManagementProps } from "./typing";
import { ActionAccordion } from "./ActionAccordion";
import { Action, actionsStore } from "architecture/api";
import { t } from "architecture/lang";
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { v4 as uuid4 } from "uuid";
import { ActionAddMenu } from "./ActionAddMenu";
import { ActionBuilderMapper } from "zettelkasten/mappers/ActionBuilderMapper";

/**
 * ActionsManagement component manages the list of actions allowing
 * reordering via drag & drop, removal and addition of new actions.
 *
 * @param props - ActionsManagementProps containing the modal and initial actions.
 * @returns The actions management interface.
 */
export function ActionsManagement(props: ActionsManagementProps) {
  const { modal } = props;
  const { info } = modal;
  const [actionsState, setActionsState] = useState(info.actions);

  // Setup dndkit sensors with a minimum activation distance
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  /**
   * Handles the drag end event by computing the new order of actions.
   *
   * @param event - The drag end event from dndkit.
   */
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = actionsState.findIndex(
        (action) => action.id === active.id
      );
      const newIndex = actionsState.findIndex(
        (action) => action.id === over.id
      );
      if (oldIndex !== -1 && newIndex !== -1) {
        const newActionsState = arrayMove(actionsState, oldIndex, newIndex);
        setActionsState(newActionsState);
        info.actions = newActionsState;
      }
    }
  };

  return (
    <>
      <h3>{t("step_builder_actions_management_title")}</h3>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToVerticalAxis]}
      >
        <SortableContext
          items={actionsState.map((action) => action.id)}
          strategy={verticalListSortingStrategy}
        >
          {actionsState.map((action, index) => (
            <ActionAccordion
              key={action.id || uuid4()}
              modal={modal}
              action={action}
              index={index}
              onRemove={() => {
                if (actionsState.length === 1) {
                  info.actions = [];
                  setActionsState([]);
                } else {
                  const filteredActions = actionsState.filter(
                    (_, actionIndex) => actionIndex !== index
                  );
                  setActionsState(filteredActions);
                  info.actions = filteredActions;
                }
              }}
            />
          ))}
        </SortableContext>
      </DndContext>
      <ActionAddMenu
        modal={modal}
        onChange={(value, isTemplate) => {
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
