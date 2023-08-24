import React from "react";
import { create } from "zustand";
import { NoteBuilderState, NoteBuilderStore } from "../model/NoteBuilderModel";
import { t } from "architecture/lang";

export function useNoteBuilderStore(): NoteBuilderStore {
  return create<NoteBuilderState>((set, get) => ({
    title: "",
    targetFolder: "/",
    section: {
      color: "",
      position: 0,
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
      setSectionElement: (element, extra) => {
        set({
          section: {
            ...get().section,
            ...extra,
            element: element,
            position: get().section.position + 1,
          },
        });
      },
      goPrevious: () => {},
      goNext: () => {},
    },
  }));
}
