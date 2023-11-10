import { NoteBuilderType } from "components/noteBuilder";
import {
  ElementBuilderProps,
  ActionBuilderProps,
  CallbackPickedState,
} from "../model/NoteBuilderModel";
import { Literal } from "architecture/plugin";
import { WorkflowStep } from "config";
import { manageAction, manageElement, nextElement } from "./CallbackUtils";
import { Notice } from "obsidian";
import { log } from "architecture";

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
      const { action, actionStep, plugin, position } = info;
      const { settings } = plugin;
      const { actions } = state;
      actions.addAction(action, callbackResult);
      const selectedElement = settings.nodes[actionStep.id];
      manageAction(selectedElement, actionStep, state, info, position + 1);
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
  log.info("Skip note callback", { currentStep, element });
  manageElement(element, currentStep, state, info);
}

export const callbackBuildActualState = (state: CallbackPickedState, info: NoteBuilderType) => () => {
  const { data } = state;
  const { plugin } = info;
  const currentStep = data.getCurrentStep();

  if (!currentStep) {
    const message = "Current step is undefined after build actual state callback";
    new Notice(message);
    return;
  }
  // Force to finish the note here to avoid save info of the current step
  currentStep.children = [];
  const element = plugin.settings.nodes[currentStep.id];
  log.info("Build actual state callback", { currentStep, element });
  manageElement(element, currentStep, state, info);
}
