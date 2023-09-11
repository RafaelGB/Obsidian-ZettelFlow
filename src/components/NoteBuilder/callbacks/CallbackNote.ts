import { NoteBuilderType } from "components/NoteBuilder";
import {
  ElementBuilderProps,
  ActionBuilderProps,
  CallbackPickedState,
} from "../model/NoteBuilderModel";
import { Literal } from "architecture/plugin";
import { WorkflowStep } from "config";
import { manageElement, nextElement } from "./CallbackUtils";
import { Notice } from "obsidian";

export const callbackRootBuilder =
  (state: CallbackPickedState, info: NoteBuilderType) =>
    (selected: WorkflowStep) => {
      const { actions } = state;
      const { uniquePrefix, uniquePrefixEnabled } = info.plugin.settings;
      if (uniquePrefixEnabled) {
        actions.setPatternPrefix(uniquePrefix);
      }
      nextElement(state, selected, info);
    };

export const callbackElementBuilder =
  (state: CallbackPickedState, info: ElementBuilderProps) =>
    (selected: WorkflowStep) => {
      nextElement(state, selected, info);
    };

export const callbackActionBuilder =
  (state: CallbackPickedState, info: ActionBuilderProps) =>
    (callbackResult: Literal) => {
      const { action, actionStep } = info;
      const { actions } = state;
      actions.addElement(action.element, callbackResult);
      nextElement(state, actionStep, info);
    };

export const callbackSkipNote = (state: CallbackPickedState, info: NoteBuilderType) => () => {
  const { data } = state;
  const { plugin } = info;
  const currentStep = data.getCurrentStep();
  if (!currentStep) {
    const message = "Current step is undefined after skip note callback";
    new Notice(message);
    return;
  }
  const element = plugin.settings.nodes[currentStep.id];
  // To avoid save info of the skipped note
  currentStep.isRecursive = true;
  manageElement(element, currentStep, state, info);
}
