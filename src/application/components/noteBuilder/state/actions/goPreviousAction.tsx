import { log } from "architecture";
import { captureContributions, pushRedo } from "../../walkHistory";
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
    // On Builder — captured first, so redo can put it back (#413).
    const contribution = captureContributions(
      builder.note.getPaths(),
      builder.note.getElements(),
      previousPosition
    );
    builder.note.deletePos(previousPosition);
    set({
      redoStack: previousSection
        ? pushRedo(get().redoStack, {
            position: previousPosition,
            section: previousSection,
            contribution,
          })
        : get().redoStack,
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
      currentAction: previousSection?.actionType || "",
    });
  };

export default goPreviousAction;
