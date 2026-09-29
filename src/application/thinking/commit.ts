/**
 * The decision at the heart of committing a Lab thought, pulled out of the renderer so it can be
 * tested without a DOM (#596).
 *
 * It puts the one rule that matters in one place: an empty or whitespace-only draft writes
 * **nothing**, and the box is cleared **only after** the write succeeds — never before (#544, so a
 * failed save never eats the sentence you wrote).
 */
export type CommitOutcome = "empty" | "written" | "failed";

/**
 * @param draft   the raw text in the box (trimmed here)
 * @param write   writes the trimmed text; resolves `true` when it was written, `false` when the
 *                store answered nothing (e.g. the lab folder could not be read — #374)
 * @param clearAfterWrite  clears the draft/box; called **only** after a successful write
 */
export async function commitDraft(
    draft: string,
    write: (text: string) => Promise<boolean>,
    clearAfterWrite: () => void
): Promise<CommitOutcome> {
    const text = draft.trim();
    if (!text) return "empty";
    const written = await write(text);
    if (!written) return "failed";
    clearAfterWrite();
    return "written";
}
