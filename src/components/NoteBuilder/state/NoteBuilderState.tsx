import React from "react";
import { create } from "zustand";
import { NoteBuilderState, NoteBuilderStore } from "../model/NoteBuilderModel";
import { t } from "architecture/lang";
import { SectionType } from "components/core";

export function useNoteBuilderStore(): NoteBuilderStore {
  return create<NoteBuilderState>((set, get) => ({
    title: "",
    targetFolder: "/",
    position: 0,
    previousPlaceholder: "",
    previousSections: [],
    nextPlaceholder: "",
    nextSections: [],
    section: {
      color: "",
      element: <></>,
    },
    header: {
      title: t("flow_selector_placeholder"),
      previousSections: [],
      nextSections: [],
    },
    actions: {
      setTitle: (title) => set({ title: title }),
      setTargetFolder: (targetFolder) => set({ targetFolder }),
      setHeader: (header) => set({ header: { ...get().header, ...header } }),
      addBridge: () => set({ position: get().position + 1 }),
      incrementPosition: () => {
        const { position } = get();
        set({ position: position + 1 });
        return position + 1;
      },
      setSectionElement: (element, extra) => {
        const { previousSections, section, position } = get();
        const elementSection: SectionType = {
          ...section,
          ...extra,
          element: element,
        };

        previousSections.push(elementSection);
        set({
          position: position + 1,
          section: elementSection,
          previousSections: previousSections,
        });
      },
      goPrevious: () => {
        const { previousSections, nextSections, position } = get();
        const currentSection = previousSections.pop();
        if (!currentSection) return;
        nextSections.push(currentSection);
        let previousSection = previousSections.pop();
        if (!previousSection) {
          previousSection = {
            color: "",
            element: <></>,
          };
        }

        set({
          position: position - 1,
          previousSections: previousSections,
          nextSections: nextSections,
          section: previousSection,
        });
      },
      goNext: () => {
        const { previousSections, nextSections, position } = get();
        const nextSection = nextSections.pop();
        if (!nextSection) return;
        previousSections.push(nextSection);
        set({
          position: position + 1,
          nextSections: nextSections,
          previousSections: previousSections,
          section: nextSection,
        });
      },
    },
  }));
}
