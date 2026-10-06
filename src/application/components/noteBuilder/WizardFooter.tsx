import React from "react";
import { c } from "architecture";
import { t } from "architecture/lang";
import { Icon } from "architecture/components/icon";
import { Platform } from "obsidian";
import { footerModel } from "./presentation";

/**
 * **The persistent footer** (#684, epic #676): Back · Skip this step · Build with what I have, and
 * the step's own Confirm on the right.
 *
 * It replaces two unlabelled icons at the top of the modal (a crossed box that meant *skip*, a
 * page that meant *build now*), a back chevron that disappeared on the first step, and a Confirm
 * that moved with every step. Every control has a word, keeps its place, and is disabled rather
 * than removed — nothing under the pointer shifts between steps.
 *
 * The Confirm is not drawn here: the step draws it into `confirmSlot` (see `ConfirmSlotContext`),
 * so its handler, refusal and hint stay with the answer they judge.
 */
export function WizardFooter(props: {
  canGoBack: boolean;
  canSkip: boolean;
  hasContent: boolean;
  building: boolean;
  onBack: () => void;
  onSkip: () => void;
  onBuild: () => void;
  confirmSlot: (element: HTMLDivElement | null) => void;
}) {
  const model = footerModel(props);
  return (
    <footer className={c("wizard-footer")}>
      <button
        type="button"
        className={c("wizard-footer-back")}
        disabled={!model.back.enabled}
        title={t("note_builder_previous_section")}
        onClick={props.onBack}
      >
        <Icon name="chevron-left" />
        {t("note_builder_back")}
      </button>
      <button
        type="button"
        className={`${c("wizard-footer-skip")}${model.skip.shown ? "" : " is-placeholder"}`}
        // Kept in the layout when the step cannot be skipped, so the controls after it never move.
        aria-hidden={!model.skip.shown}
        disabled={!model.skip.shown}
        onClick={props.onSkip}
      >
        {t("navbar_skip_step")}
      </button>
      <span className={c("wizard-footer-grow")} />
      <span className={c("wizard-footer-keys")}>
        <kbd>{Platform.isMacOS ? "⌘" : "Ctrl"}</kbd>+<kbd>Z</kbd> {t("note_builder_key_back")}
      </span>
      <button
        type="button"
        className={c("wizard-footer-build")}
        disabled={!model.build.enabled}
        title={t("navbar_abort_flow")}
        onClick={props.onBuild}
      >
        <Icon name="file-plus" />
        {t("note_builder_build_now")}
      </button>
      <div className={c("wizard-footer-confirm")} ref={props.confirmSlot} />
    </footer>
  );
}
