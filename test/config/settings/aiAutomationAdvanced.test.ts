import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { Setting, __captureSettings } from "obsidian";
import { DomNode } from "../../support/dashboardDom";

// The folder suggest and the script API reach the live app; a row drawn under jest only needs them to exist.
jest.mock("architecture/settings", () => ({ FolderSuggest: class { constructor(_input: unknown) {} } }));
jest.mock("architecture/api", () => ({
    fnsManager: { invalidateCache: jest.fn() },
    writeTypeDeclarations: jest.fn(async () => ({ status: "written", path: "x" })),
}));

import { aiSettingsGroup } from "config/modals/handlers/aiSettingsGroup";
import { foldersSettingsGroup, scriptsLoggingGroup } from "config/modals/handlers/advancedSettingsGroups";
import { DEFAULT_SETTINGS } from "config/typing";

type Item = {
    name?: string;
    visible?: boolean | (() => boolean);
    render?: (setting: Setting) => void;
    control?: { options: Record<string, string> };
};
type Fake = {
    value: string | boolean;
    placeholder?: string;
    text?: string;
    type?: (v: string) => void;
    flip?: (on?: boolean) => void;
    click?: () => void;
    inputEl?: { type: string };
};
type Drawn = Setting & {
    settingEl: DomNode;
    toggles: Fake[];
    texts: Fake[];
    searches: Fake[];
    buttons: Fake[];
    extraButtons: Fake[];
};

const ROOT = join(__dirname, "..", "..", "..");
const TAB = readFileSync(join(ROOT, "src", "config", "modals", "ZettelFlowSettingsTab.tsx"), "utf8");

function plugin(settings: Record<string, unknown> = {}) {
    const base = structuredClone(DEFAULT_SETTINGS) as Record<string, unknown>;
    return {
        settings: { ...base, ...settings } as Record<string, any>,
        saveSettings: jest.fn(async () => undefined),
        app: { workspace: { getLeavesOfType: () => [] } },
    };
}

const itemsOf = (group: unknown) => (group as { items: Item[] }).items;
const shown = (item: Item) => (typeof item.visible === "function" ? item.visible() : item.visible !== false);

function draw(item: Item): Drawn {
    __captureSettings(() => undefined);
    const setting = new Setting(new DomNode()) as Drawn;
    item.render!(setting);
    return setting;
}

const byName = (items: Item[], name: string) => {
    const item = items.find((candidate) => candidate.name === name);
    if (!item) throw new Error(`no row named ${name}`);
    return item;
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

afterEach(() => __captureSettings(null));

describe("AI: one switch, the provider only when it is on (#663)", () => {
    const PROVIDER = ["Endpoint URL", "Model", "API key", "Limits"];

    it("hides the provider while AI is off, and keeps the privacy promise in sight", () => {
        const p = plugin();
        const items = itemsOf(aiSettingsGroup(p as never, jest.fn()));
        for (const name of PROVIDER) expect({ name, shown: shown(byName(items, name)) }).toEqual({ name, shown: false });
        expect(shown(byName(items, "What leaves your vault"))).toBe(true);
        expect(shown(byName(items, "Enable AI actions"))).toBe(true);
    });

    it("shows the provider once the switch is on, re-evaluating in place", async () => {
        const p = plugin();
        const refresh = jest.fn();
        const items = itemsOf(aiSettingsGroup(p as never, refresh));
        draw(byName(items, "Enable AI actions")).toggles[0].flip!(true);
        await flush();
        expect(p.settings.ai.enabled).toBe(true);
        expect(p.saveSettings).toHaveBeenCalled();
        expect(refresh).toHaveBeenCalledTimes(1);
        for (const name of PROVIDER) expect({ name, shown: shown(byName(items, name)) }).toEqual({ name, shown: true });
    });

    it("keeps the two limits in one row, each saved on its own, an empty one meaning the default", async () => {
        const p = plugin({ ai: { ...DEFAULT_SETTINGS.ai, enabled: true } });
        const row = draw(byName(itemsOf(aiSettingsGroup(p as never, jest.fn())), "Limits"));
        expect(row.texts).toHaveLength(2);
        expect(row.texts.map((text) => text.inputEl!.type)).toEqual(["number", "number"]);
        row.texts[0].type!("5000");
        await flush();
        expect(p.settings.ai.maxInputChars).toBe(5000);
        row.texts[1].type!("");
        await flush();
        expect(p.settings.ai.maxOutputTokens).toBeUndefined();
    });

    it("still finds the old limit names in the settings search", () => {
        const limits = byName(itemsOf(aiSettingsGroup(plugin() as never, jest.fn())), "Limits") as Item & {
            aliases?: string[];
        };
        expect(limits.aliases).toEqual(["Max input characters", "Max output tokens"]);
    });
});

describe("Advanced: every folder in one grid (#663)", () => {
    const folders = (p: ReturnType<typeof plugin>, go = jest.fn()) =>
        itemsOf(foldersSettingsGroup(p as never, () => true, go));

    it("lists the flow homes, scripts, templates and the thinking space, in that order", () => {
        expect(folders(plugin()).map((item) => item.name)).toEqual([
            "Folder flows",
            "Event flows",
            "Hook flows",
            "Scripts",
            "Markdown templates",
            "Thinking space",
        ]);
    });

    it("folds with Advanced", () => {
        const fold = jest.fn(() => false);
        expect((foldersSettingsGroup(plugin() as never, fold, jest.fn()) as { visible: unknown }).visible).toBe(fold);
        expect((scriptsLoggingGroup(fold) as { visible: unknown }).visible).toBe(fold);
    });

    it("puts the default back, in the setting and in the field", async () => {
        const p = plugin({ eventFlowsPath: "Somewhere/else" });
        const row = draw(byName(folders(p), "Event flows"));
        expect(row.searches[0].value).toBe("Somewhere/else");
        row.extraButtons[0].click!();
        await flush();
        expect(p.settings.eventFlowsPath).toBe(DEFAULT_SETTINGS.eventFlowsPath);
        expect(row.searches[0].value).toBe(DEFAULT_SETTINGS.eventFlowsPath);
        expect(p.saveSettings).toHaveBeenCalled();
    });

    it("still refuses an events folder inside the folder flows, keeping the old one (#435)", async () => {
        const p = plugin({ foldersFlowsPath: "_ZettelFlow/folders", eventFlowsPath: "_ZettelFlow/events" });
        const row = draw(byName(folders(p), "Event flows"));
        row.searches[0].type!("_ZettelFlow/folders/events");
        await flush();
        expect(p.settings.eventFlowsPath).toBe("_ZettelFlow/events");
        expect(row.searches[0].value).toBe("_ZettelFlow/events");
        expect(p.saveSettings).not.toHaveBeenCalled();
    });

    it("refuses the same collision from the other side, for the folder flows", async () => {
        const p = plugin({ foldersFlowsPath: "_ZettelFlow/folders", eventFlowsPath: "_ZettelFlow/events" });
        const row = draw(byName(folders(p), "Folder flows"));
        row.searches[0].type!("_ZettelFlow/events");
        await flush();
        expect(p.settings.foldersFlowsPath).toBe("_ZettelFlow/folders");
        expect(p.saveSettings).not.toHaveBeenCalled();
    });

    it("shows the thinking space without a second editor, and takes you to the one under Thinking", () => {
        const go = jest.fn();
        const row = draw(byName(folders(plugin({ thoughtLabPath: "Lab" }), go), "Thinking space"));
        expect(row.searches).toHaveLength(0);
        expect(row.buttons[0].text).toBe("Lab");
        row.buttons[0].click!();
        expect(go).toHaveBeenCalledTimes(1);
    });

    it("names the log levels the way a person would", () => {
        const logging = byName(itemsOf(scriptsLoggingGroup(() => true)), "Logging");
        expect(Object.values(logging.control!.options)).toEqual([
            "Off",
            "Errors only",
            "Warnings",
            "Information",
            "Debugging",
            "Everything",
        ]);
    });
});

describe("Automation: what a hook is for, and where the examples are (#663)", () => {
    it("links the worked examples from the hooks card", () => {
        expect(TAB).toContain('descContainer(setting, "property-hooks-examples")');
        expect(TAB).toContain("vault-hooks/property-hooks/examples/");
    });
});
