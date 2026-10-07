import { setIcon } from "obsidian";
import { c } from "architecture";
import { t, tCount } from "architecture/lang";
import { ZETTELFLOW_ICON } from "config/brand";
import type { GlanceCard, GlanceSection, GlanceText } from "config/settingsSummary";

/**
 * The settings tab's shell (#660, epic #659): what the tab says before it asks anything.
 *
 * A header with the plugin's identity, four cards that say what is on, a card that offers three
 * ways in while nothing creates notes yet, a bar that jumps between the seven sections, a head for
 * each section, and one footer. Every function here draws into an element it is given and reads
 * nothing else, so the tab decides *where* and this decides *what*.
 *
 * The settings themselves stay declarative rows (F1): this only draws around them.
 */

type LocaleKey = Parameters<typeof t>[0];

export type SectionId = "flows" | "creating" | "knowledge" | "thinking" | "ai" | "automation" | "advanced";

export interface SectionInfo {
    id: SectionId;
    icon: string;
    titleKey: LocaleKey;
    purposeKey: LocaleKey;
}

/** The seven sections, in the order the tab reads (#659): launch, create, know, think, then the rest. */
export const SETTINGS_SECTIONS: readonly SectionInfo[] = [
    { id: "flows", icon: "workflow", titleKey: "settings_section_flows", purposeKey: "settings_section_flows_purpose" },
    { id: "creating", icon: "file-plus-2", titleKey: "settings_section_creating", purposeKey: "settings_section_creating_purpose" },
    { id: "knowledge", icon: "network", titleKey: "settings_section_knowledge", purposeKey: "settings_section_knowledge_purpose" },
    { id: "thinking", icon: "lightbulb", titleKey: "settings_section_thinking", purposeKey: "settings_section_thinking_purpose" },
    { id: "ai", icon: "sparkles", titleKey: "settings_section_ai", purposeKey: "settings_section_ai_purpose" },
    { id: "automation", icon: "zap", titleKey: "settings_section_automation", purposeKey: "settings_section_automation_purpose" },
    { id: "advanced", icon: "settings-2", titleKey: "settings_section_advanced", purposeKey: "settings_section_advanced_purpose" },
];

const GLANCE_SECTION: Record<GlanceSection, SectionId> = {
    flows: "flows",
    thinking: "thinking",
    ai: "ai",
    automation: "automation",
};

export const LINKS = {
    docs: "https://rafaelgb.github.io/Obsidian-ZettelFlow/",
    releases: "https://github.com/RafaelGB/Obsidian-ZettelFlow/releases",
    issues: "https://github.com/RafaelGB/Obsidian-ZettelFlow/issues",
    support: "https://www.buymeacoffee.com/5tsytn22v9Z",
};

/** The class a section's head carries, so the bar and the cards can find it. */
export function sectionClass(id: SectionId): string {
    return c(`settings-section-${id}`);
}

export function glanceText(text: GlanceText): string {
    if ("text" in text) return text.text;
    const args = text.args ?? [];
    return text.count === undefined ? t(text.key as LocaleKey, ...args) : tCount(text.count, text.key as LocaleKey, ...args);
}

/** A link that opens outside Obsidian, drawn as a small chip. */
function link(host: HTMLElement, href: string, label: string, icon: string, iconOnly = false): HTMLElement {
    const a = host.createEl("a", {
        cls: c("settings-chip-link"),
        href,
        attr: { target: "_blank", rel: "noopener", "aria-label": label, title: label },
    });
    setIcon(a.createSpan({ cls: c("settings-chip-icon") }), icon);
    if (!iconOnly) a.createSpan({ text: label });
    return a;
}

/** The plugin's identity: the mark, the name, what it does, and where to read more. */
export function renderHeader(host: HTMLElement, version: string): void {
    host.empty();
    setIcon(host.createDiv({ cls: c("settings-logo") }), ZETTELFLOW_ICON);
    const words = host.createDiv({ cls: c("settings-header-words") });
    words.createDiv({ cls: c("settings-header-name"), text: t("settings_header_name") });
    words.createDiv({ cls: c("settings-header-tagline"), text: t("settings_header_tagline") });
    const links = host.createDiv({ cls: c("settings-header-links") });
    link(links, LINKS.docs, t("settings_header_docs"), "book-open");
    link(links, `${LINKS.releases}/tag/${version}`, t("settings_header_whats_new"), "sparkles");
    link(links, LINKS.support, t("settings_header_support"), "coffee", true);
}

/** Four cards that say what is on; each one takes you to where it is set. */
export function renderGlance(host: HTMLElement, cards: GlanceCard[], go: (section: SectionId) => void): void {
    host.empty();
    for (const card of cards) {
        const button = host.createEl("button", {
            cls: [c("settings-glance-card"), c(`settings-glance-card--${card.tone}`)].join(" "),
            attr: { type: "button", "data-card": card.id },
        });
        const label = button.createDiv({ cls: c("settings-glance-label") });
        label.createSpan({ cls: c("settings-glance-dot") });
        label.createSpan({ text: t(card.labelKey as LocaleKey) });
        button.createDiv({ cls: c("settings-glance-value"), text: glanceText(card.value) });
        button.createDiv({ cls: c("settings-glance-detail"), text: glanceText(card.detail) });
        button.addEventListener("click", () => go(GLANCE_SECTION[card.section]));
    }
}

export interface StartActions {
    browseSystems: () => void;
    chooseCanvas: () => void;
    openCultivate: () => void;
}

/** Three real ways in, shown only while nothing creates notes. Each button does what it says. */
export function renderStart(host: HTMLElement, actions: StartActions): void {
    host.empty();
    host.createDiv({ cls: c("settings-start-title"), text: t("settings_start_title") });
    host.createDiv({ cls: c("settings-start-desc"), text: t("settings_start_desc") });
    const ways = host.createDiv({ cls: c("settings-start-ways") });
    const way = (titleKey: LocaleKey, descKey: LocaleKey, buttonKey: LocaleKey, run: () => void, cta = false) => {
        const card = ways.createDiv({ cls: c("settings-start-way") });
        card.createDiv({ cls: c("settings-start-way-title"), text: t(titleKey) });
        card.createDiv({ cls: c("settings-start-way-desc"), text: t(descKey) });
        const button = card.createEl("button", {
            cls: cta ? "mod-cta" : "",
            text: t(buttonKey),
            attr: { type: "button" },
        });
        button.addEventListener("click", run);
    };
    way("settings_start_system_title", "settings_start_system_desc", "settings_start_system_button", actions.browseSystems, true);
    way("settings_start_canvas_title", "settings_start_canvas_desc", "settings_start_canvas_button", actions.chooseCanvas);
    way("settings_start_think_title", "settings_start_think_desc", "settings_start_think_button", actions.openCultivate);
}

/** The section bar: one button per section. `active` is the section in view. */
export function renderNav(host: HTMLElement, go: (section: SectionId) => void): (active: SectionId) => void {
    host.empty();
    host.setAttribute("role", "navigation");
    host.setAttribute("aria-label", t("settings_nav_label"));
    const buttons = new Map<SectionId, HTMLElement>();
    for (const section of SETTINGS_SECTIONS) {
        const button = host.createEl("button", {
            cls: c("settings-nav-tab"),
            // Named even when only its icon shows (fitNav).
            attr: { type: "button", "data-section": section.id, "aria-label": t(section.titleKey) },
        });
        setIcon(button.createSpan({ cls: c("settings-nav-icon") }), section.icon);
        button.createSpan({ cls: c("settings-nav-label"), text: t(section.titleKey) });
        button.addEventListener("click", () => go(section.id));
        buttons.set(section.id, button);
    }
    const mark = (active: SectionId) => {
        for (const [id, button] of buttons) {
            button.toggleClass("is-active", id === active);
            if (id === active) button.setAttribute("aria-current", "location");
            else button.removeAttribute("aria-current");
        }
    };
    mark("flows");
    return mark;
}

/**
 * Keep the bar on one line. It wrapped onto a second line at ordinary widths, with *Advanced* alone
 * on it; now, when the labels do not fit, the tabs you are not on show only their icon (the one you
 * are on keeps its name). Measured with the labels shown, so it adapts to the language too.
 */
export function fitNav(nav: HTMLElement): void {
    nav.removeClass("is-compact");
    if (nav.scrollWidth > nav.clientWidth + 1) nav.addClass("is-compact");
}

/** The icon beside a section's head; its title and purpose are the row's own name and description. */
export function renderSectionIcon(host: HTMLElement, id: SectionId): void {
    host.empty();
    const section = SETTINGS_SECTIONS.find((s) => s.id === id);
    if (section) setIcon(host, section.icon);
}

/** One line at the end: the version, the docs, where to report a problem, and how to support it. */
export function renderFooter(host: HTMLElement, version: string): void {
    host.empty();
    setIcon(host.createSpan({ cls: c("settings-footer-mark") }), ZETTELFLOW_ICON);
    host.createSpan({ cls: c("settings-footer-version"), text: t("settings_footer_version", version) });
    link(host, LINKS.docs, t("settings_footer_docs"), "book-open");
    link(host, LINKS.issues, t("settings_footer_report"), "bug");
    link(host, LINKS.support, t("settings_footer_support"), "coffee");
}

/**
 * The section in view, for the bar: the last head whose top has passed the bar's bottom edge.
 * Pure over measured offsets, so the rule is tested without a layout engine.
 */
export function sectionInView(heads: { id: SectionId; top: number }[], line: number): SectionId {
    let current: SectionId = "flows";
    for (const head of heads) if (head.top <= line) current = head.id;
    return current;
}

/**
 * Whether the bar is held at the top of the scroller. It sticks under the scroller's top padding,
 * and what scrolls into that band showed above it; held, the bar covers the band (`is-stuck`).
 */
export function barIsStuck(barTop: number, paddingTop: number): boolean {
    return barTop <= paddingTop + 1;
}

/**
 * Scroll the tab's own container so the section's head sits just under the sticky bar. Never
 * `scrollIntoView`: it would scroll the settings modal and the window behind it too.
 */
export function scrollToSection(container: HTMLElement, id: SectionId, barHeight: number, smooth: boolean): void {
    const head = container.querySelector<HTMLElement>(`.${sectionClass(id)}`);
    if (head) scrollToRow(container, head, barHeight, smooth);
}

/** The same, for any row of the tab: it lands just under the sticky bar. */
export function scrollToRow(container: HTMLElement, row: HTMLElement, barHeight: number, smooth: boolean): void {
    const top =
        container.scrollTop + row.getBoundingClientRect().top - container.getBoundingClientRect().top - barHeight - 8;
    container.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
}
