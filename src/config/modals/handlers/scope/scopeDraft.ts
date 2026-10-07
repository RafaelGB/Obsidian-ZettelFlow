/**
 * The rule being written on the kept-out card (#713) — pure, and kept outside the DOM, so the real
 * settings renderer can re-run the row's `render` (cleanup → clear → render) without losing it.
 */
import type { ScopeRule, ScopeRuleKind } from "architecture/knowledge/scope/scopeRules";

export type DraftMode = "leaveOut" | "keep";

export interface ScopeDraft {
    mode: DraftMode;
    /** The rule's position when editing one; `-1` for a new rule. */
    editing: number;
    kind: ScopeRuleKind;
    folderOp: "in" | "notIn";
    folder: string;
    subfolders: boolean;
    tagOp: "any" | "none";
    tags: string[];
    nested: boolean;
    propertyOp: "oneOf" | "set" | "notSet";
    property: string;
    values: string[];
    /** What the picker's search box holds. Never part of a rule. */
    search: string;
}

/** A fresh draft. Folder first: it is what every vault has. */
export function newDraft(mode: DraftMode, kind: ScopeRuleKind = "folder"): ScopeDraft {
    return {
        mode,
        editing: -1,
        kind,
        folderOp: "in",
        folder: "",
        subfolders: true,
        tagOp: "any",
        tags: [],
        nested: true,
        propertyOp: "oneOf",
        property: "",
        values: [],
        search: "",
    };
}

/** A draft that edits a rule already on the card. */
export function draftFromRule(rule: ScopeRule, mode: DraftMode, index: number): ScopeDraft {
    const draft = { ...newDraft(mode, rule.kind), editing: index };
    switch (rule.kind) {
        case "folder":
            return { ...draft, folderOp: rule.op, folder: rule.folder, subfolders: rule.subfolders };
        case "tag":
            return { ...draft, tagOp: rule.op, tags: [...rule.tags], nested: rule.nested };
        case "property":
            return { ...draft, propertyOp: rule.op, property: rule.property, values: [...rule.values] };
    }
}

/**
 * The rule the draft says, or `null` while it is incomplete. A folder must exist in the vault (the
 * caller says whether it does) — a typo can never become a rule that silently matches nothing.
 */
export function draftToRule(draft: ScopeDraft, folderExists: (path: string) => boolean): ScopeRule | null {
    switch (draft.kind) {
        case "folder": {
            const folder = draft.folder.trim().replace(/^\/+|\/+$/g, "");
            if (!folder || !folderExists(folder)) return null;
            return { kind: "folder", op: draft.folderOp, folder: folder.normalize("NFC"), subfolders: draft.subfolders };
        }
        case "tag":
            return draft.tags.length > 0 ? { kind: "tag", op: draft.tagOp, tags: [...draft.tags], nested: draft.nested } : null;
        case "property":
            if (!draft.property) return null;
            if (draft.propertyOp !== "oneOf") return { kind: "property", op: draft.propertyOp, property: draft.property, values: [] };
            return draft.values.length > 0 ? { kind: "property", op: "oneOf", property: draft.property, values: [...draft.values] } : null;
    }
}

/** Pick or unpick one value in a list, keeping the order it was picked in. */
export function toggled(list: readonly string[], value: string): string[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}
