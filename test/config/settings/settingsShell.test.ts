import { describe, it, expect, jest } from "@jest/globals";
import { DomNode } from "../../support/dashboardDom";
import {
    SETTINGS_SECTIONS,
    renderFooter,
    renderGlance,
    renderHeader,
    renderNav,
    renderStart,
    scrollToSection,
    scrollToRow,
    sectionClass,
    sectionInView,
    barIsStuck,
    fitNav,
} from "config/modals/settingsShell";
import { settingsGlance } from "config/settingsSummary";

const host = () => new DomNode() as unknown as HTMLElement & DomNode;

describe("the settings shell (#660)", () => {
    it("opens with the plugin's identity and where to read more", () => {
        const el = host();
        renderHeader(el, "3.4.0");
        expect(el.byClass("settings-header-name")[0].textContent).toBe("ZettelFlow");
        expect(el.byClass("settings-logo")[0].getAttribute("data-icon")).toBe("zettelflow-ribbon-icon");
        const hrefs = el.querySelectorAll("a").map((a) => a.href);
        expect(hrefs).toEqual([
            "https://rafaelgb.github.io/Obsidian-ZettelFlow/",
            "https://github.com/RafaelGB/Obsidian-ZettelFlow/releases/tag/3.4.0",
            "https://www.buymeacoffee.com/5tsytn22v9Z",
        ]);
        // The coffee is an icon, but it still has a name for a screen reader.
        expect(el.querySelectorAll("a")[2].getAttribute("aria-label")).toBe("Support the project");
    });

    it("draws the four glance cards as words, never undefined, each opening its section", () => {
        const el = host();
        const go = jest.fn();
        renderGlance(el, settingsGlance({}), go);
        const cards = el.byClass("settings-glance-card");
        expect(cards).toHaveLength(4);
        expect(el.textContent).not.toMatch(/undefined/);
        expect(cards[0].hasClass("zettelkasten-flow__settings-glance-card--warn")).toBe(true);
        cards.forEach((card) => card.click());
        expect(go.mock.calls.map(([section]) => section)).toEqual(["flows", "thinking", "ai", "automation"]);
    });

    it("offers three ways in, and each button does what it says", () => {
        const el = host();
        const actions = { browseSystems: jest.fn(), chooseCanvas: jest.fn(), openCultivate: jest.fn() };
        renderStart(el, actions);
        const buttons = el.querySelectorAll("button");
        expect(buttons.map((b) => b.textContent)).toEqual(["Browse systems", "Choose a canvas", "Open Cultivate"]);
        expect(buttons[0].hasClass("mod-cta")).toBe(true);
        buttons.forEach((b) => b.click());
        expect(actions.browseSystems).toHaveBeenCalledTimes(1);
        expect(actions.chooseCanvas).toHaveBeenCalledTimes(1);
        expect(actions.openCultivate).toHaveBeenCalledTimes(1);
    });

    it("lists the seven sections in the bar, and marks the one in view", () => {
        const el = host();
        const go = jest.fn();
        const mark = renderNav(el, go);
        const tabs = el.byClass("settings-nav-tab");
        expect(tabs.map((tab) => tab.getAttribute("data-section"))).toEqual(SETTINGS_SECTIONS.map((s) => s.id));
        expect(tabs.map((tab) => tab.textContent)).toEqual([
            "Flows",
            "Creating notes",
            "Your knowledge",
            "Thinking",
            "AI",
            "Automation",
            "Advanced",
        ]);
        expect(tabs[0].hasClass("is-active")).toBe(true);
        mark("thinking");
        expect(tabs.filter((tab) => tab.hasClass("is-active")).map((tab) => tab.getAttribute("data-section"))).toEqual([
            "thinking",
        ]);
        tabs[4].click();
        expect(go).toHaveBeenCalledWith("ai");
    });

    it("knows which section is in view from where the heads are", () => {
        const heads = [
            { id: "flows" as const, top: 0 },
            { id: "creating" as const, top: 400 },
            { id: "knowledge" as const, top: 800 },
        ];
        expect(sectionInView(heads, 100)).toBe("flows");
        expect(sectionInView(heads, 450)).toBe("creating");
        expect(sectionInView(heads, 5000)).toBe("knowledge");
    });

    it("knows when the bar is held at the top, so it can cover the scroller's padding above it", () => {
        // The bar sticks under the scroller's top padding; content scrolled into that band showed
        // above the bar. Held there, it covers the band; at rest it covers nothing above it.
        expect(barIsStuck(300, 48)).toBe(false);
        expect(barIsStuck(48, 48)).toBe(true);
        expect(barIsStuck(48.4, 48)).toBe(true);
    });

    it("scrolls its own container, never the window, to land a section under the bar", () => {
        const container = host();
        const head = container.createDiv({ cls: sectionClass("ai") });
        head.getBoundingClientRect = () => ({ left: 0, top: 900, width: 100, height: 40 });
        container.getBoundingClientRect = () => ({ left: 0, top: 100, width: 600, height: 700 });
        container.scrollTop = 50;
        scrollToSection(container, "ai", 48, false);
        expect(container.scrolls).toEqual([{ top: 50 + 900 - 100 - 48 - 8, behavior: "auto" }]);
        expect(head.scrolls).toEqual([]);
    });

    it("keeps the bar on one line: when the labels do not fit, the tabs you are not on show their icon", () => {
        // It wrapped onto a second line with *Advanced* alone on it.
        const nav = host();
        renderNav(nav, () => undefined);
        const tabs = nav.byClass("settings-nav-tab");
        expect(tabs.every((tab) => tab.getAttribute("aria-label"))).toBe(true); // an icon alone still says its name
        Object.assign(nav, { scrollWidth: 930, clientWidth: 900 });
        fitNav(nav);
        expect(nav.hasClass("is-compact")).toBe(true);
        Object.assign(nav, { scrollWidth: 880, clientWidth: 900 });
        fitNav(nav);
        expect(nav.hasClass("is-compact")).toBe(false);
    });

    it("lands a row itself under the bar, not just its section's head", () => {
        // The Advanced grid's way to the thinking space folder landed on Thinking's head, with the
        // field far below it: you arrived and did not see what you came for.
        const container = host();
        const row = container.createDiv({ cls: "setting-item" });
        row.getBoundingClientRect = () => ({ left: 0, top: 1500, width: 100, height: 40 });
        container.getBoundingClientRect = () => ({ left: 0, top: 100, width: 600, height: 700 });
        container.scrollTop = 0;
        scrollToRow(container, row as never, 48, false);
        expect(container.scrolls).toEqual([{ top: 1500 - 100 - 48 - 8, behavior: "auto" }]);
    });

    it("ends on one line: version, docs, report a problem, support", () => {
        const el = host();
        renderFooter(el, "3.4.0");
        expect(el.textContent).toContain("ZettelFlow 3.4.0");
        expect(el.querySelectorAll("a").map((a) => a.href)).toEqual([
            "https://rafaelgb.github.io/Obsidian-ZettelFlow/",
            "https://github.com/RafaelGB/Obsidian-ZettelFlow/issues",
            "https://www.buymeacoffee.com/5tsytn22v9Z",
        ]);
    });
});
