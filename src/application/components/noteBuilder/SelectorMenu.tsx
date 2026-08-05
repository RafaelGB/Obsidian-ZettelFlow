import React, { StrictMode, useEffect } from "react";
import { Platform } from "obsidian";
import { c } from "architecture";
import { NoteBuilderType } from "./typing";
import { useNoteBuilderStore } from "./state/NoteBuilderState";
import { WelcomeTutorial } from "./WelcomeTutorial";
import { CompanionPane } from "./CompanionPane";
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

  // The companion pane is desktop-only and creation-mode-only (FR-1, FR-10); on mobile or in
  // the editor flow the wizard renders unchanged.
  const showCompanionPane = !Platform.isMobile && !editor;

  if (!showCompanionPane) {
    return (
      <>
        <NavBar {...noteBuilderType} />
        <Header />
        <Section {...noteBuilderType} />
      </>
    );
  }

  return (
    <div className={c("note-builder-layout")}>
      <div className={c("note-builder-main")}>
        <NavBar {...noteBuilderType} />
        <Header />
        <Section {...noteBuilderType} />
      </div>
      <CompanionPane {...noteBuilderType} />
    </div>
  );
}
