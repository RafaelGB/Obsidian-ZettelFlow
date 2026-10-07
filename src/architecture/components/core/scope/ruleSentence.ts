/**
 * One scope rule, said as a sentence (#713) — the words the settings card, This note, Cultivate's
 * inquiry and the crystallize dialog all use, so a note is refused for the same reason everywhere.
 *
 * Each rule finishes "Leave out notes that…": *are in Templates and its subfolders*, *have the tag
 * #template or #draft*, *have type set to moc or index*.
 */
import { t } from "architecture/lang";
import type { ScopeReason, ScopeRule, ScopeRules } from "architecture/knowledge/state";

type LocaleKey = Parameters<typeof t>[0];

/** A piece of a sentence: plain words, or the values it names (drawn as chips on the card). */
export type SentencePart = { text: string } | { chips: string[] };

function templateOf(rule: ScopeRule): { key: LocaleKey; slots: string[][] } {
    switch (rule.kind) {
        case "folder": {
            const key: LocaleKey =
                rule.op === "in"
                    ? rule.subfolders ? "scope_rule_folder_in_sub" : "scope_rule_folder_in"
                    : rule.subfolders ? "scope_rule_folder_not_in_sub" : "scope_rule_folder_not_in";
            return { key, slots: [[rule.folder]] };
        }
        case "tag": {
            const key: LocaleKey =
                rule.op === "any"
                    ? rule.nested ? "scope_rule_tag_any_nested" : "scope_rule_tag_any"
                    : rule.nested ? "scope_rule_tag_none_nested" : "scope_rule_tag_none";
            return { key, slots: [rule.tags.map((tag) => `#${tag}`)] };
        }
        case "property":
            if (rule.op === "set") return { key: "scope_rule_prop_set", slots: [[rule.property]] };
            if (rule.op === "notSet") return { key: "scope_rule_prop_not_set", slots: [[rule.property]] };
            return { key: "scope_rule_prop_one_of", slots: [[rule.property], rule.values] };
    }
}

/** The sentence in parts, so the card can draw the values as chips. */
export function ruleSentenceParts(rule: ScopeRule): SentencePart[] {
    const { key, slots } = templateOf(rule);
    const parts: SentencePart[] = [];
    // `t` with placeholders left in, then split on them: the locale decides the word order.
    const template = t(key, "\u0000{0}\u0000", "\u0000{1}\u0000");
    for (const piece of template.split("\u0000")) {
        const slot = /^\{(\d)\}$/.exec(piece);
        if (slot) parts.push({ chips: slots[Number(slot[1])] ?? [] });
        else if (piece) parts.push({ text: piece });
    }
    return parts;
}

/** The sentence as plain text: values joined with "or". */
export function ruleSentence(rule: ScopeRule): string {
    const or = ` ${t("scope_rule_or")} `;
    return ruleSentenceParts(rule)
        .map((part) => ("text" in part ? part.text : part.chips.join(or)))
        .join("");
}

/** What left a note out, named: a rule's sentence, or ZettelFlow's own folders. */
export function scopeReasonName(reason: ScopeReason, rules: ScopeRules): string {
    if (reason.kind === "system") return t("settings_scope_system_name");
    const rule = rules.leaveOut[reason.index];
    return rule ? ruleSentence(rule) : "";
}
