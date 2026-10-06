import React, { useMemo } from "react";
import { moment as obsidianMoment } from "obsidian";
import type MomentFn from "moment";
import { c } from "architecture";
import { t } from "architecture/lang";
import { Icon } from "architecture/components/icon";
import { describeDestination } from "application/notes/destination";
import { resolveSatellite, SATELLITE_ERROR_KEYS } from "application/notes/satellitePlan";
import { flowAdjacency, remainingSteps } from "architecture/plugin/canvas/walkProgress";
import { NoteBuilderType } from "./typing";
import { useNoteBuilderStore } from "./state/NoteBuilderState";
import { Breadcrumb } from "./Breadcrumb";
import { walkProgress } from "./presentation";

const moment = obsidianMoment as unknown as typeof MomentFn;

/**
 * **One progress header** (#684, epic #676) — where you are, what the note is called, where it lands.
 *
 * It replaces three status rows that each said a part of it: a navbar with the title and two icon
 * buttons, a header with a back chevron, and a status line (#408) that said *"Step 2 · about 3 left"*
 * in small italic text. The title is edited in place, the destination is a chip that shows a lock
 * when the flow fixes the folder, and the position is a real bar — drawn only when the flow can
 * stand behind an estimate (#408), so a cycle never shows a bar that lies.
 *
 * Every value still comes from the same functions the builder writes with: `describeDestination`
 * for the path, `resolveSatellite` for the linked note, `remainingSteps` for the estimate.
 */
export function WalkStatus(props: NoteBuilderType) {
  const { flow, modal } = props;
  const creationMode = useNoteBuilderStore((store) => store.creationMode);
  const previousArray = useNoteBuilderStore((store) => store.previousArray);
  const currentNode = useNoteBuilderStore((store) => store.currentNode);
  const position = useNoteBuilderStore((store) => store.position);
  const title = useNoteBuilderStore((store) => store.title);
  const invalidTitle = useNoteBuilderStore((store) => store.invalidTitle);
  const actions = useNoteBuilderStore((store) => store.actions);

  const adjacency = useMemo(
    () => flowAdjacency(flow.data),
    [flow.data.nodes.length, flow.data.edges.length]
  );

  const remaining = useMemo(
    () => (currentNode ? remainingSteps(adjacency, currentNode.id) : undefined),
    [adjacency, currentNode]
  );

  const progress = walkProgress(previousArray.length + 1, remaining);

  const destination = useMemo(() => {
    const note = useNoteBuilderStore.getState().builder.note;
    return describeDestination({
      folder: note.getTargetFolder(),
      title,
      renderedPrefix: note.hasPattern()
        ? moment().format(note.getPattern())
        : undefined,
      locked: note.isTargetFolderLocked(),
    });
    // The builder is mutated in place, so these identity-changing values are the signal.
  }, [position, title]);

  // The linked note a walked step declared (#419), resolved through the **same** function the build
  // writes with — so the line cannot drift from what happens. It is a preview: a title pattern that
  // reads frontmatter converges as the walk fills it in.
  const satellite = useMemo(() => {
    const note = useNoteBuilderStore.getState().builder.note;
    const declaration = note.getSatellite();
    if (!declaration || !destination.path) return undefined;
    return resolveSatellite(declaration, {
      mainTitle: destination.filename,
      mainPath: destination.path,
      frontmatter: {},
      canvasName: modal.getCanvasName(),
    });
  }, [destination.path, destination.filename, position]);

  return (
    <header className={c("wizard-header")}>
      <div className={c("wizard-header-row")}>
        <div className={c("wizard-title")}>
          <Icon name="file-text" className={c("wizard-title-icon")} />
          {creationMode ? (
            <input
              type="text"
              className={`${c("wizard-title-input")}${invalidTitle ? " is-invalid" : ""}`}
              value={title}
              placeholder={t("note_title_placeholder")}
              aria-label={t("note_title_placeholder")}
              aria-invalid={invalidTitle}
              autoComplete="off"
              onChange={(event) => {
                actions.setTitle(event.target.value);
                actions.setInvalidTitle(false);
              }}
            />
          ) : (
            <span className={c("wizard-title-text")}>{title}</span>
          )}
        </div>
        {creationMode && (
          <span
            className={c("wizard-destination")}
            title={
              destination.path
                ? t("note_builder_destination", destination.path)
                : t("note_builder_destination_pending")
            }
          >
            <Icon name="folder" />
            <span className={c("wizard-destination-path")}>
              {destination.path || t("note_builder_destination_pending")}
            </span>
            {destination.locked && (
              <span className={c("wizard-destination-lock")} title={t("note_builder_destination_locked")}>
                <Icon name="lock" />
                <span className={c("visually-hidden")}>{t("note_builder_destination_locked")}</span>
              </span>
            )}
          </span>
        )}
      </div>
      {creationMode && satellite && (
        <p className={`${c("wizard-satellite")}${"error" in satellite ? " is-error" : ""}`}>
          <Icon name="link" />
          <span>
            {"error" in satellite
              ? t(SATELLITE_ERROR_KEYS[satellite.error])
              : t("satellite_destination_label", satellite.path, satellite.edge.key)}
          </span>
        </p>
      )}
      <div className={c("wizard-progress")}>
        {progress.percent !== undefined && (
          <div
            className={c("wizard-progress-track")}
            role="progressbar"
            aria-label={t("note_builder_progress_label")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
            // The width is the one value the stylesheet cannot know; it travels as a custom
            // property and the stylesheet draws it (§XV).
            style={{ "--zf-progress": `${progress.percent}%` } as React.CSSProperties}
          >
            <span className={c("wizard-progress-fill")} />
          </div>
        )}
        <span className={c("wizard-progress-text")}>
          <span className={c("wizard-progress-step")}>
            {t("note_builder_step_position", String(progress.step))}
          </span>
          {progress.remaining !== undefined && progress.remaining > 0 && (
            <span
              className={c("wizard-progress-left")}
              title={t("note_builder_steps_left_explanation")}
            >
              {" · "}
              {t("note_builder_steps_left", String(progress.remaining))}
            </span>
          )}
        </span>
      </div>
      <Breadcrumb {...props} />
    </header>
  );
}
