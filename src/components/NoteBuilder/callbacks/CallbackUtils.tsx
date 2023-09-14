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
  if (selectedElement.element.type !== "bridge" && !data.wasActionTriggered()) {
    manageAction(selectedElement, selected, state, info);
  } else {
    manageElement(selectedElement, selected, state, info);
  }
}

export function manageAction(
  selectedElement: ZettelFlowElement,
  selected: WorkflowStep,
  state: CallbackPickedState,
  info: NoteBuilderType
) {
  const { actions } = state;
  actions.setSectionElement(
    <ActionSelector
      {...info}
      action={selectedElement}
      actionStep={selected}
      key={`selector-action-${selectedElement.path}`}
    />,
    { isOptional: selectedElement.optional, savePrevious: true }
  );
  actions.setHeader({
    title:
      selectedElement.element.label || `${selectedElement.element.type} action`,
  });
}

export function manageElement(
  selectedElement: ZettelFlowElement,
  selected: WorkflowStep,
  state: CallbackPickedState,
  info: NoteBuilderType
) {
  const { actions, data } = state;
  const { modal, plugin } = info;
  const { settings } = plugin;
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
        isOptional: selectedElement.optional,
        savePrevious: !isRecursive,
      }
    );
    actions.setHeader({
      title: childrenHeader,
    });
  } else if (children && children.length === 1) {
    const nextStep = children[0];
    const uniqueChild = settings.nodes[nextStep.id];
    actions.setActionWasTriggered(false);
    if (uniqueChild.element.type === "bridge") {
      actions.addBridge(uniqueChild);
    }
    nextElement(state, nextStep, info);
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
