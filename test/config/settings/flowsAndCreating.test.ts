import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { Setting, __captureSettings } from "obsidian";
import { DomNode } from "../../support/dashboardDom";
import { FLOW_ROLE_ICON, renderFlowRows, type FlowWithRole } from "config/modals/handlers/flowRows";
import { creatingSettingsGroup, prefixPreviewText } from "config/modals/handlers/creatingSettingsGroup";

const host = () => new DomNode() as unknown as HTMLElement & DomNode;

type Item = { name?: string; render?: (setting: Setting) => void };

function plugin(settings: Record<string, unknown> = {}) {
    return { settings: { uniquePrefix: "", ...settings }, saveSettings: jest.fn(async () => undefined) };
}

/** Draw one row of a declarative group into a fake `Setting`, the way Obsidian would. */
function drawRow(items: Item[], name: string): Setting & { settingEl: DomNode; descEl: DomNode; controlEl: DomNode } {
    __captureSettings(() => undefined);
    const item = items.find((candidate) => candidate.name === name);
    if (!item?.render) throw new Error(`no rendered row named ${name}`);
    const setting = new Setting(new DomNode()) as Setting & { settingEl: DomNode; descEl: DomNode; controlEl: DomNode };
    item.render(setting);
    return setting;
}

afterEach(() => __captureSettings(null));

describe("flows drawn as objects (#661)", () => {
    const flows: FlowWithRole[] = [
        { path: "Flows/Zettelkasten.canvas", role: "create" },
        { path: "_ZettelFlow/folders/Projects.canvas", role: "folder" },
    ];

    it("gives each flow its role as a coloured tile with the role's icon, its name and its path", () => {
        const el = host();
        renderFlowRows(el, flows, { changeRole: jest.fn(), removeRole: jest.fn(), open: jest.fn() });
        const rows = el.byClass("settings-flow");
        expect(rows).toHaveLength(2);
        expect(rows[0].hasClass("zettelkasten-flow__settings-flow--create")).toBe(true);
        expect(rows[1].hasClass("zettelkasten-flow__settings-flow--folder")).toBe(true);
        expect(rows.map((row) => row.byClass("settings-flow-tile")[0].getAttribute("data-icon"))).toEqual([
            FLOW_ROLE_ICON.create,
            FLOW_ROLE_ICON.folder,
        ]);
        expect(rows[0].byClass("settings-flow-name")[0].textContent).toBe("Zettelkasten");
        expect(rows[0].byClass("settings-flow-path")[0].textContent).toBe("Flows/Zettelkasten.canvas");
    });

    it("offers to drop a role only where the role is exclusive, and opens any flow", () => {
        const el = host();
        const actions = { changeRole: jest.fn(), removeRole: jest.fn(), open: jest.fn() };
        renderFlowRows(el, flows, actions);
        const [create, folder] = el.byClass("settings-flow");
        expect(create.byClass("settings-flow-remove")).toHaveLength(1);
        expect(folder.byClass("settings-flow-remove")).toHaveLength(0);
        create.byClass("settings-flow-remove")[0].click();
        folder.byClass("settings-flow-open")[0].click();
        expect(actions.removeRole).toHaveBeenCalledWith(flows[0]);
        expect(actions.open).toHaveBeenCalledWith(flows[1]);
    });

    it("asks before changing a role, and keeps showing the current one meanwhile", () => {
        const el = host();
        const actions = { changeRole: jest.fn(), removeRole: jest.fn(), open: jest.fn() };
        renderFlowRows(el, flows, actions);
        const select = el.byClass("settings-flow-role")[0];
        expect(select.querySelectorAll("option").length).toBeGreaterThan(1);
        select.value = "edit";
        select.fire("change");
        expect(actions.changeRole).toHaveBeenCalledWith(flows[0], "edit");
        expect(select.value).toBe("create");
    });

    it("lists the crystallize flow with its own tile and label, offers the role, and lets it go (#712)", () => {
        const el = host();
        const think: FlowWithRole = { path: "Flows/Think.canvas", role: "crystallize" };
        const actions = { changeRole: jest.fn(), removeRole: jest.fn(), open: jest.fn() };
        renderFlowRows(el, [think], actions);
        const [row] = el.byClass("settings-flow");
        expect(row.hasClass("zettelkasten-flow__settings-flow--crystallize")).toBe(true);
        expect(row.byClass("settings-flow-tile")[0].getAttribute("data-icon")).toBe(FLOW_ROLE_ICON.crystallize);
        const select = row.byClass("settings-flow-role")[0];
        const labels = select.querySelectorAll("option").map((option) => option.textContent);
        expect(labels).toContain("Crystallizes thoughts");
        expect(select.value).toBe("crystallize");
        row.byClass("settings-flow-remove")[0].click();
        expect(actions.removeRole).toHaveBeenCalledWith(think);
    });

    it("says so when nothing has a role", () => {
        const el = host();
        renderFlowRows(el, [], { changeRole: jest.fn(), removeRole: jest.fn(), open: jest.fn() });
        expect(el.byClass("flows-empty")[0].textContent).toContain("No canvas has a role yet");
    });
});

describe("creating notes (#661)", () => {
    it("says what the prefix produces, and what no prefix means", () => {
        expect(prefixPreviewText("YYYY", () => "2026")).toBe("Today it reads 2026");
        expect(prefixPreviewText("  ", () => "never")).toBe("No prefix: a new note keeps the name you give it.");
    });

    it("redraws the preview as you type, and saves the pattern", () => {
        const p = plugin({ uniquePrefix: "" });
        const items = (creatingSettingsGroup(p as never) as { items: Item[] }).items;
        const row = drawRow(items, "Note ID prefix");
        const preview = row.descEl.byClass("settings-prefix-preview")[0];
        expect(preview.textContent).toContain("No prefix");
        (row as unknown as { texts: { type: (v: string) => void }[] }).texts[0].type("YYYY");
        expect(row.descEl.byClass("settings-prefix-preview")[0].textContent).toMatch(/^Today it reads ./);
        expect(p.settings.uniquePrefix).toBe("YYYY");
        expect(p.saveSettings).toHaveBeenCalled();
    });

    it("draws the density as a two-way choice that persists and shows which side is on", () => {
        const p = plugin({ wizardDensity: "comfortable" });
        const items = (creatingSettingsGroup(p as never) as { items: Item[] }).items;
        const row = drawRow(items, "Wizard density");
        const options = row.controlEl.byClass("settings-segment-option");
        expect(options.map((o) => o.textContent)).toEqual(["Comfortable", "Compact"]);
        expect(options.map((o) => o.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
        options[1].click();
        expect(p.settings.wizardDensity).toBe("compact");
        expect(options.map((o) => o.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
        expect(options[1].hasClass("is-active")).toBe(true);
        expect(p.saveSettings).toHaveBeenCalled();
    });

    it("draws each row again without stacking a second container", () => {
        const p = plugin({ uniquePrefix: "YYYY" });
        const items = (creatingSettingsGroup(p as never) as { items: Item[] }).items;
        __captureSettings(() => undefined);
        const setting = new Setting(new DomNode()) as Setting & { descEl: DomNode; controlEl: DomNode };
        const prefix = items.find((i) => i.name === "Note ID prefix")!;
        prefix.render!(setting);
        prefix.render!(setting);
        expect(setting.descEl.byClass("settings-prefix-preview")).toHaveLength(1);
    });
});

describe("the sections stay in the settings search (#659 F1)", () => {
    const flowsSource = readFileSync(
        join(__dirname, "../../../src/config/modals/handlers/flowsSettingsGroup.ts"),
        "utf8"
    );

    it("draws flows as three declarative cards: your flows, the gallery, the triggers", () => {
        for (const heading of ["settings_flows_heading", "settings_card_gallery", "settings_card_triggers"]) {
            expect(flowsSource).toContain(`heading: t("${heading}")`);
        }
    });
});
