/**
 * Pure prompt builder for `challenge-idea` (#184). Asks the provider to argue AGAINST the note's
 * thesis and surface its weakest points, hidden assumptions and the strongest counterarguments. The
 * raw completion is kept verbatim (no parse). Obsidian-free and deterministic.
 */
export function buildChallengePrompt(content: string): string {
    return (
        "You are a rigorous critic. Argue against the main thesis of the note below: surface its " +
        "weakest points, the hidden assumptions it rests on, and the strongest counterarguments. " +
        "Be specific and constructive. Respond in prose.\n\n" +
        content.trim()
    );
}
