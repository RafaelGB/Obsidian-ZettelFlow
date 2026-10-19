/**
 * **A comment that rides on its highlight** (#842 FR-3, FR-11) — pure, over bytes.
 *
 * pdf.js 5.3 writes a highlight's author (`user` → `/T`) but never its comment (`/Contents`). So each
 * highlight that has a note is saved with a placeholder author of an exact length, and once pdf.js has
 * written the file, that hole — `/T (zf3ZZZ…)` — is overwritten in place with `/T <FEFF…> /Contents
 * <FEFF…>` padded to the same length. Not one byte moves, so every offset in the file still holds.
 * Measured on Obsidian 1.14.4 (2026-10-18): pdf.js reads the comment and the author back, accents too.
 */

/** A string as a PDF hex string in UTF-16BE, its byte-order mark first: ASCII, whatever it says. */
export function utf16Hex(text: string): string {
    let hex = "<FEFF";
    for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).toUpperCase().padStart(4, "0");
    return `${hex}>`;
}

/** What a highlight's hole becomes: its author, if any, and its comment, if any. */
export function fillFor(comment: string, author: string): string {
    return [author ? `/T ${utf16Hex(author)}` : "", comment ? `/Contents ${utf16Hex(comment)}` : ""].filter(Boolean).join(" ");
}

/** A hole to fill: the placeholder pdf.js writes as the highlight's author, and what goes there. */
export interface Hole {
    user: string;
    fill: string;
}

/**
 * The placeholder for highlight `index` (`zf<index>` and `Z`s): as written by pdf.js, `/T (…)` is
 * exactly as long as its fill, or longer by spaces. `null` when there is nothing to carry.
 */
export function holeFor(index: number, comment: string, author: string): Hole | null {
    const fill = fillFor(comment, author);
    if (!fill) return null;
    const stem = `zf${index}`;
    const user = stem.padEnd(Math.max(stem.length + 1, fill.length - 5), "Z");
    return { user, fill: fill.padEnd(user.length + 5, " ") };
}

function ascii(text: string): Uint8Array {
    const out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
    return out;
}

/** Where `needle` is in `bytes`, from `from` on; -1 when it is not. */
export function indexOfBytes(bytes: Uint8Array, needle: Uint8Array, from = 0): number {
    const first = needle[0];
    const last = bytes.length - needle.length;
    for (let i = bytes.indexOf(first, from); i !== -1 && i <= last; i = bytes.indexOf(first, i + 1)) {
        let j = 1;
        while (j < needle.length && bytes[i + j] === needle[j]) j++;
        if (j === needle.length) return i;
    }
    return -1;
}

/**
 * Fill each hole in place, after the original's bytes (`from`): the file keeps its length and every
 * byte outside a hole. Returns the placeholders that were not found exactly once — a copy with one
 * of those is never saved (FR-11).
 */
export function fillHoles(bytes: Uint8Array, holes: readonly Hole[], from: number): string[] {
    const missing: string[] = [];
    for (const hole of holes) {
        const needle = ascii(`/T (${hole.user})`);
        const at = indexOfBytes(bytes, needle, from);
        if (at < 0 || indexOfBytes(bytes, needle, at + 1) >= 0) {
            missing.push(hole.user);
            continue;
        }
        bytes.set(ascii(hole.fill), at);
    }
    return missing;
}

/** Whether `bytes` starts with every byte of `original` (FR-8): the original, untouched, is in it. */
export function startsWith(bytes: Uint8Array, original: Uint8Array): boolean {
    if (bytes.length < original.length) return false;
    for (let i = 0; i < original.length; i++) if (bytes[i] !== original[i]) return false;
    return true;
}

/** One mark the copy was asked to carry, as it must read back. */
export interface PlannedMark {
    page: number;
    subtype: "Highlight" | "FreeText" | "Ink";
    contents: string;
    author: string;
}

/** An annotation as pdf.js reads it back from the copy. */
export interface ReadMark {
    subtype?: string;
    contents: string;
    title: string;
}

/** Which check a copy failed (FR-11), by name; the run writes nothing then. */
export type CopyCheck = "prefix" | "holes" | "count" | "contents" | "author";

/**
 * Whether the copy reads back as written (FR-11): the original first, every hole filled, on each page
 * the annotations it had and the new ones, each with its comment and its author.
 */
export function checkCopy(input: {
    saved: Uint8Array;
    original: Uint8Array;
    missing: readonly string[];
    planned: readonly PlannedMark[];
    before: ReadonlyMap<number, number>;
    after: ReadonlyMap<number, readonly ReadMark[]>;
}): CopyCheck | null {
    if (!startsWith(input.saved, input.original)) return "prefix";
    if (input.missing.length > 0) return "holes";
    const pages = [...new Set(input.planned.map((mark) => mark.page))];
    for (const page of pages) {
        const read = input.after.get(page) ?? [];
        const planned = input.planned.filter((mark) => mark.page === page);
        if (read.length !== (input.before.get(page) ?? 0) + planned.length) return "count";
        const left = [...read];
        for (const mark of planned) {
            const same = left.findIndex((got) => got.subtype === mark.subtype && got.contents === mark.contents);
            if (same < 0) return "contents";
            if (left[same].title !== mark.author) return "author";
            left.splice(same, 1);
        }
    }
    return null;
}

/** The copy's path (FR-9): beside the original, `<name> (annotated).pdf`, then `… 2`, never over one. */
export function freeCopyPath(folder: string, stem: string, suffix: string, exists: (path: string) => boolean): string {
    const dir = folder.replace(/\/+$/, "");
    const join = (name: string) => (dir ? `${dir}/${name}` : name);
    let candidate = join(`${stem} (${suffix}).pdf`);
    for (let n = 2; exists(candidate) && n < 1000; n++) candidate = join(`${stem} (${suffix}) ${n}.pdf`);
    return candidate;
}
