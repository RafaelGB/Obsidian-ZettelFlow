/**
 * Where the note being built will land (#408, epic #405).
 *
 * The destination used to be discoverable only *after* the note existed: the target folder is decided
 * by steps (`setTargetFolder` / `lockTargetFolder`) and the unique prefix by settings, and neither was
 * ever shown. Showing it means deriving it, and deriving it twice would let the display drift from the
 * truth — so the builder composes its filename and its final path **through these functions**, and the
 * wizard displays the result of the same call.
 *
 * Pure: no Obsidian, no file system. The separator and extension are vault-universal.
 */

export const PATH_SEPARATOR = "/";
export const MARKDOWN_EXTENSION = ".md";

/** The prefix separator the builder has always used between a unique prefix and the title. */
export const PREFIX_SEPARATOR = " - ";

/**
 * The file name: `<rendered prefix> - <title>` when a unique prefix is configured, else the title.
 * The prefix arrives already rendered (the pattern is formatted with moment by the caller), so this
 * stays pure and testable.
 */
export function composeFilename(title: string, renderedPrefix?: string): string {
    const prefix = renderedPrefix?.trim();
    return prefix ? `${prefix}${PREFIX_SEPARATOR}${title}` : title;
}

/** The full vault path the note will be written to. */
export function composeDestination(folder: string, filename: string): string {
    return `${folder}${PATH_SEPARATOR}${filename}${MARKDOWN_EXTENSION}`;
}

export interface DestinationView {
    /** The folder part, empty when no step has set one yet. */
    folder: string;
    /** The file name including the unique prefix, without the extension. */
    filename: string;
    /** The full path, or `undefined` while there is not enough to say. */
    path?: string;
    /** The folder was pinned at open time or by a step; later steps cannot move it. */
    locked: boolean;
}

/**
 * What the wizard should show. A missing title (the common case at the first step) yields no path —
 * an honest "not decided yet" rather than a path ending in `/.md`.
 */
export function describeDestination(input: {
    folder: string;
    title: string;
    renderedPrefix?: string;
    locked?: boolean;
}): DestinationView {
    const filename = composeFilename(input.title.trim(), input.renderedPrefix);
    const view: DestinationView = {
        folder: input.folder,
        filename,
        locked: input.locked ?? false,
    };
    if (filename.length > 0) {
        view.path = composeDestination(input.folder, filename);
    }
    return view;
}
