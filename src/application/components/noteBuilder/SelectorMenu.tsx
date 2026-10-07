import React, { StrictMode, useEffect, useState } from "react";
import { Platform } from "obsidian";
import { c } from "architecture";
import { NoteBuilderType } from "./typing";
import { useNoteBuilderStore } from "./state/NoteBuilderState";
import { WelcomeTutorial } from "./WelcomeTutorial";
import { CompanionPane } from "./CompanionPane";
import { LiveRegion } from "./LiveRegion";
import { densityModifier, normalizeDensity } from "./presentation";
import { WizardErrorBoundary } from "./WizardErrorBoundary";
import { callbackBuildActualState, callbackSkipNote } from "./callbacks/CallbackNote";
import { t } from "architecture/lang";
import { ResumePrompt } from "./ResumePrompt";
import { draftStore } from "architecture/plugin/noteBuilder/DraftStore";
import { Section } from "application/components/section";
import { ConfirmSlotContext } from "architecture/components/core/confirmStep/ConfirmSlot";
import { TutorialType } from "./typing";
import { WalkStatus } from "./WalkStatus";
import { WizardFooter } from "./WizardFooter";

export function buildTutorial(noteBuilderType: TutorialType) {
  return (
    <StrictMode>
      <div className={c("wizard", "wizard-welcome")}>
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
      <Component {...noteBuilderType} />
    </StrictMode>
  );
}

function Component(noteBuilderType: NoteBuilderType) {
  const editor = noteBuilderType.modal.getMarkdownView();
  const actions = useNoteBuilderStore((store) => store.actions);
  const data = useNoteBuilderStore((store) => store.data);
  const enableSkip = useNoteBuilderStore((store) => store.enableSkip);
  const canGoBack = useNoteBuilderStore((store) => store.previousArray.length > 0);
  const hasContent = useNoteBuilderStore(
    (store) => store.builder.note.getPaths().size + store.builder.note.getElements().size > 0
  );
  // Remounting the step is what a retry means; the key change is the remount (#417).
  const [attempt, setAttempt] = useState(0);
  // Looked up once, when the flow opens: an unfinished walk for this canvas (#410).
  // A crystallize run (#712) is not a walk you resume: it is never offered one.
  const [draft, setDraft] = useState(() =>
    editor || noteBuilderType.modal.isSeeded() ? undefined : draftStore.offer(noteBuilderType.flow.canvasPath)
  );
  useEffect(() => {
    if (editor) {
      actions.setIsCreationMode(false);
      if (editor.file) {
        actions.setTargetFolder(editor.file.path);
        actions.setTitle(editor.file.basename);
      }
    }
    // What Think hands a crystallize flow: the title and the content, here so StrictMode's
    // remount (which resets the store) seeds again.
    const seed = noteBuilderType.modal.getCrystallizeSeed();
    if (seed) {
      actions.setCrystallizeSeed(seed);
      actions.setTitle(seed.title);
    }
    return () => {
      // Control global state resetting when the component is unmounted
      actions.reset();
    };
  }, []);

  // Where the step draws its Confirm (#684): a callback ref, so the step re-renders into the
  // footer the moment the footer exists.
  const [confirmSlot, setConfirmSlot] = useState<HTMLDivElement | null>(null);
  const building = useNoteBuilderStore((store) => store.section.color === "info");

  // The pane now runs in edit mode too, where it shows the diff against the note you are in
  // (#412); on mobile it collapses instead of disappearing (#409).
  const density = normalizeDensity(noteBuilderType.plugin.settings.wizardDensity);
  const modifier = densityModifier(density);
  const layout = [c("wizard"), ...(modifier ? [c(modifier)] : [])];

  if (draft) {
    return (
      <div className={layout.join(" ")}>
        <div className={c("wizard-card-stage")}>
          <ResumePrompt
            draft={draft}
            info={noteBuilderType}
            onDecided={() => setDraft(undefined)}
          />
        </div>
      </div>
    );
  }

  const skip = () => callbackSkipNote({ actions, data }, noteBuilderType)();
  const build = () => callbackBuildActualState({ actions, data }, noteBuilderType)();

  return (
    <ConfirmSlotContext.Provider value={confirmSlot}>
      <div
        className={layout.join(" ")}
        // Ctrl/Cmd+Enter confirms the step from anywhere in the wizard (#684) — the same Confirm
        // the footer shows, so the shortcut can never do something the button would not. A text
        // area that owns the chord (the prompt) handles it first and stops it there.
        onKeyDown={(event) => {
          if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey)) return;
          const confirm = confirmSlot?.querySelector<HTMLButtonElement>("button.mod-cta");
          if (!confirm) return;
          event.preventDefault();
          confirm.click();
        }}
      >
        <LiveRegion />
        <WalkStatus {...noteBuilderType} />
        <div className={c("wizard-body")}>
          <div
            className={c("note-builder-main")}
            // Undo/redo inside the wizard (#413), scoped to the step: Obsidian's own history belongs
            // to the editor, and the title field keeps its own.
            onKeyDown={(event) => {
              if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
              event.preventDefault();
              if (event.shiftKey) actions.redo();
              else if (useNoteBuilderStore.getState().previousArray.length > 0) actions.goPrevious();
            }}
          >
            <WizardErrorBoundary
              key={`step-boundary-${attempt}`}
              label={t("wizard_error_step")}
              onRetry={() => setAttempt((current) => current + 1)}
              onBack={canGoBack ? () => actions.goPrevious() : undefined}
              onSkip={enableSkip ? skip : undefined}
              onBuild={hasContent ? build : undefined}
            >
              <Section {...noteBuilderType} />
            </WizardErrorBoundary>
          </div>
          <WizardErrorBoundary label={t("wizard_error_pane")}>
            <CompanionPane {...noteBuilderType} collapsible={Platform.isMobile} />
          </WizardErrorBoundary>
        </div>
        <WizardFooter
          canGoBack={canGoBack}
          canSkip={enableSkip}
          hasContent={hasContent}
          building={building}
          onBack={() => actions.goPrevious()}
          onSkip={skip}
          onBuild={build}
          confirmSlot={setConfirmSlot}
        />
      </div>
    </ConfirmSlotContext.Provider>
  );
}
