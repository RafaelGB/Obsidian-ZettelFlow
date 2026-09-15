import React from "react";
import { c } from "architecture";
import { t } from "architecture/lang";
import { ConfirmModal } from "architecture/components/settings";
import { actionsStore } from "architecture/api";
import { useNoteBuilderStore } from "./state/NoteBuilderState";
import { alreadyApplied, discardedCount } from "./walkHistory";
import { NoteBuilderType } from "./typing";

/**
 * The path walked so far (#408), now navigable (#413): canvas › step › step › current.
 *
 * Activating an entry returns to that step and discards the answers given after it, so the note
 * always matches the visible path. More than one step is confirmed first, and the confirmation says
 * plainly when a discarded step already had an effect that cannot be unwound (a script, an AI call):
 * you are told, not blocked.
 */
export function Breadcrumb(props: NoteBuilderType) {
  const previousArray = useNoteBuilderStore((store) => store.previousArray);
  const previousSections = useNoteBuilderStore((store) => store.previousSections);
  const header = useNoteBuilderStore((store) => store.header);
  const activeCanvasName = useNoteBuilderStore((store) => store.activeCanvasName);
  const actions = useNoteBuilderStore((store) => store.actions);

  const walked = previousArray.map((position) => ({
    position,
    title: previousSections.get(position)?.header.title ?? "",
    actionType: previousSections.get(position)?.actionType,
  }));

  if (walked.length === 0 && !activeCanvasName) return null;

  const full = [activeCanvasName, ...walked.map((step) => step.title), header.title]
    .filter(Boolean)
    .join(" › ");

  const jump = (index: number) => {
    const discards = discardedCount(previousArray, index);
    if (discards <= 1) {
      actions.jumpToStep(index);
      return;
    }
    const applied = alreadyApplied(
      walked.slice(index).map((step) => ({
        title: step.title,
        actionType: step.actionType,
        category: step.actionType ? categoryOf(step.actionType) : undefined,
      }))
    );
    const question = applied.length
      ? `${t("note_builder_jump_confirm", String(discards))}\n${t(
          "note_builder_jump_applied",
          applied.join(", ")
        )}`
      : t("note_builder_jump_confirm", String(discards));
    new ConfirmModal(
      props.plugin.app,
      question,
      t("note_builder_jump_accept"),
      t("inquiry_cancel"),
      async () => actions.jumpToStep(index)
    ).open();
  };

  return (
    <nav className={c("breadcrumb")} aria-label={t("note_builder_breadcrumb_label")}>
      <ol className={c("breadcrumb-list")} title={full}>
        {activeCanvasName && (
          <li className={c("breadcrumb-item", "breadcrumb-item-canvas")}>{activeCanvasName}</li>
        )}
        {walked.map((step, index) => (
          <li className={c("breadcrumb-item")} key={`crumb-${step.position}`}>
            <button
              type="button"
              className={c("breadcrumb-link")}
              aria-label={t("note_builder_jump_to", step.title, String(index + 1))}
              onClick={() => jump(index)}
            >
              {step.title}
            </button>
          </li>
        ))}
        <li className={c("breadcrumb-item", "breadcrumb-item-current")} aria-current="step">
          {header.title}
        </li>
      </ol>
    </nav>
  );
}

/** An action's category, when it is registered; unknown types are treated as replayable. */
function categoryOf(actionType: string): string | undefined {
  try {
    return actionsStore.getAction(actionType).category;
  } catch {
    return undefined;
  }
}
