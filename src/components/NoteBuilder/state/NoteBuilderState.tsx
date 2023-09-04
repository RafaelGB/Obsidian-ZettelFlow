import React from "react";
import { create } from "zustand";
import { NoteBuilderState } from "../model/NoteBuilderModel";
import { t } from "architecture/lang";
import { Builder } from "notes";
import { FileService } from "architecture/plugin";
import goPreviousAction from "./actions/goPreviousAction";
import goNextAction from "./actions/goNextAction";
import setSelectionElementAction from "./actions/setSelectionElementAction";
const initialState: Omit<NoteBuilderState, "actions"> = {
  title: "",
  position: 0,
  previousSections: new Map(),
  nextSections: new Map(),
  invalidTitle: false,
  section: {
    color: "",
    element: <></>,
  },
  header: {
    title: t("flow_selector_placeholder"),
  },
  builder: Builder.init({
    targetFolder: FileService.PATH_SEPARATOR,
  }),
};

export const useNoteBuilderStore = create<NoteBuilderState>((set, get) => ({
  ...initialState,
  actions: {
    /*
     * DIRECT ACTIONS
     */
    setTitle: (title) =>
      set((state) => ({
        title: title,
        builder: state.builder.setTitle(title),
      })),
    setInvalidTitle: (invalidTitle) => {
      const { invalidTitle: currentInvalidTitle } = get();
      if (currentInvalidTitle !== invalidTitle) {
        set({ invalidTitle: invalidTitle });
      }
    },
    setTargetFolder: (targetFolder) =>
      set((state) => ({
        builder: state.builder.setTargetFolder(targetFolder),
      })),
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
    manageElementInfo: (element) =>
      set((state) => {
        const { builder } = state;
        builder.addPath(element.path, state.position);
        builder.setTargetFolder(element.targetFolder);
        return {
          builder,
        };
      }),
    addElement: (element, result) =>
      set((state) => ({
        builder: state.builder.addElement(element, result, state.position),
      })),
    build: async () => {
      const { builder } = get();
      await builder.build();
    },
    reset: () => set({ ...initialState }),
    setPatternPrefix: (patternPrefix) =>
      set((state) => ({
        builder: state.builder.setUniquePrefixPattern(patternPrefix),
      })),
    /*
     * COMPLEX ACTIONS
     */
    setSectionElement: setSelectionElementAction(set, get),
    goPrevious: goPreviousAction(set, get),
    goNext: goNextAction(set, get),
  },
}));
