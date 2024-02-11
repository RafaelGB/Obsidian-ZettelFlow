import { CallbackPickedState, NoteBuilderType } from "../typing";
import { ActionSelector } from "../ActionSelector";
import React from "react";
import { ElementSelector } from "../ElementSelector";
import { Notice } from "obsidian";
import { FatalError, WarningError, ZettelError, log } from "architecture";
import { FileService } from "architecture/plugin";
import { FlowNode } from "architecture/plugin/canvas";
import { t } from "architecture/lang";

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
      {
        actionType: action.type,
        isOptional: selectedElement.optional,
        savePrevious: true,
      }
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
  const { actions } = state;
  if (selectedElement.extension === "js" && selectedElement.path) {
    await actions.addJsFile(selectedElement.path);
  } else {
    actions.manageNodeInfo(selectedElement);
  }

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
      title: childrenHeader || t("default_selector_title"),
    });
  } else if (childrens.length === 1) {
    actions.setActionWasTriggered(false);
    nextElement(state, childrens[0].id, info);
  } else {
    // Build and close modal
    actions
      .build(info.modal)
      .then(async (path) => {
        modal.close();
        FileService.openFile(path);
      })
      .catch((error: ZettelError) => {
        log.error(error);
        switch (error.getType()) {
          case ZettelError.WARNING_TYPE: {
            new Notice(`Error building note: ${error.message}`);
            manageWarningError(actions, error);
          }
          case ZettelError.FATAL_TYPE: {
            new Notice(`Fatal error: ${error.message}`);
            manageFatalError(actions, error);
            break;
          }
          default: {
            new Notice(`Not controlled error: ${error.message}`);
            modal.close();
          }
        }
        actions.setInvalidTitle(true);
      });
  }
}

function manageFatalError(
  actions: CallbackPickedState["actions"],
  error: FatalError
) {
  switch (error.getCode()) {
    case FatalError.INVALID_TITLE: {
      actions.setInvalidTitle(true);
      break;
    }
    default: {
      log.warn("Unknown fatal error");
    }
  }
}

function manageWarningError(
  _: CallbackPickedState["actions"],
  error: WarningError
) {
  switch (error.getCode()) {
    default: {
      log.warn("Unknown fatal error");
    }
  }
}
