import React, { useMemo } from "react";
import { moment as obsidianMoment } from "obsidian";
import type MomentFn from "moment";
import { c } from "architecture";
import { t } from "architecture/lang";
import { describeDestination } from "application/notes";
import { flowAdjacency, remainingSteps } from "architecture/plugin/canvas/walkProgress";
import { NoteBuilderType } from "./typing";
import { useNoteBuilderStore } from "./state/NoteBuilderState";

const moment = obsidianMoment as unknown as typeof MomentFn;

/**
 * Where you are in the flow, and where the note will land (#408, epic #405).
 *
 * The wizard used to show `"{n} steps completed"` — a counter with no denominator — and never said
 * where the note would be written. Both answers are derivable: the position from the walked path, the
 * estimate from the longest remaining path in the flow graph, the destination from the same functions
 * the builder writes with. When the estimate cannot be computed honestly (a cycle, an unknown node),
 * the position is shown alone rather than a number the flow cannot stand behind.
 */
export function WalkStatus(props: NoteBuilderType) {
  const { flow } = props;
  const creationMode = useNoteBuilderStore((store) => store.creationMode);
  const previousArray = useNoteBuilderStore((store) => store.previousArray);
  const currentNode = useNoteBuilderStore((store) => store.currentNode);
  const position = useNoteBuilderStore((store) => store.position);
  const title = useNoteBuilderStore((store) => store.title);

  const step = previousArray.length + 1;

  const adjacency = useMemo(
    () => flowAdjacency(flow.data),
    [flow.data.nodes.length, flow.data.edges.length]
  );

  const remaining = useMemo(
    () => (currentNode ? remainingSteps(adjacency, currentNode.id) : undefined),
    [adjacency, currentNode]
  );

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

  return (
    <div className={c("walk-status")}>
      <span className={c("walk-status-position")}>
        {t("note_builder_step_position", String(step))}
      </span>
      {remaining !== undefined && remaining > 0 && (
        <span
          className={c("walk-status-remaining")}
          title={t("note_builder_steps_left_explanation")}
        >
          {t("note_builder_steps_left", String(remaining))}
        </span>
      )}
      {creationMode && (
        <span className={c("walk-status-destination")}>
          {destination.path
            ? t("note_builder_destination", destination.path)
            : t("note_builder_destination_pending")}
          {destination.locked && (
            <span className={c("walk-status-locked")}>
              {t("note_builder_destination_locked")}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
