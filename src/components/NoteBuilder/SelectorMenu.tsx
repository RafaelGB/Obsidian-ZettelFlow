import React, { StrictMode, useState } from "react";
import { NoteBuilderType } from "./model/NoteBuilderModel";
import {
  Select,
  Header,
  Section,
  HeaderType,
  SectionType,
} from "components/core";
import { zettelFlowOptionRecord2Options } from "components/core";
import { t } from "architecture/lang";
import { Builder, FinalNoteType } from "notes";
import { log } from "architecture";

export function buildSelectorMenu(noteBuilderType: NoteBuilderType) {
  return <NoteBuilder {...noteBuilderType} />;
}

function NoteBuilder(noteBuilderType: NoteBuilderType) {
  return (
    <StrictMode>
      <div>
        <Component {...noteBuilderType} />
      </div>
    </StrictMode>
  );
}

function Component(noteBuilderType: NoteBuilderType) {
  const { plugin, modal } = noteBuilderType;
  const { settings } = plugin;
  const [finalNoteState, setFinalNote] = useState<FinalNoteType>({
    title: "pruebas",
    targetFolder: "/",
  });
  const [headerState, setHeader] = useState<HeaderType>({
    title: t("flow_selector_placeholder"),
  });

  const [sectionState, setSection] = useState<SectionType>({
    color: "red",
    position: 1,
    element: (
      <Select
        options={zettelFlowOptionRecord2Options(settings.rootSection)}
        callback={(selected) => {
          const selectedSection = settings.rootSection[selected];
          if (selectedSection.children) {
            // TODO: setHeader and setSection
            // TODO: manage history
          } else {
            finalNoteState.targetFolder;
            // TODO: end the flow and create the new note with all the information
            Builder.init(finalNoteState).build();
            modal.close();
          }
        }}
      />
    ),
  });

  return (
    <>
      <Header {...headerState} />
      <Section {...sectionState} />
    </>
  );
}
