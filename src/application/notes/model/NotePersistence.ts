/**
 * The **persistence/representation view** of the note under construction (#275, epic #268 S6) — the
 * *only* slice of the wizard-shaped `NoteDTO` the action/script boundary (`ExecuteInfo.note`) exposes:
 * where the note will be written (`getFinalPath`), how it is named (`getTitle`/`setTitle`) and where
 * it lives (`getTargetFolder`/`setTargetFolder`). These are exactly the methods the built-in actions
 * (`ZettelIdAction`, `SynthesizeAction`, target resolution) and the public **script API** touch.
 *
 * Knowledge **domain** access (identity, model, relation writes) does *not* go through this view — it
 * flows through the `KnowledgeContext` seam (#264). The wizard-flow builder (`addAction`,
 * `getElements`, `getPaths`, `addLink`, `setPattern`, …) stays private to the note-builder.
 */
export interface NotePersistence {
    /** The destination path the note will be written to: `targetFolder/title.md`. */
    getFinalPath(): string;
    getTitle(): string;
    setTitle(title: string): NotePersistence;
    getTargetFolder(): string;
    setTargetFolder(targetFolder: string | undefined): NotePersistence;
}

/**
 * A path-backed {@link NotePersistence} for callers that have only the note's final path and never
 * rename it — the headless post-index re-run (#200) and unit tests. `getFinalPath` returns the path
 * verbatim; title/folder are empty and their setters are chainable no-ops (the path is fixed).
 */
export function notePersistenceForPath(path: string): NotePersistence {
    const stub: NotePersistence = {
        getFinalPath: () => path,
        getTitle: () => "",
        setTitle: () => stub,
        getTargetFolder: () => "",
        setTargetFolder: () => stub,
    };
    return stub;
}
