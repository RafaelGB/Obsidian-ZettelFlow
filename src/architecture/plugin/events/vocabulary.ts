/**
 * The closed vocabulary of workflow-trigger events (#150). An event is a Workflow-Engine concept:
 * a vault/metadata signal, normalized, that a per-flow binding can react to. The full vocabulary is
 * fixed (FR-1); only a subset is *wired* (actually observed) in v1 — the cheap, deterministic four.
 * The rest (`note.linked`/`unlinked`, `workflow.completed`, `review.due`) are reserved tokens,
 * deferred to a later slice. Pure & Obsidian-free.
 */

/** Every workflow-trigger event token the vocabulary defines (closed). */
export type WorkflowEvent =
    | "note.created"
    | "note.modified"
    | "note.linked"
    | "note.unlinked"
    | "property.changed"
    | "tag.added"
    | "workflow.completed"
    | "review.due";

/** The events actually observed & dispatched in v1 (maintainer decision, OQ-1). */
export type WiredEvent = "note.created" | "note.modified" | "property.changed" | "tag.added";

/** The eight tokens, in canonical order. */
export const WORKFLOW_EVENTS: readonly WorkflowEvent[] = [
    "note.created",
    "note.modified",
    "note.linked",
    "note.unlinked",
    "property.changed",
    "tag.added",
    "workflow.completed",
    "review.due",
] as const;

/** The four wired v1 events, in canonical order. Everything else is deferred. */
export const WIRED_EVENTS: readonly WiredEvent[] = [
    "note.created",
    "note.modified",
    "property.changed",
    "tag.added",
] as const;

export function isWorkflowEvent(value: unknown): value is WorkflowEvent {
    return typeof value === "string" && (WORKFLOW_EVENTS as readonly string[]).includes(value);
}

export function isWiredEvent(value: unknown): value is WiredEvent {
    return typeof value === "string" && (WIRED_EVENTS as readonly string[]).includes(value);
}

/**
 * The payload a normalized event carries — enough for a binding's condition to inspect the change.
 * `property`/`tag`/`oldValue`/`newValue` are populated only for the synthesized events that derive
 * from a frontmatter/tag diff (`property.changed`, `tag.added`).
 */
export interface WorkflowEventPayload {
    event: WorkflowEvent;
    /** Vault-relative path of the affected note. */
    notePath: string;
    /** The frontmatter property that changed (`property.changed` only). */
    property?: string;
    /** The tag that was added (`tag.added` only). */
    tag?: string;
    /** Previous value of the changed property (`property.changed` only). */
    oldValue?: unknown;
    /** New value of the changed property (`property.changed` only). */
    newValue?: unknown;
}

/** i18n key of each wired event's sentence-case label. Pure data; the `t()` lookup lives in the UI. */
export const EVENT_LABEL_KEY: Record<WiredEvent, string> = {
    "note.created": "event_note_created_label",
    "note.modified": "event_note_modified_label",
    "property.changed": "event_property_changed_label",
    "tag.added": "event_tag_added_label",
} as const;
