/**
 * One write at a time from the companion (#639 runtime audit).
 *
 * Insert link (the sections) and the next-step card both append to the note in front of you. Two
 * of them racing used to read the same content and the second write dropped the first link, while
 * both were recorded as appended. The appends are atomic now (`vault.process`), and on top of that
 * every companion write waits its turn here — so a quick second click is a second link, never a
 * lost one — and the view says it is busy, which greys the other write buttons out meanwhile.
 */

let tail: Promise<unknown> = Promise.resolve();
let pending = 0;
const listeners = new Set<(busy: boolean) => void>();

function notify(): void {
    for (const listener of listeners) listener(pending > 0);
}

/** Run `work` after every companion write queued before it, whether those succeeded or not. */
export function queueCompanionWrite<T>(work: () => Promise<T>): Promise<T> {
    pending++;
    notify();
    const run = tail.then(work, work);
    tail = run.then(
        () => undefined,
        () => undefined
    );
    return run.finally(() => {
        pending--;
        notify();
    });
}

/** Whether a companion write is queued or running. */
export function companionWriting(): boolean {
    return pending > 0;
}

/** Hear when the companion starts and stops writing. Returns how to stop listening. */
export function onCompanionWriting(listener: (busy: boolean) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** Test-only: forget every queued write, so one test's unfinished write cannot hold up the next. */
export function resetCompanionWrites(): void {
    tail = Promise.resolve();
    pending = 0;
    listeners.clear();
}
