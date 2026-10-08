import { describe, it, expect } from "@jest/globals";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { SETTINGS_SECTIONS } from "config/modals/settingsShell";

const ROOT = join(__dirname, "..", "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");
const TAB = read("src", "config", "modals", "ZettelFlowSettingsTab.tsx");
const HANDLERS = readdirSync(join(ROOT, "src", "config", "modals", "handlers"))
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => read("src", "config", "modals", "handlers", file));

/** Every row the tab and its group modules declare, by the locale key of its name. */
function rowNames(): Set<string> {
    const names = new Set<string>();
    for (const source of [TAB, ...HANDLERS]) {
        for (const m of source.matchAll(/name: t\("([^"]+)"/g)) names.add(m[1]);
        // A row built from a table (the folders grid, #663) names itself through `nameKey`.
        for (const m of source.matchAll(/nameKey: "([^"]+)"/g)) names.add(m[1]);
    }
    return names;
}

/** The section heads, in the order the tab draws them. */
function sectionOrder(): string[] {
    return [...TAB.matchAll(/this\.sectionHead\("([a-z]+)"\)/g)].map((m) => m[1]);
}

/**
 * The rows the tab declared before #660, measured from the source before the change. A row may
 * move house; it may not disappear. The ones that did are listed below with what replaced them.
 */
const BEFORE_660 = [
    "community_templates_browser_title", "create_in_current_folder_toggle_title", "folders_flows_selector_title",
    "generate_types_name", "hooks_flows_selector_title", "logger_level_title", "manage_installed_templates_title",
    "markdown_templates_folder_title", "open_home_on_startup_toggle_title", "property_hooks_setting_title",
    "scripts_folder_selector_title", "settings_about_docs", "settings_about_version", "settings_advanced_toggle",
    "settings_ai_apikey_name", "settings_ai_disclosure", "settings_ai_enable_name", "settings_ai_endpoint_name",
    "settings_ai_intro", "settings_ai_max_input_name", "settings_ai_max_output_name", "settings_ai_model_name",
    "settings_builder_friction_name", "settings_colour_by_phase_title", "settings_created_property_name",
    "settings_cultivate_friction_name", "settings_cultivate_intro", "settings_event_flows_title",
    "settings_events_bindings_heading", "settings_excluded_paths_name", "settings_explore_think_first_name",
    "settings_flows_assign", "settings_flows_heading", "settings_flows_intro", "settings_get_started_description",
    "settings_journal_disclosure", "settings_journal_enable_name", "settings_journal_intro",
    "settings_judgements_disclosure", "settings_judgements_enable_name", "settings_judgements_intro",
    "settings_last_reviewed_property_name", "settings_lifecycle_intro", "settings_parse_inline_relations_name",
    "settings_patterns_enable_name", "settings_relations_intro", "settings_return_disclosure",
    "settings_return_interval_name", "settings_return_intro", "settings_scope_intro", "settings_state_property_name",
    "settings_summary_name", "settings_thought_lab_name", "settings_timeline_disclosure",
    "settings_timeline_enable_name", "settings_timeline_intro", "settings_wizard_density_name",
    "settings_wizard_drafts_name", "speed_title", "support_coffee_button", "unique_prefix_pattern_title",
];

/** Rows #660 replaced, each with what took its place. None of them held a setting. */
const REPLACED: Record<string, string> = {
    settings_summary_name: "settings_glance_name — the four cards, which no longer print undefined",
    settings_get_started_description: "settings_start_title — three ways in that do what they say",
    settings_advanced_toggle: "the Advanced section head's own toggle (an alias for search), now remembered",
    settings_about_version: "settings_footer_name — one footer line",
    settings_about_docs: "settings_footer_name — one footer line",
    support_coffee_button: "settings_footer_name — one footer line",
    // #662 — rows that only repeated what their card or the row beside them already said.
    settings_scope_intro: "settings_excluded_paths_desc — the same sentence was said twice",
    settings_relations_intro: "the Typed links card heading and the toggle's own description",
    settings_return_intro: "settings_return_interval_desc — the slider's description now says it",
    settings_return_disclosure: "settings_return_interval_desc — never adapts, nothing reminds you",
    settings_journal_intro: "the journal tile's own description",
    settings_judgements_intro: "the decisions tile's own description",
    settings_timeline_intro: "the snapshots tile's own description",
    settings_journal_disclosure: "the journal tile's lock line — what is stored, said in the tile",
    settings_judgements_disclosure: "the decisions tile's lock line",
    settings_timeline_disclosure: "the snapshots tile's lock line",
    // #663 — the AI card: one switch, the provider only when it is on.
    settings_ai_intro: "the AI section head's purpose — optional, everything works with it off",
    settings_ai_max_input_name: "settings_ai_limits_name — one row, two inputs (still found by this name)",
    settings_ai_max_output_name: "settings_ai_limits_name — one row, two inputs (still found by this name)",
    settings_ai_disclosure: "settings_ai_privacy_name — the same promise, as a callout that is always shown",
    // #713 — the folder list became rules; its name is now an alias of the row, still found by search.
    settings_excluded_paths_name: "settings_scope_name — closed rules and exceptions (aliased as Excluded folders)",
};

/**
 * The tab reads as eight sections (#660, epic #659; Reading since #732), each opened by a head with its icon and
 * purpose: what you launch, how notes are built, what counts as knowledge, how thinking behaves,
 * then AI, automation and the folded internals. The order is part of the answer.
 */
describe("the settings tab is eight sections (#660, #732)", () => {
    it("draws the sections in the order the epic decided", () => {
        expect(sectionOrder()).toEqual(SETTINGS_SECTIONS.map((section) => section.id));
        expect(sectionOrder()).toEqual(["flows", "creating", "knowledge", "thinking", "reading", "ai", "automation", "advanced"]);
    });

    it("says who it is and what is on before the first section asks anything", () => {
        expect(TAB.indexOf("this.shellGroup()")).toBeLessThan(TAB.indexOf('this.sectionHead("flows")'));
        // Redrawn in place by refreshGlance (#659 runtime audit), from the live settings.
        expect(TAB).toContain("settingsGlance(this.plugin.settings");
    });

    it("opens on your flows, which the group module heads", () => {
        const flows = TAB.slice(TAB.indexOf('this.sectionHead("flows")'), TAB.indexOf('this.sectionHead("creating")'));
        expect(flows).toContain("flowsSettingsGroup(plugin");
    });

    it("gives Thinking its cards back, in order", () => {
        const thinking = TAB.slice(TAB.indexOf('this.sectionHead("thinking")'), TAB.indexOf('this.sectionHead("ai")'));
        // #662: the pauses, the moves as a grid, the returns with the thinking space and the
        // pattern re-run, then what ZettelFlow remembers as three privacy tiles.
        const order = [
            "settings_card_pauses",
            "movesSettingsGroup(plugin",
            "returnSettingsGroup(plugin",
            "rememberedSettingsGroup(plugin)",
        ];
        const at = order.map((marker) => thinking.indexOf(marker));
        expect(at.every((index) => index >= 0)).toBe(true);
        expect([...at].sort((a, b) => a - b)).toEqual(at);
        // The three "your reading first" pauses, which lived in two groups, sit together.
        const pauses = thinking.slice(at[0], at[1]);
        for (const key of ["settings_cultivate_friction_name", "settings_builder_friction_name", "settings_explore_think_first_name"]) {
            expect(pauses).toContain(key);
        }
    });

    it("folds Advanced behind a toggle that is remembered, not reset on every visit", () => {
        const advanced = TAB.slice(TAB.indexOf('this.sectionHead("advanced")'), TAB.indexOf("this.footerGroup()"));
        // #663: the two cards live in their own module and take the fold as their `visible`.
        expect(advanced).toContain("foldersSettingsGroup(plugin, advanced,");
        expect(advanced).toContain("scriptsLoggingGroup(advanced)");
        const module = read("src", "config", "modals", "handlers", "advancedSettingsGroups.ts");
        expect(module.match(/^\s+visible,$/gm)).toHaveLength(2);
        expect(TAB).toContain("const advanced = () => plugin.settings.showAdvancedSettings === true;");
        expect(TAB).toContain("plugin.settings.showAdvancedSettings = value;");
        expect(TAB).not.toContain("private showAdvanced");
        // The timings left the Health surface for here, beside the log level (#645).
        expect(module).toContain("...speedSettingsItems()");
    });

    it("shows the start card only while nothing creates notes", () => {
        const start = TAB.slice(TAB.indexOf('name: t("settings_start_title")'));
        expect(start.slice(0, 400)).toContain("visible: () => !plugin.settings.ribbonCanvas");
    });

    it("keeps every setting it had — a row may move, never vanish", () => {
        const now = rowNames();
        const missing = BEFORE_660.filter((key) => !now.has(key) && !(key in REPLACED));
        expect(missing).toEqual([]);
    });

    it("keeps the replacements honest — a replaced row is really gone", () => {
        const now = rowNames();
        expect(Object.keys(REPLACED).filter((key) => now.has(key))).toEqual([]);
    });
});
