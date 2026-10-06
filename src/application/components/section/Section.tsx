import React, { CSSProperties } from "react";
import { c } from "architecture";
import { t } from "architecture/lang";
import { actionsStore } from "architecture/api";
import { Icon } from "architecture/components/icon";
import type { NoteBuilderType } from "application/components/noteBuilder/typing";
import { RootSelector } from "application/components/noteBuilder/RootSelector";
import { useNoteBuilderStore } from "application/components/noteBuilder/state/NoteBuilderState";
import { accentColour } from "application/components/noteBuilder/presentation";
import { PHASE_LABEL_KEY } from "zettelkasten/phases";

/**
 * The step in front of you (#684, epic #676): a heading that says what it asks, then the answer.
 *
 * The question used to be a `<p>` whose stylesheet set `size:` — not a CSS property, so the most
 * important line in the wizard rendered at body size. It is a real heading now, with a kicker that
 * says which phase of the note's arc this step advances, what kind of answer it wants and whether it
 * can be skipped. The kicker is words, never colour alone: the phase dot only repeats the label.
 *
 * The whole block is keyed by the step, so a new step mounts — and slides in — as a whole.
 */
export function Section(props: NoteBuilderType) {
  const section = useNoteBuilderStore((store) => store.section);
  const currentNode = useNoteBuilderStore((store) => store.currentNode);
  const { element } = section;
  // The step's canvas colour reaches the stylesheet as a custom property; painting it is the
  // stylesheet's job (#406). It comes from the current node (#409) — `section.color` is only ever
  // "" or "info", so the accent it used to carry was never a colour at all.
  const value = accentColour(currentNode?.color);
  const accent = value ? ({ "--zf-step-accent": value } as CSSProperties) : undefined;
  const classes = value ? c("section", "section-accented") : c("section");
  const key = element.key ? `section-${element.key}` : "section-root";
  return (
    <div className={classes} key={key} style={accent}>
      <StepHeading />
      {element.key ? element : <RootSelector {...props} />}
    </div>
  );
}

function StepHeading() {
  const header = useNoteBuilderStore((store) => store.header);
  const currentAction = useNoteBuilderStore((store) => store.currentAction);
  const currentNode = useNoteBuilderStore((store) => store.currentNode);
  const enableSkip = useNoteBuilderStore((store) => store.enableSkip);
  const building = useNoteBuilderStore((store) => store.section.color === "info");

  const phase = currentNode?.phase;
  const kind = currentAction ? actionLabel(currentAction) : undefined;

  return (
    <div className={c("step-heading")}>
      {!building && (phase || kind || enableSkip) && (
        <div className={c("step-kicker")}>
          {phase && (
            <span className={c("step-kicker-phase")}>
              <span className={c("step-kicker-dot")} aria-hidden="true" />
              {t(PHASE_LABEL_KEY[phase])}
            </span>
          )}
          {kind && (
            <span className={c("step-kicker-kind")}>
              <Icon name={kind.icon} />
              {kind.label}
            </span>
          )}
          {enableSkip && <span className={c("step-kicker-optional")}>{t("note_builder_step_optional")}</span>}
        </div>
      )}
      <h2 className={c("step-title")}>{header.title}</h2>
    </div>
  );
}

/** An action's friendly name and icon; an unregistered type still says something. */
function actionLabel(type: string): { label: string; icon: string } | undefined {
  try {
    return { label: actionsStore.getLabelOf(type), icon: `${actionsStore.getIconOf(type)}` };
  } catch {
    return undefined;
  }
}
