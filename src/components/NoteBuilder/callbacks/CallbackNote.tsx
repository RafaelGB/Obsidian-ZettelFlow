import { Notice } from "obsidian";
import {
  ActionSelector,
  NoteBuilderProps,
  NoteBuilderState,
} from "components/NoteBuilder";
import React from "react";
import {
  ElementBuilderProps,
  ActionBuilderProps,
} from "../model/NoteBuilderModel";
import { Literal } from "architecture/plugin";
import { ElementSelector } from "components/NoteBuilder/ElementSelector";
import { WorkflowStep } from "config";
import { log } from "architecture";
import { ZettelFlowElement } from "zettelkasten";

export const callbackRootBuilder =
  (
    state: Pick<NoteBuilderState, "actions" | "title">,
    info: NoteBuilderProps
  ) =>
  (selected: WorkflowStep) => {
    const { actions } = state;
    const { plugin, builder } = info;
    const { settings } = plugin;
    const { nodes } = settings;
    const { id } = selected;
    const selectedSection = nodes[id];
    builder.setTargetFolder(selectedSection.targetFolder);
    nextElement(state, selected, info, 0);
    actions.setTargetFolder(selectedSection.targetFolder);
  };

export const callbackElementBuilder =
  (
    state: Pick<NoteBuilderState, "actions" | "title">,
    info: ElementBuilderProps,
    pos: number
  ) =>
  (selected: WorkflowStep) => {
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
    nextElement(state, selected, info, pos);
  };

export const callbackActionBuilder =
  (
    state: Pick<NoteBuilderState, "actions" | "title">,
    info: ActionBuilderProps,
    pos: number
  ) =>
  (callbackResult: Literal) => {
    const { action, builder, actionStep } = info;
    builder.addElement(action.element, callbackResult, pos);
    nextElement(state, actionStep, info, pos);
  };

function nextElement(
  state: Pick<NoteBuilderState, "actions" | "title">,
  selected: WorkflowStep,
  info: NoteBuilderProps,
  pos: number
) {
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
    manageElement(selectedElement, selected, state, info, pos);
  }
}

function manageAction(
  selectedElement: ZettelFlowElement,
  selected: WorkflowStep,
  state: Pick<NoteBuilderState, "actions" | "title">,
  info: NoteBuilderProps
) {
  const { actions } = state;
  selectedElement.element.triggered = true;
  actions.setSectionElement(
    <ActionSelector
      {...info}
      action={selectedElement}
      actionStep={selected}
      key={`selector-action-${selectedElement.path}`}
    />
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
  info: NoteBuilderProps,
  pos: number
) {
  const { actions, title } = state;
  const { modal, builder } = info;
  const { children } = selected;
  delete selectedElement.element.triggered;
  if (children && children.length > 1) {
    builder.addPath(selectedElement.path, pos);
    // Element Selector
    const childrenHeader = selectedElement.childrenHeader;
    actions.setSectionElement(
      <ElementSelector
        {...info}
        childen={children}
        key={`selector-children-${childrenHeader}`}
      />
    );
    actions.setHeader({
      title: childrenHeader,
    });
  } else if (children && children.length === 1) {
    builder.addPath(selectedElement.path, pos);
    nextElement(state, children[0], info, actions.incrementPosition());
  } else {
    if (title) {
      builder.addPath(selectedElement.path, pos);
      builder.setTitle(title);
      // Build and close modal
      builder.build();
      modal.close();
    } else {
      actions.setInvalidTitle(true);
      new Notice("Title cannot be empty");
    }
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
