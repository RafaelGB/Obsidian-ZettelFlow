/**
 * **Handwriting read as a proposal** (#748, epic #740) — the pure half: what is asked, what comes
 * back, and the one move a reading may lead to.
 *
 * A web view has no handwriting recognition, so the only reading there is is one you ask for, from
 * the AI provider you configured, with **one** ink note's strokes and the passage it sits beside —
 * nothing else from the vault. By construction: {@link buildInkReadingRequest} takes a passage and a
 * limit and has no field for a title, a path or another highlight.
 *
 * What comes back is a proposal, never a write: a reading (sanitised and capped), what kind of note
 * it is, and the idea it names. A named idea is matched **locally**, without AI, against the titles
 * of your notes in scope — and only a unique, long-enough match proposes a move.
 */

import { capText } from "architecture/ai/aiGate";
import { delimitContent, sanitizeAiText } from "architecture/ai/promptSafety";
import { pointsBox, segmentsOf, TILT_CAP, INK_WIDTH_EM, type Segment } from "./inkStroke";
import type { InkDrawing } from "./inkSvg";

/** The longest reading kept: a margin note, not an essay (FR-5). */
export const INK_READING_MAX = 280;
/** The longest named idea kept. */
const NAME_MAX = 120;
/** The passage sent beside the ink, at most: its sentence or so — the AI input cap also applies. */
export const INK_PASSAGE_MAX = 600;

/** What kind of note a reading is: a tension with something it names, a question, or neither. */
export type InkReadingKind = "tension" | "question" | "plain";

/** A reading, as proposed: the text, its kind, and the idea it names (for a tension). */
export interface InkReading {
    reading: string;
    kind: InkReadingKind;
    names?: string;
}

/** The task, in the user message — the passage after it, delimited as data (#301 S3). */
export const INK_READING_TASK =
    "The image is a reader's handwritten note, written in the margin of a book beside the passage " +
    "below. Read the handwriting exactly as written. Reply with JSON only, no prose: " +
    '{"reading": "<the handwriting as text>", "kind": "tension" | "question" | "plain", ' +
    '"names": "<the idea or note it argues with, only when kind is tension>"}. ' +
    'The kind is "tension" when the note says the passage contradicts or argues with a named idea, ' +
    '"question" when the note asks a question, and "plain" otherwise. The passage is context only.';

/**
 * The request for one ink note (FR-3, AC-2): the task, then the passage — capped at the AI input
 * limit and delimited as untrusted content. The image goes beside it; nothing else does.
 */
export function buildInkReadingRequest(input: { passage: string; maxChars: number }): { prompt: string } {
    const passage = capText(input.passage.trim(), input.maxChars);
    return { prompt: `${INK_READING_TASK}\n\n${delimitContent(passage)}` };
}

/**
 * The answer, read (FR-5, AC-3): JSON when the model kept to it (inside a code fence or not), the raw
 * text as a plain reading when it did not, and `null` when there is nothing to propose.
 */
export function parseInkReading(raw: string): InkReading | null {
    const text = raw.trim();
    if (!text) return null;
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (json) {
        try {
            const value = JSON.parse(json) as Record<string, unknown>;
            const reading = typeof value.reading === "string" ? sanitizeAiText(value.reading, INK_READING_MAX) : "";
            if (!reading) return null;
            const kind: InkReadingKind = value.kind === "tension" || value.kind === "question" ? value.kind : "plain";
            const names = typeof value.names === "string" ? sanitizeAiText(value.names, NAME_MAX) : "";
            return { reading, kind, ...(kind === "tension" && names ? { names } : {}) };
        } catch {
            // Not JSON after all: what it said is the reading.
        }
    }
    const reading = sanitizeAiText(text.replace(/^```\w*|```$/g, ""), INK_READING_MAX);
    return reading ? { reading, kind: "plain" } : null;
}

/** A title or a name, as compared: no case, no accents, no punctuation, single spaces. */
export function normaliseTitle(text: string): string {
    return text
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
}

/** A name long enough to stand for one note: two words, or six letters. */
function longEnough(name: string): boolean {
    return name.split(" ").length >= 2 || name.replace(/ /g, "").length >= 6;
}

/**
 * The note a reading names (FR-8, G6) — local, no AI: a title that **equals** the name or **starts
 * with** it, once both are normalised, when the name is long enough. Exactly one, or `null`: an
 * ambiguous name proposes nothing.
 */
export function matchNamedNote(names: string | undefined, titles: readonly { path: string; title: string }[]): string | null {
    const name = normaliseTitle(names ?? "");
    if (!name || !longEnough(name)) return null;
    const found = new Set<string>();
    for (const { path, title } of titles) {
        const have = normaliseTitle(title);
        if (have === name || have.startsWith(`${name} `)) found.add(path);
    }
    return found.size === 1 ? [...found][0] : null;
}

/** The move a confirmed reading proposes (FR-8, AC-5): a tension with a note you have, a question, or none. */
export type InkMove = { kind: "tension"; path: string } | { kind: "question" };

export function proposedMove(reading: InkReading, match: string | null): InkMove | null {
    if (reading.kind === "tension" && match) return { kind: "tension", path: match };
    if (reading.kind === "question") return { kind: "question" };
    return null;
}

/**
 * The passage an ink note sits beside (FR-3): the sentence around its anchor, within
 * {@link INK_PASSAGE_MAX} — never the chapter.
 */
export function passageAround(text: string, span: { start: number; end: number }, max = INK_PASSAGE_MAX): string {
    const half = Math.floor(max / 2);
    let from = Math.max(0, span.start - half);
    let to = Math.min(text.length, span.end + half);
    const before = text.slice(from, span.start);
    const stop = Math.max(before.lastIndexOf(". "), before.lastIndexOf("\n"), before.lastIndexOf("? "), before.lastIndexOf("! "));
    if (stop >= 0) from += stop + 2;
    const after = text.slice(span.end, to);
    const end = after.search(/[.?!](\s|$)|\n/);
    if (end >= 0) to = span.end + end + 1;
    return text.slice(from, to).replace(/\s+/g, " ").trim();
}

/** The image the strokes are drawn into (FR-3): bounded on its long side, never blown up. */
export const INK_IMAGE_MAX_PX = 1024;
/** A margin around the strokes, in ems. */
export const INK_IMAGE_PAD_EM = 0.5;
/** At most this many pixels an em: a small note is drawn at a hand's size, not a poster's. */
export const INK_IMAGE_MAX_PX_PER_EM = 64;

/** Where the strokes go in the image: its size, and the scale and offset from ems to pixels. */
export interface InkImageLayout {
    width: number;
    height: number;
    /** Pixels an em. */
    scale: number;
    /** The drawing's top-left, in ems. */
    left: number;
    top: number;
    segments: Segment[][];
}

/** The strokes of one drawing laid out in an image (pure): every segment, nothing else. */
export function inkImageLayout(drawing: InkDrawing): InkImageLayout {
    const box = pointsBox(
        drawing.strokes.flatMap((stroke) => stroke.points),
        INK_WIDTH_EM * TILT_CAP + INK_IMAGE_PAD_EM
    );
    const w = Math.max(0.01, box.right - box.left);
    const h = Math.max(0.01, box.bottom - box.top);
    const scale = Math.min(INK_IMAGE_MAX_PX / Math.max(w, h), INK_IMAGE_MAX_PX_PER_EM);
    return {
        width: Math.max(1, Math.round(w * scale)),
        height: Math.max(1, Math.round(h * scale)),
        scale,
        left: box.left,
        top: box.top,
        segments: drawing.strokes.map((stroke) => segmentsOf(stroke.points, stroke.pointerType)),
    };
}
