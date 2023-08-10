import React from "react";
import { create } from "zustand";
import {
  NoteBuilderState,
  NoteBuilderStore,
  NoteBuilderType,
} from "../model/NoteBuilderModel";
import { Select, zettelFlowOptionRecord2Options } from "components/core";
import { Builder, FinalNoteType } from "notes";
import { t } from "architecture/lang";

export function useNoteBuilderStore(
  noteBuilderType: NoteBuilderType
): NoteBuilderStore {
  const { plugin, modal } = noteBuilderType;
  const { settings } = plugin;
  return create<NoteBuilderState>((set, get) => ({
    title: "",
    targetFolder: "",
    section: {
      color: "",
      position: 0,
      element: (
        <Select
          key="select-root-section"
          options={zettelFlowOptionRecord2Options(settings.rootSection)}
          callback={(selected) => {
            const selectedSection = settings.rootSection[selected];
            set({ targetFolder: selectedSection.targetFolder });
            if (selectedSection.children) {
              // TODO: setHeader and setSection
              // TODO: manage history
            } else {
              // TODO: end the flow and create the new note with all the information
              const finalNoteState: FinalNoteType = {
                title: get().title,
                targetFolder: get().targetFolder,
              };
              Builder.init(finalNoteState).build();
              modal.close();
            }
          }}
        />
      ),
    },
    header: {
      title: t("flow_selector_placeholder"),
    },
    actions: {
      setTitle: (title: string) => set({ title }),
    },
  }));
}
