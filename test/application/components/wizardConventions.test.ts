import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync } from "fs";
import { join, relative } from "path";

// test/application/components → 3 ups → repo root
const ROOT = join(__dirname, "..", "..", "..");

/** The wizard and the step-builder trees — cleaned by #406/#407. */
const WIZARD_TREES = [
    join(ROOT, "src", "application", "components"),
    join(ROOT, "src", "zettelkasten"),
];

/** The shared React widgets a step renders (where the #418 crash actually lived). */
const SHARED_TREES = [join(ROOT, "src", "architecture", "components")];

/**
 * Convention guardrails for the creation experience (#406/#407/#418, epic #405).
 *
 * Four project rules are absolute and none of them is visible to the blocking lints in React:
 *
 * - *Never inline styles*: `eslint-plugin-obsidianmd`'s `no-static-styles-assignment` matches
 *   `el.style.x = …`, so a JSX `style={{ … }}` prop walks past a lint kept at zero.
 * - *All user-facing text in the i18n layer*: the locale-parity test can only compare `en.ts` with
 *   `es.ts`; a literal that never entered the layer is invisible to it.
 * - *Every control has an accessible name*: an icon-only button announces nothing.
 * - *No positive tabindex*: it hijacks the tab order of the whole modal.
 *
 * Plus the one that crashed a real user (#418): an element built through a **Node-appending** helper.
 *
 * Two carve-outs are deliberate: a `style` prop taking a **variable** (dnd-kit's transform) is not a
 * static style, and an object literal whose keys are **CSS custom properties** is the sanctioned way to
 * hand a dynamic value to a stylesheet.
 *
 * Scope is per-rule on purpose. The two rules that need real component work in the shared widgets
 * (`Search.tsx`'s portal positioning and its roving tabindex) are tracked separately rather than
 * asserted and suppressed here — a guardrail with exemptions stops being one.
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

const wizardFiles = WIZARD_TREES.flatMap(tsxFiles);
const sharedFiles = SHARED_TREES.flatMap(tsxFiles);
const allFiles = [...wizardFiles, ...sharedFiles];

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

function visualStyleProps(source: string): string[] {
    return inlineStyleObjects(source).flatMap((body) => {
        const visual = declaredKeys(body).filter((key) => !key.startsWith("--"));
        return visual.length > 0 ? [visual.join(", ")] : [];
    });
}

/** JSX props whose value is a bare literal instead of a `t(...)` call. */
function literalTextProps(source: string): string[] {
    const pattern = /\b(title|placeholder|aria-label|alt)=(?:\{\s*)?(["'`])([\s\S]*?)\2/g;
    return [...source.matchAll(pattern)]
        .filter((match) => match[3].trim().length > 0)
        .map((match) => `${match[1]}=${match[2]}${match[3]}${match[2]}`);
}

/** Default parameter values that are user-facing text — invisible to the locale-parity test too. */
function literalTextDefaults(source: string): string[] {
    return [...source.matchAll(/\b(placeholder|label|title)\s*=\s*"([^"]{2,})"/g)].map(
        (match) => `${match[1]} = "${match[2]}"`
    );
}

/** Buttons whose only child is an icon and that carry no `aria-label`. */
function iconOnlyControls(source: string): string[] {
    const offenders: string[] = [];
    for (const match of source.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
        const attributes = match[1];
        const children = match[2];
        const hasIcon = /<Icon\b/.test(children);
        // Any rendered text (a literal, a {t(…)} call, a {variable}) already names the control.
        const text = children.replace(/<[^>]+>/g, "").trim();
        if (hasIcon && text.length === 0 && !/aria-label=/.test(attributes)) {
            offenders.push(match[0].slice(0, 80).replace(/\s+/g, " "));
        }
    }
    return offenders;
}

/**
 * Element creation through a **Node-appending** helper. Obsidian implements `createEl`/`createDiv`/
 * `createSpan` on `Node`: they create the element *and append it to the receiver*. On `document` — or
 * bare, which resolves there — that appends a second root element and throws "Only one element on
 * document allowed", mid-render, taking the React tree with it (#418; #327 was the same class).
 * A detached placeholder is `document.createElement`, which cannot append anywhere.
 */
function documentElementCreation(source: string): string[] {
    const bare = /(?:^|[^.\w])(create(?:El|Div|Span))\s*\(/g;
    const onDocument = /\b(?:active)?[dD]ocument\.(create(?:El|Div|Span))\s*\(/g;
    return [
        ...[...source.matchAll(bare)].map((match) => `${match[1]}()`),
        ...[...source.matchAll(onDocument)].map((match) => `document.${match[1]}()`),
    ];
}

/** `tabIndex={n}` values other than 0 / -1. */
function positiveTabIndexes(source: string): string[] {
    return [...source.matchAll(/tabIndex=\{([^}]+)\}/g)]
        .map((match) => match[1].trim())
        .filter((value) => value !== "0" && value !== "-1");
}

/** Comments are prose about the code, not code — a rule quoted in a doc block is not a violation. */
function withoutComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function scan(files: string[], collect: (source: string) => string[]): string[] {
    const offenders: string[] = [];
    for (const file of files) {
        for (const hit of collect(withoutComments(readFileSync(file, "utf8")))) {
            offenders.push(`${relative(ROOT, file)} → ${hit}`);
        }
    }
    return offenders;
}

describe("the creation-experience components keep the project conventions (#406, #407)", () => {
    it("scans the wizard, step-builder and shared-widget trees", () => {
        expect(wizardFiles.length).toBeGreaterThan(10);
        expect(sharedFiles.length).toBeGreaterThan(5);
    });

    it("declares no visual CSS through a JSX style prop", () => {
        expect(scan(wizardFiles, visualStyleProps)).toEqual([]);
    });

    it("routes every user-facing prop string through the i18n layer", () => {
        expect(scan(allFiles, literalTextProps)).toEqual([]);
    });

    it("routes user-facing default values through the i18n layer too", () => {
        expect(scan(allFiles, literalTextDefaults)).toEqual([]);
    });

    it("names every icon-only control for assistive technology", () => {
        expect(scan(allFiles, iconOnlyControls)).toEqual([]);
    });

    it("keeps the tab order intact: no positive tabIndex", () => {
        expect(scan(wizardFiles, positiveTabIndexes)).toEqual([]);
    });

    it("never builds an element through a helper that appends to the document (#418)", () => {
        expect(scan(allFiles, documentElementCreation)).toEqual([]);
    });
});
