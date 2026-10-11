import type { TFile } from "obsidian";
import { mergeSourceEntries } from "application/library/provenance";
import { FrontmatterService } from "architecture/plugin/services/FrontmatterService";
import { withWriteBatch } from "architecture/plugin/writes/recordVaultWrite";

/**
 * **The one writer of a note's `source` list** (#751 P7; used by #756 *Connect* and #762 *Link to an
 * idea*): add passage entries (`sourceEntry`) to a note that already exists. One property write,
 * through the recorded seam — so it is in *Recent* and can be taken back — appended without
 * duplicates. The note's body is never touched, and the book is never written.
 */
export async function addSourceEntries(file: TFile, entries: readonly string[]): Promise<boolean> {
    if (entries.length === 0) return false;
    let changed = false;
    await withWriteBatch({ kind: "manual", ref: "reader-source", label: file.path }, () =>
        FrontmatterService.instance(file).update((frontmatter) => {
            const next = mergeSourceEntries(frontmatter.source, entries);
            if (!next) return;
            frontmatter.source = next;
            changed = true;
        })
    );
    return changed;
}
