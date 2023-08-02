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
  const { settings } = noteBuilderType.plugin;
  const [headerState, setHeader] = useState<HeaderType>({
    title: "My first header",
  });

  const [sectionState, setSection] = useState<SectionType>({
    color: "red",
    position: 1,
    element: (
      <Select
        options={zettelFlowOptionRecord2Options(settings.rootSection)}
        callback={(selected) => {
          const section = settings.rootSection[selected];
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
