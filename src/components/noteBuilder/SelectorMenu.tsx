import React, { StrictMode, useEffect } from "react";
import { NoteBuilderType } from "./model/NoteBuilderModel";
import { useNoteBuilderStore } from "./state/NoteBuilderState";
import { WelcomeTutorial } from "./WelcomeTutorial";
import { Section } from "components/section";
import { Header } from "components/header";
import { NavBar } from "components/navbar";

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
      <NavBar {...noteBuilderType} />
      <Header />
      <Section {...noteBuilderType} />
    </>
  ) : (
    <WelcomeTutorial {...noteBuilderType} />
  );
}
