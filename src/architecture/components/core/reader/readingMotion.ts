/**
 * **How a book opens and how a chapter turns** (#732, epic #729) — the two choices of the settings'
 * *Reading* section. Pure: the settings are read through here, so a value from an old or hand-edited
 * `data.json` is mended to the default instead of reaching the motion code.
 */

/** Opening a book from the Library: the camera shot (§XVI), or at once. */
export const OPEN_MOTIONS = ["shot", "instant"] as const;
export type OpenMotion = (typeof OPEN_MOTIONS)[number];

/** Changing chapter: a leaf turns on the spine, the text keeps flowing, or a sheet slides off the stack. */
export const CHAPTER_MOTIONS = ["leaf", "flow", "stack"] as const;
export type ChapterMotion = (typeof CHAPTER_MOTIONS)[number];

export interface ReadingMotion {
    open: OpenMotion;
    chapter: ChapterMotion;
}

export const DEFAULT_READING_MOTION: ReadingMotion = { open: "shot", chapter: "leaf" };

/** The saved choice, with anything unknown mended to the default. */
export function readingMotion(value: unknown): ReadingMotion {
    const raw = (value ?? {}) as { open?: unknown; chapter?: unknown };
    const open = (OPEN_MOTIONS as readonly unknown[]).includes(raw.open) ? (raw.open as OpenMotion) : DEFAULT_READING_MOTION.open;
    const chapter = (CHAPTER_MOTIONS as readonly unknown[]).includes(raw.chapter) ? (raw.chapter as ChapterMotion) : DEFAULT_READING_MOTION.chapter;
    return { open, chapter };
}
