import type { IdeaState } from "../model/Idea";
import type { StateSchema } from "../model/schema";
import {
    DEFAULT_STATE_PROPERTY,
    FALLBACK_STATE,
    LIFECYCLE_STATES,
    LifecycleState,
    isLifecycleState,
    normalize,
} from "./states";

/** Localized display label (normalized) → canonical token. Built from `t()` at registration. */
export type LocalizedAliasMap = Readonly<Record<string, LifecycleState>>;

/**
 * Concrete {@link StateSchema} (#145 extension point) that classifies a frontmatter value into the
 * canonical lifecycle. Pure, Obsidian-free and never throws: it tolerates case, surrounding
 * whitespace, the display emoji, and injected localized labels, and maps anything missing, empty
 * or unrecognized to {@link FALLBACK_STATE} (fleeting).
 */
export class LifecycleStateSchema implements StateSchema {
    readonly property: string;
    readonly all: readonly IdeaState[] = LIFECYCLE_STATES;
    private readonly aliases: Record<string, LifecycleState>;

    constructor(property: string = DEFAULT_STATE_PROPERTY, aliases: LocalizedAliasMap = {}) {
        this.property = property || DEFAULT_STATE_PROPERTY;
        this.aliases = {};
        for (const [label, state] of Object.entries(aliases)) {
            this.aliases[normalize(label)] = state;
        }
    }

    /**
     * Whether the note **states** a state this schema knows (#640). `parse` reads a missing or
     * unknown value as fleeting (decision #1); a view that draws where a note stands must not.
     */
    recognises(frontmatter: Record<string, unknown>): boolean {
        const raw = frontmatter?.[this.property];
        if (typeof raw !== "string") return false;
        const value = normalize(raw);
        return value !== "" && (isLifecycleState(value) || this.aliases[value] !== undefined);
    }

    parse(frontmatter: Record<string, unknown>): IdeaState {
        const raw = frontmatter?.[this.property];
        if (typeof raw !== "string") return FALLBACK_STATE;
        const value = normalize(raw);
        if (!value) return FALLBACK_STATE;
        if (isLifecycleState(value)) return value;
        return this.aliases[value] ?? FALLBACK_STATE;
    }
}
