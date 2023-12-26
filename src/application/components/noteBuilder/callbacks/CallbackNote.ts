import { NoteBuilderType } from "application/components/noteBuilder";
import {
  ElementBuilderProps,
  ActionBuilderProps,
  CallbackPickedState,
} from "../model/NoteBuilderModel";
import { Literal } from "architecture/plugin";
import { manageAction, manageElement, nextElement } from "./CallbackUtils";
import { Notice } from "obsidian";
import { log } from "architecture";

export const callbackRootBuilder =
  (state: CallbackPickedState, info: NoteBuilderType) =>
    (selected: string) => {
      const { actions } = state;

      actions.initPluginConfig(info.plugin.settings)
        .then(() => {
          nextElement(state, selected, info);
        });
    };

export const callbackElementBuilder =
  (state: CallbackPickedState, info: ElementBuilderProps) =>
    (selected: string) => {
      nextElement(state, selected, info);
    };

export const callbackActionBuilder =
  (state: CallbackPickedState, info: ActionBuilderProps) =>
    (callbackResult: Literal) => {
      const { action, position, node } = info;
      const { actions } = state;
      actions.addAction(action, callbackResult);
      manageAction(node, state, info, position + 1);
    };

export const callbackSkipNote = (state: CallbackPickedState, info: NoteBuilderType) => () => {
  const { data } = state;
  const currentNode = data.getCurrentNode();
  if (!currentNode) {
    const message = "Current step is undefined after skip note callback";
    new Notice(message);
    return;
  }
  delete currentNode.path;
  log.info(`Skip note callback for node ${currentNode.id}`);

  manageElement(currentNode, state, info);
}

export const callbackBuildActualState = (state: CallbackPickedState, info: NoteBuilderType) => () => {
  const { data } = state;
  const currentNode = data.getCurrentNode();

  if (!currentNode) {
    const message = "Current step is undefined after build actual state callback";
    new Notice(message);
    return;
  }
  log.info(`Build actual state callback for node ${currentNode.id}`);
  manageElement(currentNode, state, info, true);
}
