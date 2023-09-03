import React from "react";
import { create } from "zustand";
import { NoteBuilderState } from "../model/NoteBuilderModel";
import { t } from "architecture/lang";
import { SectionType } from "components/core";
import { Builder } from "notes";
import { FileService } from "architecture/plugin";

export const useNoteBuilderStore = create<NoteBuilderState>((set, get) => ({
  title: "",
  targetFolder: "/",
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
    setTargetFolder: (targetFolder) => {
      if (targetFolder) {
        const { builder } = get();
        builder.setTargetFolder(targetFolder);
        set({ targetFolder, builder });
      }
    },
    setHeader: (partial) => {
      const { header } = get();
      set({ header: { ...header, ...partial } });
    },
    addBridge: () => set({ position: get().position + 1 }),
    incrementPosition: () => {
      const { position } = get();
      set({ position: position + 1 });
      return position + 1;
    },
    setSectionElement: (element, extra) => {
      const { previousSections, section, position, header } = get();
      const elementSection: SectionType = {
        ...section,
        ...extra,
        element: element,
      };
      if (position > 0) {
        previousSections.set(position, {
          header: header,
          section: section,
        });
      }
      set({
        position: position + 1,
        section: elementSection,
        previousSections: previousSections,
      });
    },
    goPrevious: () => {
      const { previousSections, nextSections, position, section, header } =
        get();
      const previousSection = previousSections.get(position - 1);
      nextSections.set(position, {
        header: header,
        section: section,
      });
      previousSections.delete(position - 1);
      nextSections.delete(position + 1);
      set({
        position: position - 1,
        previousSections: previousSections,
        nextSections: nextSections,
        section: previousSection?.section || { color: "", element: <></> },
        header: previousSection?.header || {
          title: t("flow_selector_placeholder"),
        },
      });
    },
    goNext: () => {
      const { previousSections, nextSections, position, section, header } =
        get();
      if (nextSections.size === 0) return;
      const nextSection = nextSections.get(position + 1);
      if (!nextSection) return;
      nextSections.delete(position + 1);
      previousSections.set(position, {
        header: header,
        section: section,
      });
      set({
        position: position + 1,
        nextSections: nextSections,
        previousSections: previousSections,
        section: nextSection.section,
        header: nextSection.header,
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
      await builder.build();
    },
  },
}));
