import { WorkflowStep } from "config";
import {
  CallbackPickedState,
  NoteBuilderType,
} from "../model/NoteBuilderModel";
import { ActionSelector } from "../ActionSelector";
import React from "react";
import { ElementSelector } from "../ElementSelector";
import { Notice } from "obsidian";
import { log } from "architecture";
import { FileService } from "architecture/plugin";
import { FlowNode } from "architecture/plugin/canvas";

export async function nextElement(
  state: CallbackPickedState,
  selected: string,
  info: NoteBuilderType
) {
  const { data, actions } = state;
  const { flow } = info;

  const selectedNode = await flow.get(selected);
  actions.setCurrentNode(selectedNode);
  if (selectedNode.actions.length > 0 && !data.wasActionTriggered()) {
    manageAction(selectedNode, state, info, 0);
  } else {
    manageElement(selectedNode, state, info);
  }
}

export function manageAction(
  selectedElement: FlowNode,
  state: CallbackPickedState,
  info: NoteBuilderType,
  position: number
) {
  const { actions } = state;
  const action = selectedElement.actions[position];
  if (selectedElement.actions.length <= position) {
    log.debug(`No more actions for element: "${selectedElement.label}"`);
    nextElement(state, selectedElement.id, info);
  } else if (action.hasUI) {
    actions.setSectionElement(
      <ActionSelector
        {...info}
        action={action}
        node={selectedElement}
        position={position}
        key={`selector-action-${selectedElement.id}-${position}`}
      />,
      { isOptional: selectedElement.optional, savePrevious: true }
    );
    actions.setHeader({
      title: action.description || `${action.type} action`,
    });
  } else {
    // Background element
    log.debug(`Action is a background element: "${action.description}"`);
    actions.addBackgroundAction(action);
    manageAction(selectedElement, state, info, position + 1);
  }
}

export async function manageElement(
  selectedElement: FlowNode,
  state: CallbackPickedState,
  info: NoteBuilderType,
  skipChildrens = false
) {
  const { actions, data } = state;
  actions.manageNodeInfo(selectedElement);

  const { modal, flow } = info;
  const childrens = skipChildrens
    ? []
    : await flow.childrensOf(selectedElement.id);

  if (childrens.length > 1) {
    // Element Selector
    const childrenHeader = selectedElement.childrenHeader;
    actions.setSectionElement(
      <ElementSelector
        {...info}
        childen={childrens}
        key={`selector-children-${childrenHeader}`}
      />,
      {
        isOptional: false,
      }
    );
    actions.setHeader({
      title: childrenHeader,
    });
  } else if (childrens.length === 1) {
    actions.setActionWasTriggered(false);
    nextElement(state, childrens[0].id, info);
  } else if (data.getTitle()) {
    // Build and close modal
    actions
      .build()
      .then(async (path) => {
        modal.close();
        FileService.openFile(path);
      })
      .catch((error) => {
        log.error(error);
        new Notice("Error building note. See console for details.");
      });
  } else {
    actions.setInvalidTitle(true);
  }
}

export function findIdInWorkflow(
  toFind: string,
  workflow: WorkflowStep[]
): WorkflowStep | undefined {
  for (const step of workflow) {
    if (step.id === toFind) return step;
    if (step.children) {
      const found = findIdInWorkflow(toFind, step.children);
      if (found) return found;
    }
  }
  return undefined;
}
