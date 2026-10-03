import { OBSIDIAN_LOCALE, t, tCount } from "architecture/lang";
import { relativeAge } from "architecture/knowledge/state";

/**
 * How the story writes a date (#642 FR-2/FR-4). The month heading and the absolute day come from
 * the platform's own calendar in the reader's language; the relative label from the locale, with a
 * singular and a plural so *1 day ago* never reads *1 days ago*.
 */

/** *October 2026* / *octubre de 2026*. */
/**
 * The language Obsidian is in. Intl's own default is the operating system's, which in Electron
 * need not be Obsidian's: a Spanish vault on an English OS read "October 2026" among Spanish rows.
 */
function readerLocale(): string {
    return OBSIDIAN_LOCALE || "en";
}

export function monthHeading(year: number, month0: number, locale: string = readerLocale()): string {
    return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(year, month0, 1));
}

/** The full day, for the hover and for assistive technology — and for the one pinned date. */
export function absoluteDay(at: number, locale: string = readerLocale()): string {
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(new Date(at));
}

/** *today*, *yesterday*, *3 days ago*, *2 months ago*, *1 year ago*. */
export function relativeLabel(at: number, now: number): string {
    const age = relativeAge(at, now);
    switch (age.unit) {
        case "today":
            return t("note_story_today");
        case "yesterday":
            return t("note_story_yesterday");
        case "days":
            return tCount(age.n, "note_story_days_ago", String(age.n));
        case "months":
            return tCount(age.n, "note_story_months_ago", String(age.n));
        case "years":
            return tCount(age.n, "note_story_years_ago", String(age.n));
    }
}
