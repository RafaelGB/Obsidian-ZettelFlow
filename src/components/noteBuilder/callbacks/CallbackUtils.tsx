import { WorkflowStep } from "config";
import { ZettelFlowElement } from "zettelkasten";
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

export function nextElement(
  state: CallbackPickedState,
  selected: WorkflowStep,
  info: NoteBuilderType
) {
  const { isRecursive } = selected;
  if (isRecursive) {
    const recursiveStep = findIdInWorkflow(
      selected.id,
      info.plugin.settings.workflow
    );
    if (!recursiveStep) {
      log.error(`Recursive step not found: ${selected.id}`);
      throw new Error("Recursive step not found");
    }
    selected = { ...recursiveStep, isRecursive };
  }
  const { data, actions } = state;
  const { plugin } = info;
  const { settings } = plugin;
  const { id } = selected;
  const selectedElement = settings.nodes[id];
  actions.setCurrentStep(selected);
  if (selectedElement.actions.length > 0 && !data.wasActionTriggered()) {
    manageAction(selectedElement, selected, state, info, 0);
  } else {
    manageElement(selectedElement, selected, state, info);
  }
}

export function manageAction(
  selectedElement: ZettelFlowElement,
  selected: WorkflowStep,
  state: CallbackPickedState,
  info: NoteBuilderType,
  position: number
) {
  const { actions } = state;
  const action = selectedElement.actions[position];
  if (selectedElement.actions.length <= position) {
    log.debug(`No more actions for element: "${selectedElement.label}"`);
    nextElement(state, selected, info);
  } else if (action.hasUI) {
    actions.setSectionElement(
      <ActionSelector
        {...info}
        action={action}
        actionStep={selected}
        position={position}
        key={`selector-action-${selectedElement.path}-${position}`}
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
    manageAction(selectedElement, selected, state, info, position + 1);
  }
}

export function manageElement(
  selectedElement: ZettelFlowElement,
  selected: WorkflowStep,
  state: CallbackPickedState,
  info: NoteBuilderType
) {
  const { actions, data } = state;
  const { modal } = info;
  const { children, isRecursive } = selected;
  actions.manageElementInfo(selectedElement, isRecursive);
  if (children && children.length > 1) {
    // Element Selector
    const childrenHeader = selectedElement.childrenHeader;
    actions.setSectionElement(
      <ElementSelector
        {...info}
        childen={children}
        key={`selector-children-${childrenHeader}`}
      />,
      {
        isOptional: false,
        savePrevious: !isRecursive,
      }
    );
    actions.setHeader({
      title: childrenHeader,
    });
  } else if (children && children.length === 1) {
    actions.setActionWasTriggered(false);
    nextElement(state, children[0], info);
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
