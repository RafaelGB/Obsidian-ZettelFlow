import { TFile, type App } from "obsidian";
import { ConceptualTimeline } from "architecture/plugin/timeline/ConceptualTimeline";
import { timelineEvents, judgementsFor, type TimelineEvent } from "architecture/knowledge/state";
import { MoveLog } from "architecture/plugin/thinking/MoveLog";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import { JudgementLog } from "architecture/plugin/judgement/JudgementLog";
import { statedWager } from "architecture/plugin/claims/statedClaim";

/** What the story is told from: every strand, and whether the history itself is being kept. */
export interface StoryStrands {
    events: TimelineEvent[];
    /** Whether snapshots are being recorded. Decides the history, never the strand (#564). */
    historyKept: boolean;
}

/**
 * Read every strand of one note's story (#642) — moved verbatim from the evolution timeline's
 * `recompute()`, which it replaces. Read-only: nothing here writes, and the note is the one it is
 * given — the companion's, pinned or followed — never the workspace's active file.
 */
export function readStory(app: App, path: string): StoryStrands {
    const timeline = ConceptualTimeline.getInstance();
    // Snapshots are opt-in because they store claim **texts**. That reason does not reach
    // the moves, the thoughts or the verdicts — none of them carries any — so the opt-in
    // decides whether there is a *history*, never whether there is a *timeline* (#564).
    //
    // It used to decide both: `recompute()` emptied the stream and returned before any of
    // the other three strands were read, so a user with snapshots off had moves and
    // nowhere to read them. The test that was supposed to catch it only checked that
    // `timeline.enabled()` appeared before `timelineEvents`, which it did.
    const historyKept = timeline.enabled();
    const file = app.vault.getAbstractFileByPath(path);
    const active = file instanceof TFile ? file : null;
    const snapshots = active && historyKept ? timeline.snapshotsFor(active.path) : [];
    // The judgement log is scope-filtered and path-exact; an idea with no verdicts adds nothing,
    // so a note that was never ruled on renders exactly the pre-#362 timeline.
    const judgements = active ? judgementsFor(JudgementLog.getInstance().entries(), active.path) : [];
    // The moves strand renders even when snapshot recording is off: the timeline is
    // opt-in because it stores claim *texts*, and a move stores none — so the reason for
    // the opt-in does not reach it (#494).
    const moves = active ? MoveLog.getInstance().forSubject(active.path) : [];
    // The thoughts written about this note (#540). Nothing recorded them: a thought already
    // carries the note it is about, so this reads a link that was always in the data --
    // which is why a thought written months ago shows up the first time you look. Read from
    // the metadata cache, so a strand does not cost a folder of file reads per render.
    const thoughts = active ? ThoughtStore.getInstance().about(active.path) : [];
    // The day you expect to know by (#572) — read from the note itself, like the wager it
    // belongs to, and absent for every note that is not holding one.
    const wager = active ? statedWager(active) : undefined;
    const events = timelineEvents(snapshots, judgements, moves, thoughts, wager);
    return { events, historyKept };
}
