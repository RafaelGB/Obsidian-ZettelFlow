/**
 * The keyboard behaviour of the wizard's option list, as a **pure reducer** (#407, epic #405).
 *
 * The list used to be a pile of `<div tabIndex={index}>` with an Enter-only handler: a positive tabindex
 * per option (which hijacks the tab order of the whole modal), no listbox semantics, and no Home/End,
 * page or typeahead movement. Expressing the behaviour as a reducer keeps it testable without a DOM —
 * the component only renders the state and performs the effect.
 *
 * Nothing here touches Obsidian or React.
 */

/** The minimum an option must expose for the list to move over it. */
export interface OptionListItem {
    key: string;
    label: string;
}

export interface OptionListState {
    /** Index of the active (aria-activedescendant) option; `-1` when none is. */
    activeIndex: number;
    /** Characters typed inside the typeahead window, lowercase. */
    typeahead: string;
    /** When the typeahead buffer was last extended. */
    typeaheadAt: number;
}

export type OptionListEffect =
    | { kind: "none" }
    | { kind: "activate"; key: string }
    | { kind: "close-search" };

export interface OptionListKeyEvent {
    key: string;
    /** Event timestamp; only the typeahead window uses it. */
    at: number;
}

export interface OptionListResult {
    state: OptionListState;
    effect: OptionListEffect;
    /** `false` means the key belongs to someone else (Tab, F-keys, the modal's own shortcuts). */
    handled: boolean;
}

export const INITIAL_OPTION_LIST_STATE: OptionListState = {
    activeIndex: -1,
    typeahead: "",
    typeaheadAt: 0,
};

/** How long consecutive keystrokes keep extending one typeahead prefix. */
export const TYPEAHEAD_WINDOW_MS = 800;

/** How far PageUp/PageDown move. Not the viewport height — a predictable, testable jump. */
export const PAGE_SIZE = 5;

/** A stable DOM id per (list, option), so `aria-activedescendant` can point at it. */
export function optionDomId(listId: string, optionKey: string): string {
    return `${listId}__option-${optionKey}`;
}

function clamp(index: number, length: number): number {
    if (length === 0) return -1;
    if (index < 0) return -1;
    return Math.min(index, length - 1);
}

function matchIndex(options: OptionListItem[], prefix: string, from: number): number {
    if (!prefix) return -1;
    // Search from just after the active option so repeated presses cycle through the matches.
    for (let offset = 0; offset < options.length; offset++) {
        const index = (from + offset) % options.length;
        if (options[index].label.toLowerCase().startsWith(prefix)) return index;
    }
    return -1;
}

function isPrintable(key: string): boolean {
    return key.length === 1 && key !== " ";
}

/**
 * Apply one keypress to the list. Returns the next state, the effect the component should perform, and
 * whether the key was consumed (an unhandled key must keep bubbling — Tab still has to leave the list).
 */
export function reduceOptionListKey(
    state: OptionListState,
    options: OptionListItem[],
    event: OptionListKeyEvent
): OptionListResult {
    const length = options.length;
    const active = clamp(state.activeIndex, length);
    const unchanged: OptionListResult = {
        state: { ...state, activeIndex: active },
        effect: { kind: "none" },
        handled: false,
    };
    if (length === 0) return unchanged;

    const move = (index: number): OptionListResult => ({
        state: { ...state, activeIndex: index },
        effect: { kind: "none" },
        handled: true,
    });

    switch (event.key) {
        case "ArrowDown":
            return move(active < 0 ? 0 : (active + 1) % length);
        case "ArrowUp":
            return move(active < 0 ? length - 1 : (active - 1 + length) % length);
        case "Home":
            return move(0);
        case "End":
            return move(length - 1);
        case "PageDown":
            return move(Math.min((active < 0 ? 0 : active) + PAGE_SIZE, length - 1));
        case "PageUp":
            return move(Math.max((active < 0 ? 0 : active) - PAGE_SIZE, 0));
        case "Enter":
        case " ":
            return active < 0
                ? { ...unchanged, handled: true }
                : {
                      state: { ...state, activeIndex: active },
                      effect: { kind: "activate", key: options[active].key },
                      handled: true,
                  };
        case "Escape":
            return {
                state: { ...state, activeIndex: active },
                effect: { kind: "close-search" },
                handled: true,
            };
        default:
            break;
    }

    if (!isPrintable(event.key)) return unchanged;

    const withinWindow = event.at - state.typeaheadAt <= TYPEAHEAD_WINDOW_MS;
    const typeahead = (withinWindow ? state.typeahead : "") + event.key.toLowerCase();
    // A fresh prefix searches from the active option; an extended one re-searches from it.
    const from = typeahead.length > 1 ? Math.max(active, 0) : Math.max(active, 0) + 1;
    const found = matchIndex(options, typeahead, from % length);

    return {
        state: {
            activeIndex: found >= 0 ? found : active,
            typeahead,
            typeaheadAt: event.at,
        },
        effect: { kind: "none" },
        handled: true,
    };
}
