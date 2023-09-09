import { Notice } from "obsidian";
import {
  ActionSelector,
  NoteBuilderType,
  NoteBuilderState,
} from "components/NoteBuilder";
import React from "react";
import {
  ElementBuilderProps,
  ActionBuilderProps,
} from "../model/NoteBuilderModel";
import { FileService, Literal } from "architecture/plugin";
import { ElementSelector } from "components/NoteBuilder/ElementSelector";
import { WorkflowStep } from "config";
import { log } from "architecture";
import { ZettelFlowElement } from "zettelkasten";

export const callbackRootBuilder =
  (state: Pick<NoteBuilderState, "actions" | "title">, info: NoteBuilderType) =>
  (selected: WorkflowStep) => {
    const { actions } = state;
    const { uniquePrefix, uniquePrefixEnabled } = info.plugin.settings;
    if (uniquePrefixEnabled) {
      actions.setPatternPrefix(uniquePrefix);
    }
    nextElement(state, selected, info);
  };

export const callbackElementBuilder =
  (
    state: Pick<NoteBuilderState, "actions" | "title">,
    info: ElementBuilderProps
  ) =>
  (selected: WorkflowStep) => {
    nextElement(state, selected, info);
  };

export const callbackActionBuilder =
  (
    state: Pick<NoteBuilderState, "actions" | "title">,
    info: ActionBuilderProps
  ) =>
  (callbackResult: Literal) => {
    const { action, actionStep } = info;
    const { actions } = state;
    actions.addElement(action.element, callbackResult);
    nextElement(state, actionStep, info);
  };

function nextElement(
  state: Pick<NoteBuilderState, "actions" | "title">,
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
    selected = recursiveStep;
  }
  const { plugin } = info;
  const { settings } = plugin;

  const { id } = selected;
  const selectedElement = settings.nodes[id];
  if (
    selectedElement.element.type !== "bridge" &&
    !selectedElement.element.triggered
  ) {
    manageAction(selectedElement, selected, state, info);
  } else {
    manageElement(selectedElement, selected, state, info);
  }
}

function manageAction(
  selectedElement: ZettelFlowElement,
  selected: WorkflowStep,
  state: Pick<NoteBuilderState, "actions" | "title">,
  info: NoteBuilderType
) {
  const { actions } = state;
  selectedElement.element.triggered = true;
  actions.setSectionElement(
    <ActionSelector
      {...info}
      action={selectedElement}
      actionStep={selected}
      key={`selector-action-${selectedElement.path}`}
    />,
    false
  );
  actions.setHeader({
    title:
      selectedElement.element.label || `${selectedElement.element.type} action`,
  });
}

function manageElement(
  selectedElement: ZettelFlowElement,
  selected: WorkflowStep,
  state: Pick<NoteBuilderState, "actions" | "title">,
  info: NoteBuilderType
) {
  const { actions, title } = state;
  const { modal } = info;
  const { children, isRecursive } = selected;
  delete selectedElement.element.triggered;
  if (children && children.length > 1) {
    actions.manageElementInfo(selectedElement, isRecursive);
    // Element Selector
    const childrenHeader = selectedElement.childrenHeader;
    actions.setSectionElement(
      <ElementSelector
        {...info}
        childen={children}
        key={`selector-children-${childrenHeader}`}
      />,
      !isRecursive
    );
    actions.setHeader({
      title: childrenHeader,
    });
  } else if (children && children.length === 1) {
    actions.manageElementInfo(selectedElement, isRecursive);
    actions.incrementPosition();
    nextElement(state, children[0], info);
  } else if (title) {
    actions.manageElementInfo(selectedElement, isRecursive);
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
    new Notice("Title cannot be empty");
  }
}

function findIdInWorkflow(
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
