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
import { FileService, Literal } from "architecture/plugin";
import { ElementSelector } from "components/NoteBuilder/ElementSelector";
import { WorkflowStep } from "config";
import { Builder, BuilderRoot } from "notes";

export const callbackRootBuilder =
  (
    state: Pick<NoteBuilderState, "actions" | "title">,
    info: NoteBuilderProps
  ) =>
  (selected: WorkflowStep) => {
    const { actions, title } = state;
    const { plugin } = info;
    const { settings } = plugin;
    const { nodes } = settings;
    const { id } = selected;
    const selectedSection = nodes[id];
    const builder = Builder.init({
      targetFolder: selectedSection.targetFolder || FileService.PATH_SEPARATOR,
    }).setTitle(title);
    nextElement(state, builder, selected, info, 0);
    actions.setTargetFolder(selectedSection.targetFolder);
  };

export const callbackElementBuilder =
  (
    state: Pick<NoteBuilderState, "actions" | "title">,
    info: ElementBuilderProps,
    pos: number
  ) =>
  (selected: WorkflowStep) => {
    const { builder } = info;
    nextElement(state, builder, selected, info, pos);
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
    nextElement(state, builder, actionStep, info, pos);
  };

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

function nextElement(
  state: Pick<NoteBuilderState, "actions" | "title">,
  builder: BuilderRoot,
  selected: WorkflowStep,
  info: NoteBuilderProps,
  pos: number
) {
  const { actions, title } = state;
  const { modal, plugin } = info;
  const { settings } = plugin;
  const { isRecursive } = selected;
  if (isRecursive) {
    selected = findIdInWorkflow(selected.id, settings.workflow) || selected;
  }
  const { id, children } = selected;
  const selectedElement = settings.nodes[id];
  if (
    selectedElement.element.type !== "bridge" &&
    !selectedElement.element.triggered
  ) {
    // Is an action
    selectedElement.element.triggered = true;
    actions.setSectionElement(
      <ActionSelector
        {...info}
        action={selectedElement}
        actionStep={selected}
        builder={builder}
        key={`selector-action-${selectedElement.path}`}
      />
    );
    actions.setHeader({
      title:
        selectedElement.element.label ||
        `${selectedElement.element.type} action`,
    });
    return;
  }
  delete selectedElement.element.triggered;
  if (children && children.length > 1) {
    builder.addPath(selectedElement.path, pos);
    // Element Selector
    const childrenHeader = selectedElement.childrenHeader;
    actions.setSectionElement(
      <ElementSelector
        {...info}
        childen={children}
        builder={builder}
        key={`selector-children-${childrenHeader}`}
      />
    );
    actions.setHeader({
      title: childrenHeader,
    });
  } else if (children && children.length === 1) {
    builder.addPath(selectedElement.path, pos);
    nextElement(state, builder, children[0], info, actions.incrementPosition());
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
