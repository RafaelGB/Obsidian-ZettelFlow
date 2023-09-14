import React from "react";
import { create } from "zustand";
import { NoteBuilderState } from "../model/NoteBuilderModel";
import { t } from "architecture/lang";
import { Builder } from "notes";
import goPreviousAction from "./actions/goPreviousAction";
import setSelectionElementAction from "./actions/setSelectionElementAction";
import infoStep from "./actions/infoState";
import { Notice } from "obsidian";

export const useNoteBuilderStore = create<NoteBuilderState>((set, get) => ({
  title: "",
  position: 0,
  previousSections: new Map(),
  previousArray: [],
  invalidTitle: false,
  section: {
    color: "",
    element: <></>,
  },
  header: {
    title: t("flow_selector_placeholder"),
  },
  builder: Builder.default(),
  actionWasTriggered: false,
  enableSkip: false,
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
      const { builder, position } = get();
      if (invalidTitle) {
        new Notice("Title cannot be empty");
        builder.info.deletePos(position);
        set({ invalidTitle, builder, actionWasTriggered: true });
      } else {
        set({ invalidTitle });
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
    addBridge: () =>
      set((state) => {
        const { position } = state;
        const next = position + 1;
        return {
          position: next,
        };
      }),
    manageElementInfo: (element, skipAddToBuilder) => {
      if (!skipAddToBuilder) {
        set((state) => {
          const { builder, position } = state;
          builder.info
            .addPath(element.path, position)
            .setTargetFolder(element.targetFolder);
          return {
            builder,
          };
        });
      }
    },
    addElement: (element, result) =>
      set((state) => {
        const { builder } = state;
        builder.info.addElement(element, result, state.position);
        return {
          builder,
          actionWasTriggered: true,
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
        invalidTitle: false,
        section: {
          color: "",
          element: <></>,
        },
        header: {
          title: t("flow_selector_placeholder"),
        },
        actionWasTriggered: false,
        builder: Builder.default(),
        currentStep: undefined,
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
    setActionWasTriggered: (actionWasTriggered) => {
      set({ actionWasTriggered });
    },
    setEnableSkip: (enableSkip) => {
      set({ enableSkip });
    },
    setCurrentStep: (currentStep) => {
      set({ currentStep });
    },
    /*
     * COMPLEX ACTIONS
     */
    setSectionElement: setSelectionElementAction(set, get),
    goPrevious: goPreviousAction(set, get),
  },
  data: infoStep(get),
}));
