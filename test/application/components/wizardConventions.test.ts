import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync } from "fs";
import { join, relative } from "path";

// test/application/components → 3 ups → repo root
const ROOT = join(__dirname, "..", "..", "..");
const SCANNED = [
    join(ROOT, "src", "application", "components"),
    join(ROOT, "src", "zettelkasten"),
];

/**
 * Convention guardrail for the creation experience (#406, epic #405).
 *
 * Two project rules are absolute in CLAUDE.md — *never inline styles* and *all user-facing text lives
 * in the i18n layer* — and the blocking lints miss both in React:
 *
 * - `eslint-plugin-obsidianmd`'s `no-static-styles-assignment` matches `el.style.x = …`, so a JSX
 *   `style={{ … }}` prop walks straight past a lint the project otherwise keeps at zero.
 * - The locale-parity test can only compare `en.ts` against `es.ts`; a string that never entered the
 *   i18n layer is invisible to it.
 *
 * So the wizard (and the step-builder UI it shares components with) is scanned directly. Two carve-outs,
 * both deliberate: a `style` prop taking a **variable** (`style={style}` — dnd-kit's transform) is not a
 * static style, and an object literal whose keys are **CSS custom properties** (`--accent`) is the
 * sanctioned way to hand a dynamic value to a stylesheet.
 */
function tsxFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...tsxFiles(full));
        else if (entry.name.endsWith(".tsx")) out.push(full);
    }
    return out;
}

const files = SCANNED.flatMap(tsxFiles);

/** `style={{ … }}` object literals, with their inner text. */
function inlineStyleObjects(source: string): string[] {
    return [...source.matchAll(/style=\{\{([\s\S]*?)\}\}/g)].map((match) => match[1]);
}

/** Property keys declared in an object-literal body (quoted or bare). */
function declaredKeys(body: string): string[] {
    return [...body.matchAll(/(?:^|[,{])\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\s*:/g)].map(
        (match) => match[1] ?? match[2] ?? match[3]
    );
}

/** JSX props whose value is a bare literal instead of a `t(...)` call. */
function literalTextProps(source: string): string[] {
    const pattern = /\b(title|placeholder|aria-label|alt)=(?:\{\s*)?(["'`])([\s\S]*?)\2/g;
    return [...source.matchAll(pattern)]
        .filter((match) => match[3].trim().length > 0)
        .map((match) => `${match[1]}=${match[2]}${match[3]}${match[2]}`);
}

describe("the creation-experience components keep the project conventions (#406)", () => {
    it("scans the wizard and step-builder component trees", () => {
        expect(files.length).toBeGreaterThan(10);
    });

    it("declares no visual CSS through a JSX style prop", () => {
        const offenders: string[] = [];
        for (const file of files) {
            for (const body of inlineStyleObjects(readFileSync(file, "utf8"))) {
                const visual = declaredKeys(body).filter((key) => !key.startsWith("--"));
                if (visual.length > 0) {
                    offenders.push(`${relative(ROOT, file)} → ${visual.join(", ")}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    it("routes every user-facing prop string through the i18n layer", () => {
        const offenders: string[] = [];
        for (const file of files) {
            for (const literal of literalTextProps(readFileSync(file, "utf8"))) {
                offenders.push(`${relative(ROOT, file)} → ${literal}`);
            }
        }
        expect(offenders).toEqual([]);
    });
});
