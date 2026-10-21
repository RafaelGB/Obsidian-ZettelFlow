import { Menu, setIcon, type Component } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";
import type { ShelfTarget } from "application/library/shelves";

/**
 * **Your shelves, by hand** (#821) — the controls the Library draws for the shelves you make: the
 * inline name field (*+ New shelf*, *Rename shelf*), the book's menu (*Details*, *Move to shelf…*) and
 * a shelf's own menu (*Rename shelf*, *Delete shelf*). Never a modal: a name is typed where the shelf
 * stands, and a refusal says why beside it. Obsidian's `Menu` is keyboard-native — arrows and Enter.
 */

/**
 * The Library's own shelves, in every language it speaks: a shelf of yours may not be called
 * *Reading* — nor *Leyendo*, whichever language you switch to later.
 */
export function reservedShelfNames(): string[] {
    return [en, es].flatMap((locale) => [locale.shelf_status_reading, locale.shelf_status_to_read, locale.shelf_status_finished, locale.shelf_status_none, locale.shelf_every_shelf]);
}

export interface NameFieldOptions {
    value?: string;
    /** Why a name is refused, or null when it is fine. */
    check: (raw: string) => string | null;
    commit: (raw: string) => void;
    cancel: () => void;
}

/** A name typed where the shelf will stand: Enter keeps it, Esc and leaving it empty let it go. */
export function nameField(parent: HTMLElement, scope: Component, options: NameFieldOptions): HTMLInputElement {
    const wrap = parent.createSpan({ cls: c("shelf-name-field") });
    const input = wrap.createEl("input", {
        cls: c("shelf-name-input"),
        attr: { type: "text", placeholder: t("shelf_new_placeholder"), "aria-label": t("shelf_new_placeholder"), spellcheck: "false" },
    });
    input.value = options.value ?? "";
    const why = wrap.createSpan({ cls: c("shelf-name-why"), attr: { role: "status" } });
    let done = false;
    const finish = (keep: boolean) => {
        if (done) return;
        if (keep) {
            const reason = options.check(input.value);
            if (reason) {
                why.setText(reason);
                return;
            }
            done = true;
            options.commit(input.value);
            return;
        }
        done = true;
        options.cancel();
    };
    scope.registerDomEvent(input, "keydown", (event: KeyboardEvent) => {
        if (event.isComposing) return;
        if (event.key === "Enter") {
            event.preventDefault();
            finish(true);
        } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            finish(false);
        }
    });
    scope.registerDomEvent(input, "input", () => why.setText(""));
    // Leaving it: a good name is kept, an empty one let go, a refused one stays to be mended.
    scope.registerDomEvent(input, "blur", () => {
        if (!input.value.trim()) finish(false);
        else if (!options.check(input.value)) finish(true);
    });
    return input;
}

export interface MoveChoice {
    target: ShelfTarget;
    label: string;
    current: boolean;
}

/** Where a menu opens: at the pointer, or under the button pressed from the keyboard. */
function show(menu: Menu, at: MouseEvent | HTMLElement): void {
    if (typeof (at as { clientX?: unknown }).clientX === "number") {
        menu.showAtMouseEvent(at as MouseEvent);
        return;
    }
    const rect = (at as HTMLElement).getBoundingClientRect?.();
    menu.showAtPosition({ x: rect?.left ?? 0, y: rect?.bottom ?? 0 });
}

/** Obsidian's own actions on a book's file (#856), each present only where it can work. */
export interface BookFileActions {
    open?: () => void;
    reveal?: () => void;
    show?: () => void;
}

/** The book's menu: *Details*, *Move to shelf…* for what can move, and its file's own actions (#856). */
export function bookMenu(
    at: MouseEvent | HTMLElement,
    actions: { details: () => void; move?: () => MoveChoice[]; choose: (target: ShelfTarget) => void; file?: BookFileActions; archive?: () => void }
): void {
    const menu = new Menu();
    menu.addItem((item) => item.setTitle(t("shelf_details")).setIcon("info").onClick(actions.details));
    const move = actions.move;
    if (move) {
        menu.addItem((item) =>
            item
                .setTitle(t("shelf_move_to"))
                .setIcon("library")
                .onClick(() => moveMenu(at, move(), actions.choose))
        );
    }
    // The file itself, in Obsidian's words and order: the system's app, the file explorer, the system's.
    const { open, reveal, show: inSystem } = actions.file ?? {};
    if (open || reveal || inSystem) menu.addSeparator();
    if (open) menu.addItem((item) => item.setTitle(t("shelf_open_default_app")).setIcon("arrow-up-right").onClick(open));
    if (reveal) menu.addItem((item) => item.setTitle(t("shelf_reveal_file")).setIcon("folder-open").onClick(reveal));
    if (inSystem) menu.addItem((item) => item.setTitle(t("shelf_show_in_system")).setIcon("folder").onClick(inSystem));
    // Put away in the cabinet (#865 FR-16), apart from the moves.
    const archive = actions.archive;
    if (archive) {
        menu.addSeparator();
        menu.addItem((item) => item.setTitle(t("shelf_menu_archive")).setIcon("archive").onClick(archive));
    }
    show(menu, at);
}

/** *Move to shelf…*: every shelf it can go to, the one it stands on checked. */
export function moveMenu(at: MouseEvent | HTMLElement, choices: readonly MoveChoice[], choose: (target: ShelfTarget) => void): void {
    const menu = new Menu();
    for (const choice of choices) {
        menu.addItem((item) =>
            item
                .setTitle(choice.label)
                .setChecked(choice.current)
                .onClick(() => {
                    if (!choice.current) choose(choice.target);
                })
        );
    }
    show(menu, at);
}

/** A shelf of yours, its own menu: rename it, delete it — its books stay. */
export function shelfMenu(at: MouseEvent | HTMLElement, actions: { rename: () => void; remove: () => void }): void {
    const menu = new Menu();
    menu.addItem((item) => item.setTitle(t("shelf_rename")).setIcon("pencil").onClick(actions.rename));
    menu.addItem((item) => item.setTitle(t("shelf_delete")).setIcon("trash-2").setWarning(true).onClick(actions.remove));
    menu.addSeparator();
    menu.addItem((item) => item.setTitle(t("shelf_delete_keeps_books")).setDisabled(true));
    show(menu, at);
}

/** The small mark a shelf of yours carries, on its chip and on its plank. */
export function ownMark(parent: HTMLElement): void {
    const mark = parent.createSpan({ cls: c("shelf-own-mark"), attr: { "aria-label": t("shelf_yours"), role: "img" } });
    setIcon(mark, "bookmark");
}
