import { log } from "architecture";
import { t } from "architecture/lang";
import {
  NoteBuilderState,
  StoreNoteBuilderModifier,
} from "components/NoteBuilder";
import React from "react";

const goPreviousAction =
  (set: StoreNoteBuilderModifier, get: () => NoteBuilderState) => () => {
    const {
      previousSections,
      previousArray,
      nextSections,
      nextArray,
      position,
      section,
      header,
      builder,
    } = get();
    const previousPosition = previousArray.pop();
    if (previousPosition === undefined) {
      log.error("No previous position found");
      return;
    }
    log.trace(`goPrevious from ${position} to ${previousPosition}`);
    // On UI State
    const previousSection = previousSections.get(previousPosition);
    nextSections.set(position, {
      header: header,
      section: section,
      path: builder.info.getPath(previousPosition),
      element: builder.info.getElement(previousPosition),
    });
    previousSections.delete(previousPosition);
    // On Builder
    builder.info.deletePos(previousPosition);
    // Manage next if needed to avoid memory leaks
    const nexpPositionToDel = nextArray.pop();
    if (nexpPositionToDel !== undefined) {
      nextSections.delete(nexpPositionToDel);
    }
    nextArray.push(position);

    set({
      position: previousPosition,
      previousSections,
      previousArray,
      nextSections,
      nextArray,
      section: previousSection?.section || {
        color: "",
        element: <></>,
      },
      header: previousSection?.header || {
        title: t("flow_selector_placeholder"),
      },
      builder,
    });
  };

export default goPreviousAction;
