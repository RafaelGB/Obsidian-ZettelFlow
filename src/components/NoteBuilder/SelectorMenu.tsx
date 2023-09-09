import React, { StrictMode, useEffect } from "react";
import { NoteBuilderType } from "./model/NoteBuilderModel";
import { Header, Section, Input, NavBar } from "components/core";
import { useNoteBuilderStore } from "./state/NoteBuilderState";
import { t } from "architecture/lang";
import { WelcomeTutorial } from "./WelcomeTutorial";

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
  const { plugin } = noteBuilderType;
  const { settings } = plugin;
  const actions = useNoteBuilderStore((store) => store.actions);
  useEffect(() => {
    return () => {
      // Control global state resetting when the component is unmounted
      actions.reset();
    };
  }, []);

  return settings.workflow?.length > 0 ? (
    <>
      <NavBar />
      <Header />
      <Section {...noteBuilderType} />
    </>
  ) : (
    <WelcomeTutorial {...noteBuilderType} />
  );
}
