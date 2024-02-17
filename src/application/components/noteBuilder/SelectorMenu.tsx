import React, { StrictMode, useEffect } from "react";
import { NoteBuilderType } from "./typing";
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
  const editor = noteBuilderType.modal.getMarkdownView();
  const actions = useNoteBuilderStore((store) => store.actions);
  useEffect(() => {
    if (editor) {
      actions.setIsCreationMode(false);
      if (editor.file) {
        actions.setTargetFolder(editor.file.path);
        actions.setTitle(editor.file.basename);
      }
    }
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
