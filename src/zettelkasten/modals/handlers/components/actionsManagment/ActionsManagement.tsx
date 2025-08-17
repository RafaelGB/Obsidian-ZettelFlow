// ActionsManagement.tsx
import React, { useMemo, useState } from "react";
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
import { v7 as uuid7 } from "uuid";
import { ActionAddMenu } from "./ActionAddMenu";
import { ActionBuilderMapper } from "zettelkasten/mappers/ActionBuilderMapper";
import { log } from "architecture";
import { Icon } from "architecture/components/icon";
import { CommunityAction } from "config";

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

  const initialClipboard = useMemo(() => {
    const clipboardTemplate =
      modal.getPlugin().settings.communitySettings.clipboardTemplate;
    if (clipboardTemplate?.template_type === "action") {
      return clipboardTemplate as CommunityAction;
    }
    return null;
  }, []);

  const [actionsState, setActionsState] = useState(info.actions);
  const [actionClipboard, setActionClipboard] = useState(initialClipboard);

  // Setup dndkit sensors with a minimum activation distance
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  /**
   * Handles the paste action from the clipboard.
   * It retrieves the action from the clipboard, updates the actions state,
   * and clears the clipboard.
   */
  const handlePasteAction = () => {
    if (actionClipboard === null) {
      log.warn("No action in clipboard to paste.");
      return;
    }

    const clipboardAction =
      ActionBuilderMapper.CommunityActionSettings2Action(actionClipboard);
    updateActionsState([clipboardAction]);
    setActionClipboard(null);

    modal.getPlugin().settings.communitySettings.clipboardTemplate = undefined;
    modal.getPlugin().saveSettings();
  };

  /**
   * Handles the addition of a new action based on user selection.
   * It updates the actions state and modal info with the new action.
   * @param value  - The identifier of the action to add, can be a string or null.
   * @param isTemplate  - Indicates if the action is a template.
   */
  const handleAddAction = (value: string | null, isTemplate: boolean) => {
    log.debug(`Adding action: ${value}, isTemplate: ${isTemplate}`);

    if (typeof value === "string") {
      let newAction: Action;
      if (isTemplate) {
        const templateAction =
          modal.getPlugin().settings.installedTemplates.actions[value];
        newAction =
          ActionBuilderMapper.CommunityActionSettings2Action(templateAction);
      } else {
        newAction = actionsStore.getDefaultActionInfo(value);
      }
      updateActionsState([newAction]);
    }
  };

  const updateActionsState = (newActions: Action[]) => {
    const deepCopy = [...actionsState];
    deepCopy.push(...newActions);
    setActionsState(deepCopy);
    props.modal.info.actions = deepCopy;

    for (const newAction of newActions) {
      log.debug(
        `New action added: ${newAction.id}. Current actions:`,
        deepCopy
      );
    }
  };

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
      {actionClipboard !== null && (
        <button
          className="mod-cta"
          title="Paste copyed action"
          onClick={handlePasteAction}
        >
          <Icon name="clipboard-paste" />
        </button>
      )}
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
              key={action.id || uuid7()}
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
      <ActionAddMenu modal={modal} onChange={handleAddAction} />
    </>
  );
}
