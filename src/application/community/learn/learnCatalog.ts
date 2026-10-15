import { CAPABILITIES } from "architecture/components/core/surface/capabilities";

/**
 * **The Learn catalog** (#801, epic #797) — what it is, and the one place its shape is written down.
 *
 * Pure, and Obsidian-free, because two readers share it: **CI** checks the committed
 * catalog under `docs/learn/` with {@link validateLearnCatalog} and fails on the first entry that is
 * wrong, and **the plugin** reads the fetched copy with {@link parseLearnCatalog}, which drops what
 * it cannot trust and keeps the rest. Same rules, two tempers.
 *
 * The catalog is data from the network, so it is read as untrusted: strings are shown as text, a
 * path is only ever a relative docs page or an image under `docs/resources/`, and a *try it* names a
 * capability id that resolves locally — never a command id, a URL or code.
 */

/** A string in both languages the plugin speaks. */
export interface L10n {
    en: string;
    es: string;
}

export type Lang = "en" | "es";

export const LEVELS = ["easy", "medium", "hard"] as const;
export type Level = (typeof LEVELS)[number];

/** A *Do it now* target: a capability id from `CAPABILITIES`, and the button's own words. */
export interface TryIt {
    capability: string;
    label: L10n;
}

export interface Step {
    title: L10n;
    body: L10n;
    /** A path under `docs/resources/`, never a URL. */
    image?: string;
}

export interface Tutorial {
    id: string;
    title: L10n;
    summary: L10n;
    minutes: number;
    level: Level;
    /** Where it is, in UI words. */
    door: L10n;
    tryIt?: TryIt;
    hero?: string;
    steps: Step[];
    tip?: L10n;
    /** A page under `docs/`, relative, ending in `.md`. */
    doc?: string;
    related: string[];
    /** The oldest plugin version the tutorial describes. */
    since: string;
}

export interface Track {
    id: string;
    title: L10n;
    blurb: L10n;
    tutorials: string[];
}

export interface RefRow {
    name: L10n;
    line: L10n;
    door: L10n;
    group: L10n;
    doc?: string;
    tutorial?: string;
    capability?: string;
}

export interface Faq {
    q: L10n;
    a: L10n;
}

export interface LearnCatalog {
    schema: { major: number; minor: number };
    tracks: Track[];
    tutorials: Record<string, Tutorial>;
    reference: RefRow[];
    faq: Faq[];
}

/** The schema major this plugin reads. A newer major is a catalog for a newer plugin. */
export const LEARN_SCHEMA_MAJOR = 1;

/** The docs site (GitHub Pages). mkdocs serves a page as a directory, so a URL ends in a slash. */
export const DOCS_SITE = "https://rafaelgb.github.io/Obsidian-ZettelFlow/";

export const MIN_STEPS = 3;
export const MAX_STEPS = 6;

const ID = /^[a-z0-9][a-z0-9-]*$/;
const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;
const DOC_PATH = /^[A-Za-z0-9][A-Za-z0-9/_-]*\.md$/;
const IMAGE_PATH = /^docs\/resources\/[A-Za-z0-9/_-]+\.(svg|png)$/;

// ── small pure helpers ────────────────────────────────────────────────────────

/** A docs page path that can only ever name a page of the docs site. */
export function isSafeDoc(path: unknown): path is string {
    return typeof path === "string" && DOC_PATH.test(path) && !path.includes("..") && !path.includes("//");
}

/** An image path that can only ever name a file under `docs/resources/`. */
export function isSafeImage(path: unknown): path is string {
    return typeof path === "string" && IMAGE_PATH.test(path) && !path.includes("..") && !path.includes("//");
}

/**
 * The docs site URL of a validated page — the only URL Learn ever builds. `index.md` is its folder.
 * Null for a path that is not a safe docs page.
 */
export function docUrl(doc: string): string | null {
    if (!isSafeDoc(doc)) return null;
    const page = doc.replace(/\.md$/, "").replace(/(^|\/)index$/, "");
    return page ? `${DOCS_SITE}${page}/` : DOCS_SITE;
}

export function isVersion(value: unknown): value is string {
    return typeof value === "string" && VERSION.test(value);
}

/** `x.y.z`, compared number by number: −1, 0 or 1. A value that is not a version sorts first. */
export function compareVersions(a: string, b: string): number {
    const parse = (v: string) => (VERSION.exec(v) ?? [v, "-1", "-1", "-1"]).slice(1, 4).map(Number);
    const [x, y] = [parse(a), parse(b)];
    for (let i = 0; i < 3; i++) {
        if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
    }
    return 0;
}

/** Spanish when Obsidian speaks it, English for everything else (FR-13). */
export function langOf(obsidianLanguage: string | null | undefined): Lang {
    return obsidianLanguage === "es" ? "es" : "en";
}

export function pick(text: L10n, lang: string): string {
    return langOf(lang) === "es" ? text.es : text.en;
}

/** Every tutorial a track shows, in track order. */
export function tutorialsInTracks(catalog: LearnCatalog): Tutorial[] {
    return catalog.tracks.flatMap((track) => track.tutorials.map((id) => catalog.tutorials[id]).filter((tut): tut is Tutorial => !!tut));
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

// ── the strict validator (CI) ─────────────────────────────────────────────────

export interface LearnProblem {
    /** Where, e.g. `tutorials.undo.steps`. */
    path: string;
    problem: string;
}

export interface ValidateContext {
    /** Whether a repo-relative path (`docs/…`) exists. */
    exists(path: string): boolean;
    capabilities: readonly string[];
    /** `manifest.json`'s version: nothing may be `since` a newer one. */
    pluginVersion: string;
}

/**
 * Every problem with a catalog, each naming its entry. Empty is the only passing answer — CI runs it
 * over the published catalog and over fixtures that must each fail.
 */
export function validateLearnCatalog(raw: unknown, ctx: ValidateContext): LearnProblem[] {
    const problems: LearnProblem[] = [];
    const say = (path: string, problem: string): void => {
        problems.push({ path, problem });
    };
    const l10n = (path: string, value: unknown) => {
        if (!isObject(value)) return say(path, "missing (needs en and es)");
        for (const lang of ["en", "es"] as const) if (!nonEmpty(value[lang])) say(`${path}.${lang}`, "missing or empty");
    };
    const doc = (path: string, value: unknown) => {
        if (!isSafeDoc(value)) return say(path, `${JSON.stringify(value)} is not a docs page path`);
        if (!ctx.exists(`docs/${value}`)) say(path, `docs/${value} does not exist`);
    };
    const image = (path: string, value: unknown) => {
        if (!isSafeImage(value)) return say(path, `${JSON.stringify(value)} is not an image under docs/resources/`);
        if (!ctx.exists(value)) say(path, `${value} does not exist`);
    };
    const capability = (path: string, value: unknown) => {
        if (typeof value !== "string" || !ctx.capabilities.includes(value)) say(path, `${JSON.stringify(value)} is not a capability`);
    };

    if (!isObject(raw)) return [{ path: "", problem: "not an object" }];
    const schema = raw.schema;
    if (!isObject(schema) || !Number.isInteger(schema.major) || !Number.isInteger(schema.minor)) say("schema", "needs an integer major and minor");
    else if (schema.major !== LEARN_SCHEMA_MAJOR) say("schema.major", `${String(schema.major)} (this plugin reads ${LEARN_SCHEMA_MAJOR})`);

    const tutorials = isObject(raw.tutorials) ? raw.tutorials : null;
    if (!tutorials) say("tutorials", "needs an object of tutorials by id");
    const ids = new Set(Object.keys(tutorials ?? {}));

    const placed = new Map<string, string[]>();
    if (!Array.isArray(raw.tracks)) say("tracks", "needs a list");
    const trackIds = new Set<string>();
    (Array.isArray(raw.tracks) ? raw.tracks : []).forEach((track: unknown, i) => {
        const at = `tracks[${i}]`;
        if (!isObject(track)) return say(at, "not an object");
        const id = track.id;
        const where = typeof id === "string" ? `tracks.${id}` : at;
        if (typeof id !== "string" || !ID.test(id)) say(where, "needs a lowercase id");
        else if (trackIds.has(id)) say(where, "duplicate track id");
        else trackIds.add(id);
        l10n(`${where}.title`, track.title);
        l10n(`${where}.blurb`, track.blurb);
        if (!Array.isArray(track.tutorials) || track.tutorials.length === 0) return say(`${where}.tutorials`, "needs at least one tutorial id");
        for (const tid of track.tutorials) {
            if (typeof tid !== "string" || !ids.has(tid)) {
                say(`${where}.tutorials`, `${JSON.stringify(tid)} is not a tutorial`);
                continue;
            }
            placed.set(tid, [...(placed.get(tid) ?? []), String(id)]);
        }
    });

    for (const [id, tut] of Object.entries(tutorials ?? {})) {
        const at = `tutorials.${id}`;
        if (!ID.test(id)) say(at, "needs a lowercase id");
        const tracks = placed.get(id) ?? [];
        if (tracks.length !== 1) say(at, tracks.length === 0 ? "is in no track" : `is in ${tracks.length} tracks (${tracks.join(", ")})`);
        if (!isObject(tut)) {
            say(at, "not an object");
            continue;
        }
        for (const field of ["title", "summary", "door"] as const) l10n(`${at}.${field}`, tut[field]);
        if (tut.tip !== undefined) l10n(`${at}.tip`, tut.tip);
        if (typeof tut.minutes !== "number" || !Number.isInteger(tut.minutes) || tut.minutes < 1) say(`${at}.minutes`, "needs a whole number of minutes");
        if (!(LEVELS as readonly unknown[]).includes(tut.level)) say(`${at}.level`, `${JSON.stringify(tut.level)} (needs ${LEVELS.join(", ")})`);
        image(`${at}.hero`, tut.hero);
        doc(`${at}.doc`, tut.doc);
        if (!isVersion(tut.since)) say(`${at}.since`, `${JSON.stringify(tut.since)} is not a version`);
        else if (compareVersions(tut.since, ctx.pluginVersion) > 0) say(`${at}.since`, `${tut.since} is newer than the plugin (${ctx.pluginVersion})`);
        if (tut.tryIt !== undefined) {
            if (!isObject(tut.tryIt)) say(`${at}.tryIt`, "not an object");
            else {
                capability(`${at}.tryIt.capability`, tut.tryIt.capability);
                l10n(`${at}.tryIt.label`, tut.tryIt.label);
            }
        }
        if (!Array.isArray(tut.related)) say(`${at}.related`, "needs a list");
        else
            for (const rid of tut.related) {
                if (rid === id) say(`${at}.related`, "names itself");
                else if (typeof rid !== "string" || !ids.has(rid)) say(`${at}.related`, `${JSON.stringify(rid)} is not a tutorial`);
            }
        if (!Array.isArray(tut.steps)) {
            say(`${at}.steps`, "needs a list");
            continue;
        }
        if (tut.steps.length < MIN_STEPS || tut.steps.length > MAX_STEPS) say(`${at}.steps`, `${tut.steps.length} steps (needs ${MIN_STEPS}–${MAX_STEPS})`);
        tut.steps.forEach((step: unknown, i) => {
            const sat = `${at}.steps[${i}]`;
            if (!isObject(step)) return say(sat, "not an object");
            l10n(`${sat}.title`, step.title);
            l10n(`${sat}.body`, step.body);
            if (step.image !== undefined) image(`${sat}.image`, step.image);
        });
    }

    if (!Array.isArray(raw.reference)) say("reference", "needs a list");
    (Array.isArray(raw.reference) ? raw.reference : []).forEach((row: unknown, i) => {
        const named = isObject(row) && isObject(row.name) && typeof row.name.en === "string" ? ` (${row.name.en})` : "";
        const at = `reference[${i}]${named}`;
        if (!isObject(row)) return say(at, "not an object");
        for (const field of ["name", "line", "door", "group"] as const) l10n(`${at}.${field}`, row[field]);
        if (row.doc !== undefined) doc(`${at}.doc`, row.doc);
        if (row.tutorial !== undefined && (typeof row.tutorial !== "string" || !ids.has(row.tutorial))) say(`${at}.tutorial`, `${JSON.stringify(row.tutorial)} is not a tutorial`);
        if (row.capability !== undefined) capability(`${at}.capability`, row.capability);
    });

    if (!Array.isArray(raw.faq)) say("faq", "needs a list");
    (Array.isArray(raw.faq) ? raw.faq : []).forEach((entry: unknown, i) => {
        const at = `faq[${i}]`;
        if (!isObject(entry)) return say(at, "not an object");
        l10n(`${at}.q`, entry.q);
        l10n(`${at}.a`, entry.a);
    });
    return problems;
}

// ── the lenient parser (the plugin) ───────────────────────────────────────────

export type ParsedCatalog = { status: "ok"; catalog: LearnCatalog } | { status: "newer-major" } | { status: "invalid" };

export interface ParseOptions {
    pluginVersion: string;
    /** The capability ids that resolve here. */
    capabilities?: readonly string[];
}

/** A string pair read leniently: one language stands in for a missing other; neither is nothing. */
function readL10n(value: unknown): L10n | null {
    if (!isObject(value)) return null;
    const en = nonEmpty(value.en) ? value.en : null;
    const es = nonEmpty(value.es) ? value.es : null;
    if (!en && !es) return null;
    return { en: en ?? (es as string), es: es ?? (en as string) };
}

function readStep(value: unknown): Step | null {
    if (!isObject(value)) return null;
    const title = readL10n(value.title);
    const body = readL10n(value.body);
    if (!title || !body) return null;
    return isSafeImage(value.image) ? { title, body, image: value.image } : { title, body };
}

function readTutorial(id: string, value: unknown, options: Required<ParseOptions>): Tutorial | null {
    if (!ID.test(id) || !isObject(value)) return null;
    const title = readL10n(value.title);
    const summary = readL10n(value.summary);
    const door = readL10n(value.door);
    if (!title || !summary || !door) return null;
    if (typeof value.minutes !== "number" || !Number.isFinite(value.minutes) || value.minutes <= 0) return null;
    if (!(LEVELS as readonly unknown[]).includes(value.level)) return null;
    if (!isVersion(value.since)) return null;
    // A tutorial about a newer plugin describes something this one does not have (FR-11).
    if (compareVersions(value.since, options.pluginVersion) > 0) return null;
    const steps = (Array.isArray(value.steps) ? value.steps : []).map(readStep).filter((step): step is Step => !!step).slice(0, MAX_STEPS);
    if (steps.length === 0) return null;
    const tutorial: Tutorial = {
        id,
        title,
        summary,
        minutes: Math.round(value.minutes),
        level: value.level as Level,
        door,
        steps,
        related: Array.isArray(value.related) ? value.related.filter((rid): rid is string => typeof rid === "string" && rid !== id) : [],
        since: value.since,
    };
    const tip = readL10n(value.tip);
    if (tip) tutorial.tip = tip;
    if (isSafeImage(value.hero)) tutorial.hero = value.hero;
    if (isSafeDoc(value.doc)) tutorial.doc = value.doc;
    if (isObject(value.tryIt) && typeof value.tryIt.capability === "string" && options.capabilities.includes(value.tryIt.capability)) {
        const label = readL10n(value.tryIt.label);
        if (label) tutorial.tryIt = { capability: value.tryIt.capability, label };
    }
    return tutorial;
}

/**
 * The fetched catalog, read defensively (FR-10, FR-11): an entry that is wrong is dropped and the
 * rest is kept; a tutorial newer than the plugin is left out everywhere; a newer **major** schema is
 * not read at all, because its meaning may have changed.
 */
export function parseLearnCatalog(raw: unknown, options: ParseOptions): ParsedCatalog {
    const opts: Required<ParseOptions> = { capabilities: CAPABILITIES, ...options };
    if (!isObject(raw) || !isObject(raw.schema) || typeof raw.schema.major !== "number") return { status: "invalid" };
    if (raw.schema.major > LEARN_SCHEMA_MAJOR) return { status: "newer-major" };
    if (raw.schema.major !== LEARN_SCHEMA_MAJOR) return { status: "invalid" };

    const candidates = new Map<string, Tutorial>();
    for (const [id, value] of Object.entries(isObject(raw.tutorials) ? raw.tutorials : {})) {
        const tutorial = readTutorial(id, value, opts);
        if (tutorial) candidates.set(id, tutorial);
    }

    // A tutorial lives in one track: the first that names it. One no track names is not shown.
    const tracks: Track[] = [];
    const placed = new Set<string>();
    const trackIds = new Set<string>();
    for (const value of Array.isArray(raw.tracks) ? raw.tracks : []) {
        if (!isObject(value) || typeof value.id !== "string" || !ID.test(value.id) || trackIds.has(value.id)) continue;
        const title = readL10n(value.title);
        const blurb = readL10n(value.blurb);
        if (!title || !blurb) continue;
        const ids = (Array.isArray(value.tutorials) ? value.tutorials : []).filter(
            (id): id is string => typeof id === "string" && candidates.has(id) && !placed.has(id)
        );
        if (ids.length === 0) continue;
        ids.forEach((id) => placed.add(id));
        trackIds.add(value.id);
        tracks.push({ id: value.id, title, blurb, tutorials: ids });
    }
    const tutorials: Record<string, Tutorial> = {};
    for (const id of placed) {
        const tutorial = candidates.get(id) as Tutorial;
        tutorials[id] = { ...tutorial, related: tutorial.related.filter((rid) => placed.has(rid)) };
    }

    const reference: RefRow[] = [];
    for (const value of Array.isArray(raw.reference) ? raw.reference : []) {
        if (!isObject(value)) continue;
        const name = readL10n(value.name);
        const line = readL10n(value.line);
        const door = readL10n(value.door);
        const group = readL10n(value.group);
        if (!name || !line || !door || !group) continue;
        const row: RefRow = { name, line, door, group };
        if (isSafeDoc(value.doc)) row.doc = value.doc;
        if (typeof value.tutorial === "string" && placed.has(value.tutorial)) row.tutorial = value.tutorial;
        if (typeof value.capability === "string" && opts.capabilities.includes(value.capability)) row.capability = value.capability;
        reference.push(row);
    }

    const faq: Faq[] = [];
    for (const value of Array.isArray(raw.faq) ? raw.faq : []) {
        if (!isObject(value)) continue;
        const q = readL10n(value.q);
        const a = readL10n(value.a);
        if (q && a) faq.push({ q, a });
    }

    const minor = typeof raw.schema.minor === "number" ? raw.schema.minor : 0;
    return { status: "ok", catalog: { schema: { major: LEARN_SCHEMA_MAJOR, minor }, tracks, tutorials, reference, faq } };
}
