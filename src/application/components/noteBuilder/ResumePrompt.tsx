import React, { useState } from "react";
import { Notice } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { WizardDraft } from "application/notes/draftState";
import { draftStore } from "architecture/plugin/noteBuilder/DraftStore";
import { ConfirmModal } from "architecture/components/settings";
import { NoteBuilderType } from "./typing";
import { useNoteBuilderStore } from "./state/NoteBuilderState";
import { manageElement } from "./callbacks/CallbackUtils";

/**
 * The first thing a flow with unfinished work asks (#410, epic #405): resume, or start fresh.
 *
 * Resuming restores the answers into the note and re-enters the flow **at the node the wizard was
 * left on** — recorded results are put back, never replayed, because a step that already wrote
 * something cannot be unwound. Starting fresh is confirmed before anything is discarded.
 */
export function ResumePrompt({
  draft,
  info,
  onDecided,
}: {
  draft: WizardDraft;
  info: NoteBuilderType;
  onDecided: () => void;
}) {
  const actions = useNoteBuilderStore((store) => store.actions);
  const data = useNoteBuilderStore((store) => store.data);
  const [busy, setBusy] = useState(false);

  const resume = async () => {
    setBusy(true);
    try {
      actions.restoreFromDraft(draft);
      const last = [...draft.walked].reverse().find((step) => step.nodeId.length > 0);
      if (last) {
        const node = await info.flow.get(last.nodeId);
        actions.setCurrentNode(node);
        actions.setActiveContext(info.modal.getCanvasName(), node.label);
        await manageElement(node, { actions, data }, info);
      }
      onDecided();
    } catch (error) {
      // A flow that changed under the draft (a node deleted, a canvas rewritten) must not trap the
      // user in a broken resume: say so, drop it, and start fresh.
      log.error(`Could not resume the draft: ${String(error)}`);
      new Notice(t("note_builder_draft_resume_failed"));
      actions.reset();
      draftStore.clear(draft.canvasPath);
      onDecided();
    }
  };

  const startFresh = () => {
    new ConfirmModal(
      info.plugin.app,
      t("note_builder_draft_discard_confirm"),
      t("note_builder_draft_fresh"),
      t("inquiry_cancel"),
      async () => {
        draftStore.clear(draft.canvasPath);
        actions.reset();
        onDecided();
      }
    ).open();
  };

  const answered = draft.walked.length + draft.elements.length;

  return (
    <div className={c("resume-prompt")} role="dialog" aria-labelledby={c("resume-prompt-title")}>
      <h4 className={c("resume-prompt-title")} id={c("resume-prompt-title")}>
        {t("note_builder_draft_title")}
      </h4>
      <p className={c("resume-prompt-detail")}>
        {t(
          "note_builder_draft_detail",
          draft.title.trim() || t("note_builder_draft_untitled"),
          String(answered)
        )}
      </p>
      <div className={c("resume-prompt-actions")}>
        <button className="mod-cta" disabled={busy} onClick={() => void resume()}>
          {t("note_builder_draft_resume")}
        </button>
        <button disabled={busy} onClick={startFresh}>
          {t("note_builder_draft_fresh")}
        </button>
      </div>
    </div>
  );
}
