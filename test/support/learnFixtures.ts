/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * A small Learn catalog (#801), shaped like `docs/learn/catalog.json`, for the plugin's tests: two
 * tracks, three tutorials, a reference row and a question. Each call is a fresh copy to mutate.
 */
const L = (en: string, es = `${en} (es)`) => ({ en, es });
const steps = (n = 3) => Array.from({ length: n }, (_, i) => ({ title: L(`Step ${i + 1}`), body: L(`Body ${i + 1}`) }));

export function tutorial(title: string, extra: Record<string, unknown> = {}): any {
    return {
        title: L(title),
        summary: L(`${title}, in short`),
        minutes: 3,
        level: "easy",
        door: L("Ribbon menu"),
        hero: "docs/resources/undo/undo.svg",
        steps: steps(),
        tip: L("A tip"),
        doc: "architecture/reversibility.md",
        related: [],
        since: "3.7.0",
        ...extra,
    };
}

export function learnCatalog(): any {
    return {
        schema: { major: 1, minor: 0 },
        tracks: [
            { id: "start", title: L("Start here", "Empieza aquí"), blurb: L("The first ten minutes"), tutorials: ["get-started", "undo"] },
            { id: "think", title: L("Think"), blurb: L("Before it is knowledge"), tutorials: ["think"] },
        ],
        tutorials: {
            "get-started": tutorial("Get started", { tryIt: { capability: "home", label: L("Show home") }, title: L("Get started", "Empieza") }),
            undo: tutorial("Undo what a flow wrote", { related: ["get-started", "gone"] }),
            think: tutorial("Think before it is knowledge"),
        },
        reference: [{ name: L("Home"), line: L("Where you start"), door: L("Ribbon menu › Show home"), group: L("Start"), doc: "development/zettelflow-home.md", capability: "home" }],
        faq: [{ q: L("Is there a server?"), a: L("No.") }],
    };
}

/**
 * The room's catalog (#802): three tracks, four tutorials, twelve reference rows in two groups and
 * two questions — enough for the ring, the bars, *Show all*, a group chip, search in both languages,
 * and a lesson whose steps each have a picture but one.
 */
export function learnRoomCatalog(): any {
    const pictures = (n: number, without: number[] = []) =>
        Array.from({ length: n }, (_, i) => ({
            title: L(`Step ${i + 1}`),
            body: L(`Body ${i + 1}`),
            ...(without.includes(i) ? {} : { image: `docs/resources/learn/step-${i + 1}.svg` }),
        }));
    const row = (name: string, group: string, extra: Record<string, unknown> = {}) => ({
        name: L(name),
        line: L(`What ${name} does`),
        door: L("Ribbon menu"),
        group: L(group),
        ...extra,
    });
    return {
        schema: { major: 1, minor: 0 },
        tracks: [
            { id: "start", title: L("Your first ten minutes", "Tus primeros diez minutos"), blurb: L("Where everyone begins"), tutorials: ["get-started", "undo"] },
            { id: "think", title: L("Think"), blurb: L("Before it is knowledge"), tutorials: ["think"] },
            { id: "read", title: L("Read"), blurb: L("Books in your vault"), tutorials: ["library"] },
        ],
        tutorials: {
            "get-started": tutorial("Get started", { steps: pictures(4, [2]), tryIt: { capability: "home", label: L("Show home", "Mostrar inicio") }, related: ["think"] }),
            undo: tutorial("Undo what a flow wrote", {
                title: L("Undo what a flow wrote", "Deshacer lo que escribió un flujo"),
                summary: L("Take back a whole run", "Deshacer una ejecución entera"),
                tryIt: { capability: "quick-capture", label: L("Capture") },
            }),
            // A control inside another view: nothing Learn can run, so no *Do it now* (#802 FR-13).
            think: tutorial("Think before it is knowledge", { tryIt: { capability: "inquiry", label: L("Ask a question") } }),
            library: tutorial("Your library", { title: L("Your library", "Tu Biblioteca"), summary: L("Every book, on a canvas shelf", "Cada libro, en una estantería de canvas"), doc: undefined }),
        },
        reference: [
            row("Undo", "Start", { name: L("Undo", "Deshacer"), tutorial: "undo", capability: "home" }),
            row("Home", "Start", { doc: "development/zettelflow-home.md" }),
            ...Array.from({ length: 8 }, (_, i) => row(`Start row ${i + 1}`, "Start", { doc: "development/zettelflow-home.md" })),
            row("Library", "Read", { name: L("Library", "Biblioteca"), tutorial: "library" }),
            row("Highlights", "Read", { doc: "development/zettelflow-home.md" }),
        ],
        faq: [
            { q: L("Can I undo what a flow wrote?", "¿Puedo deshacer lo que escribió un flujo?"), a: L("Yes, by batch.", "Sí, por lote.") },
            { q: L("Is there a server?", "¿Hay un servidor?"), a: L("No.", "No.") },
        ],
    };
}

/** The ids a catalog's tracks show, in order. */
export function trackIds(catalog: { tracks: { tutorials: string[] }[] }): string[] {
    return catalog.tracks.flatMap((track) => track.tutorials);
}
