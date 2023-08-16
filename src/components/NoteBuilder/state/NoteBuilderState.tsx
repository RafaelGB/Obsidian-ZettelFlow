import React from "react";
import { create } from "zustand";
import { NoteBuilderState, NoteBuilderStore } from "../model/NoteBuilderModel";
import { HeaderType } from "components/core";
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
    },
    actions: {
      setTitle: (title: string) => set({ title }),
      setTargetFolder: (targetFolder: string) => set({ targetFolder }),
      setHeader: (header: Partial<HeaderType>) =>
        set({ header: { ...get().header, ...header } }),
      setSectionElement: (element: JSX.Element) => {
        set({
          section: {
            ...get().section,
            element: element,
            position: get().section.position + 1,
          },
        });
      },
    },
  }));
}
