import React from "react";
import { create } from "zustand";
import { NoteBuilderState } from "../model/NoteBuilderModel";
import { t } from "architecture/lang";
import { Builder } from "notes";
import goPreviousAction from "./actions/goPreviousAction";
import goNextAction from "./actions/goNextAction";
import setSelectionElementAction from "./actions/setSelectionElementAction";

export const useNoteBuilderStore = create<NoteBuilderState>((set, get) => ({
  title: "",
  position: 0,
  previousSections: new Map(),
  previousArray: [],
  nextSections: new Map(),
  nextArray: [],
  invalidTitle: false,
  section: {
    color: "",
    element: <></>,
  },
  header: {
    title: t("flow_selector_placeholder"),
  },
  builder: Builder.default(),
  actions: {
    /*
     * DIRECT ACTIONS
     */
    setTitle: (title) =>
      set((state) => {
        const { builder } = state;
        builder.info.setTitle(title);
        return {
          title: title,
          builder,
        };
      }),
    setInvalidTitle: (invalidTitle) => {
      const { invalidTitle: currentInvalidTitle } = get();
      if (currentInvalidTitle !== invalidTitle) {
        set({ invalidTitle: invalidTitle });
      }
    },
    setTargetFolder: (targetFolder) =>
      set((state) => {
        const { builder } = state;
        builder.info.setTargetFolder(targetFolder);
        return {
          builder,
        };
      }),
    setHeader: (partial) =>
      set((state) => ({
        header: { ...state.header, ...partial },
      })),
    addBridge: () => set({ position: get().position + 1 }),
    incrementPosition: () => {
      const { position } = get();
      set({ position: position + 1 });
      return position + 1;
    },
    manageElementInfo: (element, isRecursive) => {
      if (isRecursive) {
        // If the element comes from a recursive call, we don't want to add it to the path again
        return;
      }

      set((state) => {
        const { builder } = state;
        builder.info
          .addPath(element.path, state.position)
          .setTargetFolder(element.targetFolder);
        return {
          builder,
        };
      });
    },
    addElement: (element, result) =>
      set((state) => {
        const { builder } = state;
        builder.info.addElement(element, result, state.position);
        return {
          builder,
        };
      }),
    build: async () => {
      const { builder } = get();
      return await builder.build();
    },
    reset: () => {
      set({
        title: "",
        position: 0,
        previousSections: new Map(),
        previousArray: [],
        nextSections: new Map(),
        nextArray: [],
        invalidTitle: false,
        section: {
          color: "",
          element: <></>,
        },
        header: {
          title: t("flow_selector_placeholder"),
        },
        builder: Builder.default(),
      });
    },
    setPatternPrefix: (pattern) =>
      set((state) => {
        const { builder } = state;
        builder.info.setPattern(pattern);
        return {
          builder,
        };
      }),
    /*
     * COMPLEX ACTIONS
     */
    setSectionElement: setSelectionElementAction(set, get),
    goPrevious: goPreviousAction(set, get),
    goNext: goNextAction(set, get),
  },
}));
