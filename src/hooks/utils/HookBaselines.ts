import { copyFrontmatter } from "./CompareUtils";

type Frontmatter = Record<string, unknown>;

/**
 * What every note's watched properties looked like before the change being processed — the
 * "old value" a property hook diffs against.
 *
 * The baseline used to be taken only on `file-open`, so a note that was already open at startup,
 * or one edited from a Base or another pane, had none: its first change was compared with itself
 * and the hook never fired (a `status` set on a note that did not have one yet was the case that
 * got reported). Now every note is seeded once, for the watched properties only, and a note with a
 * baseline that lacks a property knows that property was absent.
 */
export class HookBaselines {
    private readonly notes = new Map<string, Frontmatter>();
    private readonly seeded = new Set<string>();

    /**
     * Learn the properties no baseline knows yet, from every note as it is now. The vault is only
     * enumerated when there is something new to learn (a hook added since the last seed).
     */
    seed(properties: string[], notes: () => Iterable<[string, Frontmatter | undefined]>): void {
        const fresh = properties.filter((property) => !this.seeded.has(property));
        if (!fresh.length) return;
        for (const [path, frontmatter] of notes()) {
            const baseline = this.notes.get(path) ?? {};
            for (const property of fresh) {
                if (frontmatter && property in frontmatter) {
                    baseline[property] = copyFrontmatter({ v: frontmatter[property] }).v;
                }
            }
            this.notes.set(path, baseline);
        }
        fresh.forEach((property) => this.seeded.add(property));
    }

    /** The note before this change. A note it never saw is treated as unchanged (it was just created). */
    previous(path: string, current: Frontmatter): Frontmatter {
        return this.notes.get(path) ?? current;
    }

    remember(path: string, frontmatter: Frontmatter): void {
        this.notes.set(path, copyFrontmatter(frontmatter));
    }

    rename(oldPath: string, newPath: string): void {
        const baseline = this.notes.get(oldPath);
        this.notes.delete(oldPath);
        if (baseline) this.notes.set(newPath, baseline);
    }

    forget(path: string): void {
        this.notes.delete(path);
    }
}
