import React from "react";
import { createWithEqualityFn as create } from "zustand/traditional";
import { NoteBuilderState } from "../typing";
import { t } from "architecture/lang";
import { Builder } from "application/notes";

import setSelectionElementAction from "./actions/setSelectionElementAction";
import goPreviousAction from "./actions/goPreviousAction";
import infoStep from "./actions/infoState";
import { log } from "architecture";
import { Action } from "architecture/api";
import { v4 as uuid4 } from "uuid";
import { FileService } from "architecture/plugin";
import { resolveOnCreationActions } from "application/patterns/resolveOnCreationActions";
import { resolveSatelliteDeclaration } from "application/patterns/resolveSatelliteDeclaration";
import { restoreDraft, WizardDraft } from "application/notes/draftState";
import {
  bufferVerdict,
  flushVerdicts,
  suggestionSubject,
} from "application/notes/suggestionVerdicts";
import { JudgementLog } from "architecture/plugin/judgement/JudgementLog";
import { popRedo } from "../walkHistory";
import { RestoredStep } from "../RestoredStep";

export const useNoteBuilderStore = create<NoteBuilderState>((set, get) => ({
  creationMode: true,
  title: "",
  position: 0,
  linkVersion: 0,
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
  suggestionVerdicts: [],
  redoStack: [],
  hiddenBranches: [],
  // Progress bar properties
  pbValue: 0,
  pbElements: 0,
  pbElementsDone: 0,
  activeCanvasName: "",
  activeStepName: "",
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
          .addInlineBody(node.body, position)
          .setTargetFolder(node.targetFolder)
          .addOnCreation(resolveOnCreationActions(node))
          .setSatellite(resolveSatelliteDeclaration(node));

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
    build: async (modal) => {
      const { builder, actions } = get();
      set({
        pbValue: 0,
        pbElements: builder.note.getElements().size,
        pbElementsDone: 0,
      });

      return await builder.build(modal, actions);
    },
    reset: () => {
      set({
        creationMode: true,
        title: "",
        position: 0,
        linkVersion: 0,
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
        suggestionVerdicts: [],
        redoStack: [],
        hiddenBranches: [],
        builder: Builder.default(),
        currentNode: undefined,
      });
    },
    initPluginConfig: async (settings, currentFolder) => {
      set((state) => {
        const { builder } = state;
        if (settings.uniquePrefixEnabled) {
          builder.note.setPattern(settings.uniquePrefix);
        }
        if (currentFolder) {
          builder.note.lockTargetFolder(currentFolder);
        }
        return {
          builder,
        };
      });
    },
    setHiddenBranches: (hiddenBranches) => {
      set({ hiddenBranches });
    },
    jumpToStep: (index) => {
      set((state) => {
        const { previousArray, previousSections, builder } = state;
        const target = previousArray[index];
        if (target === undefined) return {};
        const saved = previousSections.get(target);
        // Everything from the target position on is discarded, so the note always matches the
        // visible path — no orphan frontmatter from a branch nobody walked any more.
        builder.note.deletePos(target);
        const remaining = new Map(previousSections);
        for (const position of previousArray.slice(index)) remaining.delete(position);
        return {
          position: target,
          previousArray: previousArray.slice(0, index),
          previousSections: remaining,
          section: saved?.section ?? { color: "", element: <></> },
          header: saved?.header ?? { title: t("flow_selector_placeholder") },
          currentAction: saved?.actionType ?? "",
          actionWasTriggered: false,
          // A jump is a new intention; the forward history it leaves behind is not resumable.
          redoStack: [],
          builder,
        };
      });
    },
    redo: () => {
      set((state) => {
        const { entry, rest } = popRedo(state.redoStack);
        if (!entry) return {};
        const { builder, previousArray, previousSections } = state;
        for (const [position, path] of entry.contribution.paths) {
          builder.note.addPath(path, position);
        }
        for (const [position, element] of entry.contribution.elements) {
          builder.note.addFinalElement(element, position);
        }
        const restored = new Map(previousSections);
        restored.set(entry.position, entry.section);
        return {
          builder,
          position: entry.position + 1,
          previousArray: [...previousArray, entry.position],
          previousSections: restored,
          section: entry.section.section,
          header: entry.section.header,
          currentAction: entry.section.actionType ?? "",
          redoStack: rest,
        };
      });
    },
    judgeSuggestion: (targetPath, verdict, detail) => {
      set((state) => ({
        suggestionVerdicts: bufferVerdict(state.suggestionVerdicts, {
          subject: suggestionSubject(targetPath),
          verdict,
          at: Date.now(),
          ...(detail?.note ? { note: detail.note } : {}),
          ...(detail?.confidence ? { confidence: detail.confidence } : {}),
        }),
      }));
    },
    flushSuggestionVerdicts: (notePath) => {
      const { suggestionVerdicts } = get();
      if (suggestionVerdicts.length === 0) return;
      const log = JudgementLog.getInstance();
      for (const judgement of flushVerdicts(suggestionVerdicts, notePath)) {
        log.record(judgement);
      }
      set({ suggestionVerdicts: [] });
    },
    snapshotDraft: (canvasPath) => {
      const { builder, title, position, previousArray, previousSections } = get();
      return {
        canvasPath,
        savedAt: Date.now(),
        title,
        position,
        targetFolder: builder.note.getTargetFolder(),
        walked: previousArray.map((walkedPosition) => ({
          position: walkedPosition,
          nodeId: previousSections.get(walkedPosition)?.nodeId ?? "",
          title: previousSections.get(walkedPosition)?.header.title ?? "",
        })),
        paths: builder.note.getPaths(),
        elements: builder.note.getElements(),
        links: builder.note.getLinks(),
        onCreation: builder.note.getOnCreation(),
        satellite: builder.note.getSatellite(),
      };
    },
    restoreFromDraft: (draft: WizardDraft) => {
      set((state) => {
        const { builder } = state;
        restoreDraft(draft, builder.note);
        const previousSections = new Map(state.previousSections);
        const previousArray: number[] = [];
        for (const step of draft.walked) {
          previousArray.push(step.position);
          previousSections.set(step.position, {
            header: { title: step.title },
            // A step answered before the pause: its result is in the note, and it is not replayed.
            section: { color: "", element: <RestoredStep /> },
            isAction: false,
            nodeId: step.nodeId,
          });
        }
        return {
          builder,
          title: draft.title,
          position: draft.position,
          previousArray,
          previousSections,
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
    setActiveContext: (activeCanvasName, activeStepName) => {
      set({ activeCanvasName, activeStepName });
    },
    insertLink: (basename) =>
      set((state) => {
        const { builder, linkVersion } = state;
        builder.note.addLink(basename);
        // linkVersion changes identity so the companion pane re-assembles the preview (#127).
        return { builder, linkVersion: linkVersion + 1 };
      }),
    setIsCreationMode: (creationMode) => {
      set({ creationMode });
    },
    setVisualSection: (section) => {
      set({ section });
    },
    pbFinishElement: () => {
      set((state) => {
        const { pbElementsDone, pbElements } = state;
        const next = pbElementsDone + 1;
        return {
          pbElementsDone: next,
          pbValue: (next / pbElements) * 100,
        };
      });
    },
    /*
     * COMPLEX ACTIONS
     */
    setSectionElement: setSelectionElementAction(set, get),
    goPrevious: goPreviousAction(set, get),
  },
  data: infoStep(get),
}));
