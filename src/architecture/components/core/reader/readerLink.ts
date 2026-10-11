import { TFile, type App } from "obsidian";
import { log } from "architecture";
import { parsePassageLink, serializePlace } from "application/library/provenance";
import { openReader, type ReaderRequest } from "./openReader";

/**
 * **A link to a passage, opened** (#751 FR-8, AC-7): `obsidian://zettelflow-read?…`, from any note or
 * from outside Obsidian, opens the Reader at the passage — exactly what *Born from* opens. A link that
 * is malformed, foreign, over its caps or names a file that is not in the vault opens nothing, shows
 * nothing, and is logged at debug. Registered once, by the Reader's own component.
 */
export function openPassageLink(
    app: App,
    params: Readonly<Record<string, unknown>>,
    open: (app: App, request: ReaderRequest) => Promise<void> = openReader
): boolean {
    const place = parsePassageLink(params);
    if (!place) {
        log.debug("[Reader] a passage link that is not one was ignored");
        return false;
    }
    if (!(app.vault.getAbstractFileByPath(place.file) instanceof TFile)) {
        log.debug(`[Reader] a passage link names a file that is not in the vault: ${place.file}`);
        return false;
    }
    void open(app, { seed: place.file, source: place.file, at: serializePlace(place) }).catch((error: unknown) =>
        log.error(`[Reader] could not open the passage link: ${String(error)}`)
    );
    return true;
}
