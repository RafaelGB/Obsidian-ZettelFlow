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
      incrementPosition: () => set({ position: get().position + 1 }),
      setSectionElement: (element, extra) => {
        const elementSection: SectionType = {
          ...get().section,
          ...extra,
          element: element,
        };
        const { previousSections } = get();
        previousSections.push(elementSection);
        set({
          position: get().position + 1,
          section: elementSection,
          previousSections: previousSections,
        });
      },
      goPrevious: () => {
        const { previousSections, nextSections, position } = get();
        const previousSection = previousSections.pop();
        if (!previousSection) return;
        nextSections.push(previousSection);
        set({
          position: position - 1,
          previousSections: previousSections,
          nextSections: nextSections,
          section:
            previousSections.length === 0
              ? {
                  color: "",
                  element: <></>,
                }
              : previousSection,
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
