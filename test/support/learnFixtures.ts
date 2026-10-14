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

/** The ids a catalog's tracks show, in order. */
export function trackIds(catalog: { tracks: { tutorials: string[] }[] }): string[] {
    return catalog.tracks.flatMap((track) => track.tutorials);
}
