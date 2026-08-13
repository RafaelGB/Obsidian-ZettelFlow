export type ZettelIdStrategy = "timestamp" | "folgezettel";
export type FolgezettelRelationship = "child" | "sibling";

/**
 * Formats a Date into a string using a moment.js-style format token.
 * Supported tokens: YYYY, MM, DD, HH, mm, ss.
 * @param format - format string (default "YYYYMMDDHHmm")
 * @param now    - injectable Date for deterministic tests (default: new Date())
 */
export function formatTimestamp(format: string = "YYYYMMDDHHmm", now: Date = new Date()): string {
    const pad = (n: number, digits = 2) => String(n).padStart(digits, "0");
    return format
        .replace("YYYY", pad(now.getFullYear(), 4))
        .replace("MM",   pad(now.getMonth() + 1))
        .replace("DD",   pad(now.getDate()))
        .replace("HH",   pad(now.getHours()))
        .replace("mm",   pad(now.getMinutes()))
        .replace("ss",   pad(now.getSeconds()));
}

/**
 * Returns true when every character in seg is a lowercase ASCII letter.
 */
export function isAlphaSegment(seg: string): boolean {
    return seg.length > 0 && /^[a-z]+$/.test(seg);
}

/**
 * Increments an alphabetic segment with pure carry-over semantics.
 *   "a"  → "b"
 *   "z"  → "aa"
 *   "az" → "ba"
 *   "zz" → "aaa"
 */
export function incrementAlphaSegment(seg: string): string {
    const chars = seg.split("");
    let carry = true;
    for (let i = chars.length - 1; i >= 0 && carry; i--) {
        if (chars[i] === "z") {
            chars[i] = "a";
        } else {
            chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1);
            carry = false;
        }
    }
    if (carry) {
        chars.unshift("a");
    }
    return chars.join("");
}

/**
 * Increments a numeric segment as a simple integer.
 *   "1"  → "2"
 *   "21" → "22"
 */
export function incrementNumericSegment(seg: string): string {
    return String(parseInt(seg, 10) + 1);
}

/**
 * Splits a Folgezettel ID into its alternating numeric/alpha segments.
 *   "21a1b" → ["21", "a", "1", "b"]
 */
export function parseSegments(id: string): string[] {
    if (!id) return [];
    const segments: string[] = [];
    let remaining = id;
    // First segment is always numeric
    let expectAlpha = false;
    while (remaining.length > 0) {
        if (expectAlpha) {
            const match = remaining.match(/^([a-z]+)/);
            if (!match) break;
            segments.push(match[1]);
            remaining = remaining.slice(match[1].length);
        } else {
            const match = remaining.match(/^([0-9]+)/);
            if (!match) break;
            segments.push(match[1]);
            remaining = remaining.slice(match[1].length);
        }
        expectAlpha = !expectAlpha;
    }
    return segments;
}

/**
 * Returns the next child ID for a given parent.
 * A child appends the next alternate segment type:
 *   numeric parent "21"  → "21a"
 *   alpha parent   "21a" → "21a1"
 * Advances the new segment until there is no collision with existingIds.
 */
export function nextChildId(parentId: string, existingIds: Set<string>): string {
    const segs = parseSegments(parentId);
    const lastSeg = segs[segs.length - 1];
    const appendAlpha = !isAlphaSegment(lastSeg);

    let newSeg = appendAlpha ? "a" : "1";
    let candidate = parentId + newSeg;
    while (existingIds.has(candidate)) {
        newSeg = appendAlpha
            ? incrementAlphaSegment(newSeg)
            : incrementNumericSegment(newSeg);
        candidate = parentId + newSeg;
    }
    return candidate;
}

/**
 * Returns the next sibling ID for a given parent.
 * A sibling increments the last segment:
 *   "21"  → "22"
 *   "21a" → "21b"
 * Advances until there is no collision with existingIds.
 */
export function nextSiblingId(parentId: string, existingIds: Set<string>): string {
    const segs = parseSegments(parentId);
    const lastSeg = segs[segs.length - 1];
    const prefix = parentId.slice(0, parentId.length - lastSeg.length);

    const increment = isAlphaSegment(lastSeg)
        ? incrementAlphaSegment
        : incrementNumericSegment;

    let newSeg = increment(lastSeg);
    let candidate = prefix + newSeg;
    while (existingIds.has(candidate)) {
        newSeg = increment(newSeg);
        candidate = prefix + newSeg;
    }
    return candidate;
}

/**
 * Returns the next free top-level numeric ID ("1", "2", "3", …).
 * Collision-free against existingIds.
 */
export function nextRootId(existingIds: Set<string>): string {
    let n = 1;
    while (existingIds.has(String(n))) {
        n++;
    }
    return String(n);
}
