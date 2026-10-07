/**
 * The notes left out, listed (#713, FR-14): by the rule that names each one — so the groups add up
 * to the summary — or A–Z. A group shows a few names and the rest on request; a name opens its note.
 * Reading, never judging: there is no "fix this" here, only what the rules you wrote leave out.
 */
import { setIcon } from "obsidian";
import { c } from "architecture";
import { t, tCount } from "architecture/lang";
import { noteName, type ScopeCensus } from "architecture/knowledge/scope/scopeCensus";
import type { ScopeRules } from "architecture/knowledge/scope/scopeRules";
import { ruleSentence } from "architecture/components/core/scope/ruleSentence";
import { scopeListShown, setScopeListShown } from "./scopeCard";

/** How many names a group shows before *and N more*. */
const GROUP_PREVIEW = 3;
/** How many names A–Z shows before *and N more*. */
const AZ_PREVIEW = 50;

const listState = { order: "rule" as "rule" | "az", expanded: new Set<string>() };

/** For tests: forget which groups were opened. */
export function __resetLeftOutList(): void {
    listState.order = "rule";
    listState.expanded.clear();
}

/** The list's renderer, for the card's `leftOutList` hook. `open` opens a note (and leaves settings). */
export function leftOutListRenderer(open: (path: string) => void) {
    return (summary: HTMLElement, host: HTMLElement, census: ScopeCensus, rules: ScopeRules, redraw: () => void): void => {
        const shown = scopeListShown();
        const toggle = summary.createEl("button", {
            cls: c("scope-left-out-toggle"),
            text: t(shown ? "settings_scope_hide_left_out" : "settings_scope_show_left_out"),
            attr: { type: "button", "aria-expanded": String(shown) },
        });
        toggle.addEventListener("click", () => {
            setScopeListShown(!shown);
            redraw();
        });
        if (!shown) return;

        const list = host.createDiv({ cls: c("scope-left-out") });
        const head = list.createDiv({ cls: c("scope-left-out-head") });
        head.createSpan({
            cls: c("scope-section-title"),
            text: tCount(census.leftOutByRules, "settings_scope_list_heading", census.leftOutByRules.toLocaleString()),
        });
        const order = head.createDiv({ cls: c("scope-segments"), attr: { role: "group" } });
        for (const [value, key] of [
            ["rule", "settings_scope_list_by_rule"],
            ["az", "settings_scope_list_az"],
        ] as const) {
            const on = listState.order === value;
            const button = order.createEl("button", {
                cls: [c("scope-segment"), ...(on ? ["is-active"] : [])],
                text: t(key),
                attr: { type: "button", "aria-pressed": String(on) },
            });
            button.addEventListener("click", () => {
                listState.order = value;
                redraw();
            });
        }

        const names = (paths: readonly string[], key: string, preview: number, into: HTMLElement) => {
            const all = listState.expanded.has(key);
            const visible = all ? paths : paths.slice(0, preview);
            const ul = into.createDiv({ cls: c("scope-left-out-names") });
            for (const path of visible) {
                const link = ul.createEl("button", { cls: c("scope-left-out-name"), text: noteName(path), attr: { type: "button", title: path } });
                link.addEventListener("click", () => open(path));
            }
            const rest = paths.length - visible.length;
            if (rest > 0) {
                const more = ul.createEl("button", {
                    cls: c("scope-left-out-more"),
                    text: tCount(rest, "settings_scope_and_more", rest.toLocaleString()),
                    attr: { type: "button" },
                });
                more.addEventListener("click", () => {
                    listState.expanded.add(key);
                    redraw();
                });
            }
        };

        if (listState.order === "az") {
            const every = census.groups.flatMap((group) => group.paths).sort((a, b) => noteName(a).localeCompare(noteName(b)));
            names(every, "az", AZ_PREVIEW, list);
            return;
        }
        for (const group of census.groups) {
            const rule = rules.leaveOut[group.index];
            const box = list.createDiv({ cls: c("scope-left-out-group") });
            const title = box.createDiv({ cls: c("scope-left-out-group-title") });
            setIcon(title.createSpan({ cls: c("scope-rule-icon") }), rule?.kind === "tag" ? "hash" : rule?.kind === "property" ? "list" : "folder");
            title.createSpan({ cls: c("scope-left-out-sentence"), text: rule ? ruleSentence(rule) : "" });
            title.createSpan({ cls: c("scope-count"), text: group.paths.length.toLocaleString() });
            names(group.paths, `rule:${group.index}`, GROUP_PREVIEW, box);
        }
    };
}
