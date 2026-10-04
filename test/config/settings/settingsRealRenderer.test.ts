import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { __captureSettings } from "obsidian";
import { DomNode, installBrowserGlobals } from "../../support/dashboardDom";
import { SettingsRenderer } from "../../support/settingsRenderer";

// What the tab reaches beyond its own rows: modals, the event engine, the live vault. None of it is
// what these tests are about, which is how the rows behave under Obsidian's renderer.
const mounts: { container: unknown; unmounted: boolean }[] = [];
jest.mock("react-dom/client", () => ({
    createRoot: (container: unknown) => {
        const mount = { container, unmounted: false };
        mounts.push(mount);
        return { render: () => undefined, unmount: () => (mount.unmounted = true) };
    },
}));
jest.mock("config/modals/handlers/hooks/components/PropertyHooksManager", () => ({ PropertyHooksManager: () => null }));
jest.mock("config/modals/handlers/hooks/components/HookErrorBoundary", () => ({ HookErrorBoundary: () => null }));
jest.mock("application/community", () => ({ CommunityTemplatesModal: class {} }));
jest.mock("application/community/CommunityTemplatesModal", () => ({ CommunityTemplatesModal: class {} }));
jest.mock("application/community/ManageInstalledTemplatesModal", () => ({ ManageInstalledTemplatesModal: class {} }));
jest.mock("config/modals/AssignRoleModal", () => ({ AssignRoleModal: class {} }));
// Suggesters are chainable (`new FileSuggest(input).setExtensions(...)`): any method returns itself.
jest.mock("architecture/settings", () => {
    const chainable = class {
        constructor() {
            return new Proxy(this, { get: (target, key, proxy) => (key in target ? (target as never)[key] : () => proxy) });
        }
    };
    return { FolderSuggest: chainable, FileSuggest: chainable };
});
jest.mock("architecture/plugin/events/WorkflowEventEngine", () => ({
    WorkflowEventEngine: { getInstance: () => ({ scanTriggers: async () => [] }) },
}));
jest.mock("monkey-around", () => ({ around: () => () => undefined }));
jest.mock("tiny-jsonc", () => ({ parse: JSON.parse }));
jest.mock("architecture/components/core/surface/ModeHostView", () => ({ ModeHostView: class {} }));
jest.mock("architecture/plugin", () => ({
    FileService: { getTfilesFromFolder: () => [], PATH_SEPARATOR: "/", openFile: () => undefined },
    activateSurface: () => undefined,
}));
jest.mock("architecture/plugin/events", () => ({ EVENT_LABEL_KEY: {}, isWiredEvent: () => false }));
jest.mock("architecture/api", () => ({ fnsManager: { invalidateCache: () => undefined }, writeTypeDeclarations: async () => ({}) }));

import { ZettelFlowSettingsTab } from "config/modals/ZettelFlowSettingsTab";
import { DEFAULT_SETTINGS } from "config/typing";

installBrowserGlobals();
(globalThis as { activeWindow?: unknown }).activeWindow = { matchMedia: () => ({ matches: true }) };

function open(settings: Record<string, unknown> = {}) {
    const plugin = {
        settings: { ...structuredClone(DEFAULT_SETTINGS), ...settings } as Record<string, unknown>,
        saveSettings: jest.fn(async () => undefined),
        manifest: { version: "3.4.0" },
        app: { workspace: { getLeavesOfType: () => [] }, vault: { getAllLoadedFiles: () => [] } },
    };
    const tab = new ZettelFlowSettingsTab(plugin as never);
    const container = new DomNode();
    (tab as unknown as { containerEl: DomNode }).containerEl = container;
    const renderer = new SettingsRenderer(container, () => tab.getSettingDefinitions());
    // The tab's own update / refreshDomState go through the renderer, as Obsidian's do.
    Object.assign(tab, { update: () => renderer.update(), refreshDomState: () => renderer.refreshDomState() });
    renderer.display();
    return { tab, plugin, container, renderer };
}

afterEach(() => __captureSettings(null));

describe("the settings tab under Obsidian's real renderer (#659 runtime audit)", () => {
    it("keeps the section bar after the pass that removes everything that is not a group", () => {
        const { container, renderer } = open();
        const bar = () => container.byClass("settings-nav");
        expect(bar()).toHaveLength(1);
        // It lives inside its own row, which lives inside a group the pass keeps.
        expect(bar()[0].getAttribute("role")).toBe("navigation");
        renderer.update();
        expect(bar()).toHaveLength(1);
        expect(bar()[0].isConnected).toBe(true);
    });

    it("keeps the property hooks mounted through an update", () => {
        jest.useFakeTimers();
        try {
            mounts.length = 0;
            const { renderer } = open();
            expect(mounts).toHaveLength(1);
            renderer.update();
            jest.advanceTimersByTime(10);
            // The old cleanup scheduled an unmount; the re-render cancelled it and kept the root.
            expect(mounts).toHaveLength(1);
            expect(mounts[0].unmounted).toBe(false);
            renderer.close();
            jest.advanceTimersByTime(10);
            expect(mounts[0].unmounted).toBe(true);
        } finally {
            jest.useRealTimers();
        }
    });

    it("updates the AI card as soon as AI is switched on, without reopening the tab", async () => {
        const { container, renderer } = open();
        const aiCard = () => container.byClass("settings-glance-card").find((card) => card.getAttribute("data-card") === "ai")!;
        expect(aiCard().textContent).toContain("Off");
        renderer.setting("Enable AI actions").toggles[0].flip(true);
        expect(aiCard().textContent).not.toContain("Off");
        expect(aiCard().hasClass("zettelkasten-flow__settings-glance-card--on")).toBe(true);
        // The provider rows are shown in place — refreshDomState, no re-render.
        expect(renderer.row("Model").hasClass("is-hidden")).toBe(false);
    });

    it("updates the thinking card when a move is switched off", () => {
        const { container, renderer } = open();
        const card = () => container.byClass("settings-glance-card").find((c) => c.getAttribute("data-card") === "thinking")!;
        expect(card().textContent).toContain("5 of 5");
        renderer.setting("Challenge").toggles[0].flip(false);
        expect(card().textContent).toContain("4 of 5");
    });

    it("moves the Advanced switch when Advanced is opened from the section bar", () => {
        const { container, plugin, renderer } = open();
        const advancedSwitch = renderer.setting("Advanced").toggles[0];
        expect(advancedSwitch.value).toBe(false);
        const tab = container.byClass("settings-nav-tab").find((b) => b.getAttribute("data-section") === "advanced")!;
        tab.click();
        expect(advancedSwitch.value).toBe(true);
        expect(plugin.settings.showAdvancedSettings).toBe(true);
        expect(renderer.row("Scripts").hasClass("is-hidden")).toBe(false);
        // One click on the switch now folds it again — it is not out of step.
        advancedSwitch.flip(false);
        expect(plugin.settings.showAdvancedSettings).toBe(false);
    });
});
