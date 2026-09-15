import React, { StrictMode, useEffect, useState } from "react";
import { Platform } from "obsidian";
import { c } from "architecture";
import { NoteBuilderType } from "./typing";
import { useNoteBuilderStore } from "./state/NoteBuilderState";
import { WelcomeTutorial } from "./WelcomeTutorial";
import { CompanionPane } from "./CompanionPane";
import { LiveRegion } from "./LiveRegion";
import { Breadcrumb } from "./Breadcrumb";
import { densityModifier, normalizeDensity } from "./presentation";
import { ResumePrompt } from "./ResumePrompt";
import { draftStore } from "architecture/plugin/noteBuilder/DraftStore";
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
  // Looked up once, when the flow opens: an unfinished walk for this canvas (#410).
  const [draft, setDraft] = useState(() =>
    editor ? undefined : draftStore.offer(noteBuilderType.flow.canvasPath)
  );
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

  // The pane now runs in edit mode too, where it shows the diff against the note you are in
  // (#412); on mobile it collapses instead of disappearing (#409).
  const showCompanionPane = true;
  const density = normalizeDensity(noteBuilderType.plugin.settings.wizardDensity);
  const modifier = densityModifier(density);
  const layout = [c("note-builder-layout"), ...(modifier ? [c(modifier)] : [])];

  if (draft) {
    return (
      <div className={layout.join(" ")}>
        <div className={c("note-builder-main")}>
          <ResumePrompt
            draft={draft}
            info={noteBuilderType}
            onDecided={() => setDraft(undefined)}
          />
        </div>
      </div>
    );
  }

  const wizard = (
    <div className={c("note-builder-main")}>
      <LiveRegion />
      <NavBar {...noteBuilderType} />
      <Header />
      <Breadcrumb />
      <Section {...noteBuilderType} />
    </div>
  );

  if (!showCompanionPane) {
    return <div className={layout.join(" ")}>{wizard}</div>;
  }

  return (
    <div className={layout.join(" ")}>
      {wizard}
      <CompanionPane {...noteBuilderType} collapsible={Platform.isMobile} />
    </div>
  );
}
