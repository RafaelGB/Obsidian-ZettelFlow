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
    previousSections: new Map(),
    nextSections: new Map(),
    section: {
      color: "",
      element: <></>,
    },
    header: {
      title: t("flow_selector_placeholder"),
    },
    actions: {
      setTitle: (title) => set({ title: title }),
      setTargetFolder: (targetFolder) => set({ targetFolder }),
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
        if (section.element.key) {
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
        previousSections.delete(position);
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
    },
  }));
}
