import React from "react";
import { create } from "zustand";
import { NoteBuilderState } from "../typing";
import { t } from "architecture/lang";
import { Builder } from "application/notes";

import setSelectionElementAction from "./actions/setSelectionElementAction";
import goPreviousAction from "./actions/goPreviousAction";
import infoStep from "./actions/infoState";
import { log } from "architecture";
import { Action, externalFns } from "architecture/api";
import { v4 as uuid4 } from "uuid";
import { FileService } from "architecture/plugin";

export const useNoteBuilderStore = create<NoteBuilderState>((set, get) => ({
  title: "",
  position: 0,
  currentAction: "",
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
        builder.note.setTitle(title);
        return {
          title: title,
          builder,
        };
      }),
    setInvalidTitle: (invalidTitle) => {
      const { builder, position } = get();
      if (invalidTitle) {
        builder.note.deletePos(position);
        set({ invalidTitle, builder, actionWasTriggered: true });
      } else {
        set({ invalidTitle });
      }
    },
    setTargetFolder: (targetFolder) =>
      set((state) => {
        const { builder } = state;
        builder.note.setTargetFolder(targetFolder);
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
    manageNodeInfo: (node, skipAddToBuilder) => {
      set((state) => {
        const { builder, position } = state;
        if (skipAddToBuilder) {
          log.debug(`Skipping manageElementInfo for element: ${node.label}`);
          return { builder };
        }
        builder.note
          .addPath(node.path, position)
          .setTargetFolder(node.targetFolder);

        return {
          builder,
        };
      });
    },
    addAction: (element, result) =>
      set((state) => {
        const { builder } = state;
        builder.note.addAction(element, result, state.position);
        return {
          builder,
          actionWasTriggered: true,
        };
      }),
    addJsFile: async (path) => {
      const jsFile = await FileService.getFile(path);
      if (jsFile) {
        const jsContent = await FileService.getContent(jsFile);
        set((state) => {
          const { builder, position } = state;
          const scriptAction: Action = {
            id: uuid4(),
            type: "script",
            hasUI: false,
            description: "Script file",
            code: jsContent,
          };
          builder.note.addBackgroundAction(scriptAction, position);
          return {
            builder,
            actionWasTriggered: true,
          };
        });
      }
    },

    addBackgroundAction: (action) =>
      set((state) => {
        const { builder, position } = state;
        const next = position + 1;
        builder.note.addBackgroundAction(action, next);
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
        currentAction: "",
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
        currentNode: undefined,
      });
    },
    initPluginConfig: async (settings) => {
      const extFns = await externalFns(settings);
      set((state) => {
        const { builder } = state;
        builder.externalFns = extFns;
        if (settings.uniquePrefixEnabled) {
          builder.note.setPattern(settings.uniquePrefix);
        }
        return {
          builder,
        };
      });
    },
    setActionWasTriggered: (actionWasTriggered) => {
      set({ actionWasTriggered });
    },
    setEnableSkip: (enableSkip) => {
      set({ enableSkip });
    },
    setCurrentNode: (currentNode) => {
      set({ currentNode });
    },
    /*
     * COMPLEX ACTIONS
     */
    setSectionElement: setSelectionElementAction(set, get),
    goPrevious: goPreviousAction(set, get),
  },
  data: infoStep(get),
}));
