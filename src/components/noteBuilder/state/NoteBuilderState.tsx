import React from "react";
import { create } from "zustand";
import { NoteBuilderState } from "../model/NoteBuilderModel";
import { t } from "architecture/lang";
import { Builder } from "notes";

import { Notice } from "obsidian";
import setSelectionElementAction from "./actions/setSelectionElementAction";
import goPreviousAction from "./actions/goPreviousAction";
import infoStep from "./actions/infoState";
import { log } from "architecture";

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
      set((state) => {
        const { builder, position } = state;
        if (skipAddToBuilder) {
          log.debug(`Skipping manageElementInfo for element: ${element.label}`);
          return { builder };
        }
        builder.info
          .addPath(element.path, position)
          .setTargetFolder(element.targetFolder);

        return {
          builder,
        };
      });
    },
    addAction: (element, result) =>
      set((state) => {
        const { builder } = state;
        builder.info.addAction(element, result, state.position);
        return {
          builder,
          actionWasTriggered: true,
        };
      }),
    addBackgroundAction: (action) =>
      set((state) => {
        const { builder, position } = state;
        const next = position + 1;
        builder.info.addBackgroundAction(action, next);
        return {
          builder,
          actionWasTriggered: true,
          position: next,
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
        enableSkip: false,
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
