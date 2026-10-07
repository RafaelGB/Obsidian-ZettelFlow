import type { SearchComponent, Setting } from "obsidian";
import { FolderSuggest } from "architecture/settings";

/** A folder a settings row edits: how to read it, take a new value, and keep it. */
export interface FolderFieldSpec {
    read: () => string;
    /** Take the value, or refuse it (and say why); returns whether it was taken. */
    accept: (value: string) => boolean;
    /** After a value is taken: save, and tell whoever else has to hear about it. */
    saved: () => Promise<void>;
    placeholder: string;
}

/**
 * How long a blur waits before it commits: a click on a folder suggestion blurs the field first, and
 * the choice must win over the half-typed text it replaces.
 */
const BLUR_COMMIT_MS = 200;

/**
 * A folder field with a suggest, committed when you leave it, press Enter or pick a suggestion —
 * never per keystroke (#659 runtime audit). Typing `_ZettelFlow/x` passes through `_ZettelFlow`:
 * checking every keystroke refused the path mid-word, and saving every keystroke stored every prefix
 * on the way (and, for the thinking space, re-scoped what the knowledge model leaves out each time).
 * Returns `commit`, so a reset can go through the same rule.
 */
export function addFolderField(setting: Setting, spec: FolderFieldSpec): (raw: string) => Promise<void> {
    let search: SearchComponent | null = null;
    let pendingBlur: number | null = null;
    const commit = async (raw: string): Promise<void> => {
        if (pendingBlur !== null) window.clearTimeout(pendingBlur);
        pendingBlur = null;
        const value = raw.trim();
        if (value === spec.read()) return;
        if (!spec.accept(value)) {
            // Refused once, said once, and the field shows what is kept.
            search?.setValue(spec.read());
            return;
        }
        await spec.saved();
    };
    setting.addSearch((cb) => {
        search = cb;
        new FolderSuggest(cb.inputEl, (path) => {
            cb.setValue(path);
            void commit(path);
        });
        cb.setPlaceholder(spec.placeholder).setValue(spec.read());
        cb.inputEl.addEventListener("blur", () => {
            if (pendingBlur !== null) window.clearTimeout(pendingBlur);
            pendingBlur = window.setTimeout(() => void commit(cb.getValue()), BLUR_COMMIT_MS);
        });
        cb.inputEl.addEventListener("keydown", (event: KeyboardEvent) => {
            if (event.key === "Enter" && !event.isComposing) void commit(cb.getValue());
        });
    });
    return async (raw: string) => {
        search?.setValue(raw);
        await commit(raw);
    };
}
