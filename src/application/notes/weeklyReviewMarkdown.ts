import type { WeeklyReview, ReviewSectionKey, ReviewAction } from "architecture/knowledge/review/weeklyReview";

/** Localized, presentation-only labels the caller (the command) builds via `t()` and passes in. */
export interface WeeklyReviewLabels {
    title: string;
    clean: string;
    sections: Record<ReviewSectionKey, string>;
    actions: Record<ReviewAction, string>;
}

/**
 * Pure markdown renderer for the weekly review (#160, AC-2). Emits a title (`# <title> — <date>`),
 * one `##` section per NON-empty section (label + count) with each note as an extensionless
 * `[[wikilink]]` and a `Next: …` action line; an all-empty review renders the clean-week line.
 * No i18n import (labels are injected), no Obsidian import — pure and deterministic.
 */
export function renderWeeklyReviewMarkdown(
    review: WeeklyReview,
    labels: WeeklyReviewLabels,
    dateLabel: string
): string {
    const lines: string[] = [`# ${labels.title} — ${dateLabel}`, ""];

    const nonEmpty = review.sections.filter((section) => section.count > 0);
    if (nonEmpty.length === 0) {
        lines.push(labels.clean);
        return lines.join("\n") + "\n";
    }

    for (const section of nonEmpty) {
        lines.push(`## ${labels.sections[section.key]} (${section.count})`, "");
        for (const path of section.paths) lines.push(`- [[${path.replace(/\.md$/i, "")}]]`);
        lines.push("", `_${labels.actions[section.action]}_`, "");
    }
    return lines.join("\n").trimEnd() + "\n";
}
