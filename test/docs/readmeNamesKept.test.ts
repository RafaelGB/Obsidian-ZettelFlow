import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { FROZEN_README_NAMES } from "./readmeNames";

// test/docs → 2 ups → repo root
const ROOT = join(__dirname, "..", "..");

function markdownUnder(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) markdownUnder(full, out);
        else if (entry.endsWith(".md")) out.push(full);
    }
    return out;
}

/** README + every docs page, read once, CRLF-normalised, into one haystack. */
function haystack(): string {
    const files = [join(ROOT, "README.md"), ...markdownUnder(join(ROOT, "docs"))];
    return files
        .map((file) => readFileSync(file, "utf8"))
        .join("\n")
        .replace(/\r\n/g, "\n");
}

/**
 * Nothing the README named is lost (#588, FR-4 / AC-4).
 *
 * The rewrite re-ranks the inventory; it never deletes it. Every name the README carried at
 * `2f6198f5` must still occur in `README.md` or under `docs/**` afterward. This is green today
 * (every name is in the README), goes on being green as names route to their owning docs pages (T7),
 * and would go red the instant the rewrite (T9) dropped one before it had a home — which is the whole
 * point of routing before cutting.
 */
describe("nothing the README named is lost (#588, AC-4)", () => {
    it("freezes exactly the 84 names measured at 2f6198f5", () => {
        // The anti-vacuity assertion, and the reason this is a committed guardrail rather than a
        // one-off script: a frozen length cannot pass empty, and a shell `wc -l` eyeballed once did
        // exactly that when its grep dropped the astral-plane emoji bullets.
        expect(FROZEN_README_NAMES.length).toBe(84);
    });

    it("keeps every frozen name findable in README.md or under docs/**", () => {
        const hay = haystack();
        const lost = FROZEN_README_NAMES.filter((name) => !hay.includes(name)).map((name) => `LOST: ${name}`);
        expect(lost).toEqual([]);
    });
});
