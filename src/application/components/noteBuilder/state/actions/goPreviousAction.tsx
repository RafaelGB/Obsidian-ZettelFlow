import { log } from "architecture";
import { t } from "architecture/lang";
import {
  NoteBuilderState,
  StoreNoteBuilderModifier,
} from "application/components/noteBuilder";
import React from "react";

const goPreviousAction =
  (set: StoreNoteBuilderModifier, get: () => NoteBuilderState) => () => {
    const { previousSections, previousArray, position, builder } = get();
    const previousPosition = previousArray.pop();
    if (previousPosition === undefined) {
      log.error("No previous position found");
      return;
    }
    log.trace(`goPrevious from ${position} to ${previousPosition}`);
    // On UI State
    const previousSection = previousSections.get(previousPosition);
    previousSections.delete(previousPosition);
    // On Builder
    builder.note.deletePos(previousPosition);
    set({
      position: previousPosition,
      previousSections,
      previousArray,
      section: previousSection?.section || {
        color: "",
        element: <></>,
      },
      header: previousSection?.header || {
        title: t("flow_selector_placeholder"),
      },
      builder,
      actionWasTriggered: false,
    });
  };

export default goPreviousAction;
