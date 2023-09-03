import React from "react";
import { create } from "zustand";
import { NoteBuilderState } from "../model/NoteBuilderModel";
import { t } from "architecture/lang";
import { SectionType } from "components/core";
import { Builder } from "notes";
import { FileService } from "architecture/plugin";
import { log } from "architecture";
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
    setSectionElement: (element) => {
      const { previousSections, section, position, header, builder } = get();
      const elementSection: SectionType = {
        ...section,
        element: element,
      };
      if (position > 0) {
        previousSections.set(position, {
          header: header,
          section: section,
          path: builder.getPath(position - 1),
          element: builder.getElement(position - 1),
        });
      }
      set({
        position: position + 1,
        section: elementSection,
        previousSections: previousSections,
        nextSections: new Map(),
      });
      log.trace(`section set from ${position} to ${position + 1}`);
    },
    goPrevious: () => {
      const {
        previousSections,
        nextSections,
        position,
        section,
        header,
        builder,
      } = get();
      const previousPosition = position - 1;
      log.trace(`goPrevious from ${position} to ${previousPosition}`);

      const previousSection = previousSections.get(previousPosition);
      nextSections.set(position, {
        header: header,
        section: section,
        path: builder.getPath(previousPosition),
        element: builder.getElement(previousPosition),
      });
      previousSections.delete(previousPosition);
      nextSections.delete(position + 1);
      set({
        position: previousPosition,
        previousSections: previousSections,
        nextSections: nextSections,
        section: previousSection?.section || { color: "", element: <></> },
        header: previousSection?.header || {
          title: t("flow_selector_placeholder"),
        },
        builder: builder.removePositionInfo(position),
      });
    },
    goNext: () => {
      const {
        previousSections,
        nextSections,
        position,
        section,
        header,
        builder,
      } = get();
      if (nextSections.size === 0) return;
      const nextPosition = position + 1;
      const nextSection = nextSections.get(nextPosition);
      if (!nextSection) return;
      log.trace(`goNext from ${position} to ${nextPosition}`);
      nextSections.delete(nextPosition);
      previousSections.set(position, {
        header: header,
        section: section,
        path: nextSection.path,
        element: nextSection.element,
      });
      set({
        position: nextPosition,
        nextSections: nextSections,
        previousSections: previousSections,
        section: nextSection.section,
        header: nextSection.header,
        builder: builder
          .addPath(nextSection.path, position)
          .addFinalElement(nextSection.element, position),
      });
    },
    addPath: (path) =>
      set((state) => ({
        builder: state.builder.addPath(path, state.position),
      })),
    addElement: (element, result) =>
      set((state) => ({
        builder: state.builder.addElement(element, result, state.position),
      })),
    build: async () => {
      const { builder } = get();
      set({ ...initialState });
      await builder.build();
    },
  },
}));
