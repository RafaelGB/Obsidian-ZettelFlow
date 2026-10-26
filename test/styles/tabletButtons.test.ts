import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { compile } from "sass";

const ROOT = join(__dirname, "..", "..");
const SRC = join(ROOT, "src");
const PREFIX = "zettelkasten-flow__";

/**
 * **A button keeps its own box on a tablet** (#885).
 *
 * Obsidian's `app.css` (1.15.0) paints every button that is not a `clickable-icon`:
 *
 * - `button:not(.clickable-icon)` — (0,1,1): `background-color`, `box-shadow`;
 * - `.is-tablet button:not(.clickable-icon)` — (0,2,1): `padding: var(--size-4-1) var(--size-4-5)`.
 *
 * A plugin rule that sets a button's padding under (0,2,1), or its fill under (0,1,1), loses to them.
 * On desktop the loss is a few pixels; on an iPad Think's 26px icon buttons got 40px of padding and
 * their icons collapsed into a shaded blob. The house `button.zettelkasten-flow__x` convention clears
 * the first rule and not the second, which is why nobody saw it off the device.
 *
 * The stylesheet is compiled as the bundle compiles it, so nesting and `@media` are resolved, and the
 * buttons are the classes the code puts on a `<button>`.
 */
const TABLET_PADDING: Specificity = [0, 2, 1];
const BUTTON_FILL: Specificity = [0, 1, 1];

type Specificity = [number, number, number];

interface Rule {
    selectors: string[];
    props: Set<string>;
}

/** Every style rule of a stylesheet, at-rules opened up: what applies somewhere, flat. */
function rules(css: string): Rule[] {
    const out: Rule[] = [];
    const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const walk = (from: number, to: number) => {
        let i = from;
        while (i < to) {
            const open = text.indexOf("{", i);
            if (open === -1 || open >= to) return;
            let depth = 1;
            let close = open + 1;
            for (; close < to && depth > 0; close++) {
                if (text[close] === "{") depth++;
                else if (text[close] === "}") depth--;
            }
            const head = text.slice(i, open).trim();
            const inner = text.slice(open + 1, close - 1);
            if (head.startsWith("@")) walk(open + 1, close - 1);
            else if (!inner.includes("{")) {
                const props = new Set(
                    inner
                        .split(";")
                        .map((decl) => decl.split(":")[0].trim().toLowerCase())
                        .filter(Boolean)
                );
                out.push({ selectors: splitList(head), props });
            }
            i = close;
        }
    };
    walk(0, text.length);
    return out;
}

/** A selector list, split on its top-level commas only. */
function splitList(list: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < list.length; i++) {
        if (list[i] === "(") depth++;
        else if (list[i] === ")") depth--;
        else if (list[i] === "," && depth === 0) {
            parts.push(list.slice(start, i).trim());
            start = i + 1;
        }
    }
    parts.push(list.slice(start).trim());
    return parts.filter(Boolean);
}

/** (ids, classes + attributes + pseudo-classes, elements) — `:not`/`:is` count their argument, `:where` nothing. */
function specificity(selector: string): Specificity {
    let s = selector;
    const sum: Specificity = [0, 0, 0];
    s = s.replace(/:where\((?:[^()]|\([^()]*\))*\)/g, " ");
    s = s.replace(/:(?:not|is|has)\(((?:[^()]|\([^()]*\))*)\)/g, (_, arg: string) => {
        const best = splitList(arg)
            .map(specificity)
            .sort((a, b) => compare(b, a))[0] ?? [0, 0, 0];
        sum[0] += best[0];
        sum[1] += best[1];
        sum[2] += best[2];
        return " ";
    });
    s = s.replace(/::[\w-]+(\([^)]*\))?/g, () => {
        sum[2]++;
        return " ";
    });
    sum[0] += (s.match(/#[\w-]+/g) ?? []).length;
    sum[1] += (s.match(/\.[\w-]+|\[[^\]]*\]|:[\w-]+(\([^)]*\))?/g) ?? []).length;
    const bare = s.replace(/#[\w-]+|\.[\w-]+|\[[^\]]*\]|:[\w-]+(\([^)]*\))?/g, " ");
    sum[2] += (bare.match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) ?? []).length;
    return sum;
}

function compare(a: Specificity, b: Specificity): number {
    return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** The last compound of a selector: the element the rule styles. */
function subject(selector: string): string {
    const parts = selector.split(/\s*[\s>+~]\s*(?![^(]*\))/);
    return parts[parts.length - 1] ?? "";
}

function sources(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) sources(full, out);
        else if (/\.tsx?$/.test(entry)) out.push(full);
    }
    return out;
}

/** The classes the code puts on a `<button>`, and whether that button is a `clickable-icon`. */
function buttonClasses(): Map<string, boolean> {
    const found = new Map<string, boolean>();
    for (const file of sources(SRC)) {
        const code = readFileSync(file, "utf8");
        for (const match of code.matchAll(/createEl\(\s*"button"\s*,\s*\{\s*cls:\s*([^\n]*)/g)) {
            const cls = match[1];
            const icon = cls.includes('"clickable-icon"') || cls.includes("'clickable-icon'");
            for (const name of cls.matchAll(/c\(\s*["'`]([\w-]+)["'`]\s*\)/g)) {
                found.set(name[1], (found.get(name[1]) ?? true) && icon);
            }
        }
    }
    return found;
}

/** The base state only: a `:hover` or `:focus` rule does not decide the box at rest. */
const STATE = /:(hover|focus|focus-visible|focus-within|active|disabled)\b|::/;

/** Buttons whose own padding or fill Obsidian's button rules override. */
function losers(css: string, buttons: Map<string, boolean>): string[] {
    const best = new Map<string, { padding?: Specificity; fill?: Specificity }>();
    for (const rule of rules(css)) {
        const padding = [...rule.props].some((p) => p.startsWith("padding"));
        const fill = rule.props.has("background") || rule.props.has("background-color") || rule.props.has("box-shadow");
        if (!padding && !fill) continue;
        for (const selector of rule.selectors) {
            const last = subject(selector);
            if (STATE.test(last)) continue;
            // A class inside `:not()` is what the element is not: `.x:not(.hidden)` styles `.x` (#888).
            const own = last.replace(/:not\((?:[^()]|\([^()]*\))*\)/g, "");
            for (const match of own.matchAll(new RegExp(`\\.${PREFIX}([\\w-]+)`, "g"))) {
                const name = match[1];
                if (buttons.get(name) !== false) continue;
                const spec = specificity(selector);
                const entry = best.get(name) ?? {};
                if (padding && (!entry.padding || compare(spec, entry.padding) > 0)) entry.padding = spec;
                if (fill && (!entry.fill || compare(spec, entry.fill) > 0)) entry.fill = spec;
                best.set(name, entry);
            }
        }
    }
    const out: string[] = [];
    for (const [name, entry] of best) {
        if (entry.padding && compare(entry.padding, TABLET_PADDING) < 0) out.push(`${name}: padding at (${entry.padding.join(",")}) < (0,2,1)`);
        if (entry.fill && compare(entry.fill, BUTTON_FILL) < 0) out.push(`${name}: fill at (${entry.fill.join(",")}) < (0,1,1)`);
    }
    return out.sort();
}

describe("a button keeps its own box on a tablet (#885)", () => {
    const css = compile(join(SRC, "styles", "main.scss")).css;
    const buttons = buttonClasses();

    it("measures specificity as the cascade does", () => {
        expect(specificity("button:not(.clickable-icon)")).toEqual([0, 1, 1]);
        expect(specificity(".is-tablet button:not(.clickable-icon)")).toEqual([0, 2, 1]);
        expect(specificity("button.zettelkasten-flow__x")).toEqual([0, 1, 1]);
        expect(specificity(".a :where(.b) button.c")).toEqual([0, 2, 1]);
    });

    it("finds the buttons the code builds", () => {
        expect(buttons.get("lab-icon")).toBe(true);
        expect(buttons.get("lab-action")).toBe(false);
    });

    it("keeps every button in Think out from under Obsidian's tablet padding and button fill", () => {
        expect(losers(css, buttons).filter((line) => line.startsWith("lab-"))).toEqual([]);
    });

    it("keeps every button in the Reader out from under them too, the place an iPad is read on (#888)", () => {
        const reader = [...byPartial(losers(css, buttons))].filter(([file]) => /^(reader|ink)/.test(file));
        expect(reader.flatMap(([file, found]) => found.map((line) => `${file}: ${line}`))).toEqual([]);
    });

    it("keeps every button in the Library out from under them, the shelves the Reader opens from (#888)", () => {
        const library = [...byPartial(losers(css, buttons))].filter(([file]) => /^(shelf|library)/.test(file));
        expect(library.flatMap(([file, found]) => found.map((line) => `${file}: ${line}`))).toEqual([]);
    });

    it("holds every other partial at or under its ceiling", () => {
        const over: string[] = [];
        for (const [file, found] of byPartial(losers(css, buttons))) {
            const ceiling = CEILING[file] ?? 0;
            if (found.length > ceiling) over.push(`${file}: ${found.length}, ceiling ${ceiling} — ${found.join("; ")}`);
        }
        // A button is `button.zettelkasten-flow__x:not(.clickable-icon)`, or a `clickable-icon` (#885).
        expect(over).toEqual([]);
    });

    it("keeps the ceilings honest, so the ratchet cannot become a licence", () => {
        const counts = byPartial(losers(css, buttons));
        const slack = Object.entries(CEILING)
            .filter(([file, ceiling]) => (counts.get(file)?.length ?? 0) < ceiling)
            .map(([file, ceiling]) => `${file}: ${counts.get(file)?.length ?? 0} < ${ceiling} — lower the ceiling`);
        expect(slack).toEqual([]);
    });
});

/**
 * What each partial held on 2026-10-26, outside Think. Lower these as buttons are fixed; never raise
 * one. Think's, the Reader's and the Library's partials are not here: they are held at zero above (#888).
 */
const CEILING: Record<string, number> = {
    "askGraph.scss": 3,
    "baseDashboard.scss": 4,
    "codeEditor.scss": 2,
    "communityLearn.scss": 10,
    "communitySystems.scss": 5,
    "communityView.scss": 1,
    "cultivate.scss": 9,
    "family.scss": 1,
    "historyView.scss": 2,
    "home.scss": 2,
    "noteCompanion.scss": 15,
    "noteNeighbourhood.scss": 3,
    "noteStory.scss": 7,
    "review.scss": 1,
    "settingsScope.scss": 6,
    "settingsShell.scss": 3,
    "stepBuilder.scss": 2,
    "tend.scss": 1,
    "workflowCanvas.scss": 3,
};

function partials(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) partials(full, out);
        else if (entry.endsWith(".scss")) out.push(full);
    }
    return out;
}

/** Each finding under the partial that styles its class most — where the fix will go. */
function byPartial(found: string[]): Map<string, string[]> {
    const files = partials(join(SRC, "styles")).map((file) => ({ name: file.split(/[\\/]/).pop() as string, text: readFileSync(file, "utf8") }));
    const out = new Map<string, string[]>();
    for (const line of found) {
        const name = line.split(":")[0];
        const pattern = new RegExp(`${PREFIX}${name}(?![\\w-])`, "g");
        const home = files
            .map((file) => ({ name: file.name, hits: (file.text.match(pattern) ?? []).length }))
            .sort((a, b) => b.hits - a.hits)[0];
        const file = home && home.hits > 0 ? home.name : "(unknown)";
        out.set(file, [...(out.get(file) ?? []), line]);
    }
    return out;
}
