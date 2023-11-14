import React, { StrictMode, useEffect } from "react";
import { NoteBuilderType } from "./model/NoteBuilderModel";
import { useNoteBuilderStore } from "./state/NoteBuilderState";
import { WelcomeTutorial } from "./WelcomeTutorial";
import { Section } from "application/components/section";
import { Header } from "application/components/header";
import { NavBar } from "application/components/navbar";
import { TutorialType } from "./typing";

export function buildTutorial(noteBuilderType: TutorialType) {
  return (
    <StrictMode>
      <div>
        <WelcomeTutorial {...noteBuilderType} />
      </div>
    </StrictMode>
  );
}

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
  const actions = useNoteBuilderStore((store) => store.actions);
  useEffect(() => {
    return () => {
      // Control global state resetting when the component is unmounted
      actions.reset();
    };
  }, []);

  return (
    <>
      <NavBar {...noteBuilderType} />
      <Header />
      <Section {...noteBuilderType} />
    </>
  );
}
