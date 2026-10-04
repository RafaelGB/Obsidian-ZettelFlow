import { Setting, SettingDefinitionItem } from "obsidian";
import type ZettelFlow from "main";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { FileService } from "architecture/plugin";
import { EVENT_LABEL_KEY, isWiredEvent } from "architecture/plugin/events";
import { WorkflowEventEngine } from "architecture/plugin/events/WorkflowEventEngine";
import { FILE_EXTENSIONS } from "architecture/plugin/services/FileService";
import { FileSuggest } from "architecture/settings";
import { rowContainer } from "architecture/components/settings";
import {
    ASSIGNABLE_ROLES,
    FLOW_ROLE_LABEL_KEY,
    flowFolders,
    flowRole,
    type FlowRole,
} from "architecture/plugin/canvas/flowRole";
import { planRoleRemoval } from "config/roles/assignRole";
import { renderFlowRows, type FlowWithRole } from "./flowRows";
export { FLOW_ROLE_ICON, renderFlowRows, type FlowRowActions, type FlowWithRole } from "./flowRows";
import { AssignRoleModal } from "config/modals/AssignRoleModal";
import { CommunityTemplatesModal } from "application/community/CommunityTemplatesModal";
import { ManageInstalledTemplatesModal } from "application/community/ManageInstalledTemplatesModal";

type LocaleKey = Parameters<typeof t>[0];

/** The order the list reads in: how you launch it, from the most deliberate to the most automatic. */
const ROLE_ORDER: FlowRole[] = ["create", "edit", "folder", "event", "hook"];


/**
 * Every canvas that has a role, and nothing else — the vault is not an inventory (#435 FR-5).
 * Exported for the tests; the folder scans are the only impure part.
 */
export function flowsWithRole(plugin: ZettelFlow): FlowWithRole[] {
    const folders = flowFolders(plugin.settings);
    const found = new Map<string, FlowRole>();

    const remember = (path: string | undefined) => {
        if (!path) return;
        const role = flowRole(path, folders);
        if (role !== "none") found.set(path, role);
    };

    remember(folders.ribbonCanvas);
    remember(folders.editorCanvas);
    for (const folder of [folders.foldersFlowsPath, folders.eventFlowsPath, folders.hooksFolderPath]) {
        if (!folder) continue;
        try {
            for (const file of FileService.getTfilesFromFolder(folder, FILE_EXTENSIONS.ONLY_CANVAS)) {
                remember(file.path);
            }
        } catch (error) {
            // A folder that does not exist yet is not an error; it is a folder with no flows.
            log.debug(`[flows] no canvases under ${folder}`, error);
        }
    }

    return [...found]
        .map(([path, role]) => ({ path, role }))
        .sort(
            (a, b) =>
                ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.path.localeCompare(b.path)
        );
}

/**
 * **Flows** (#435, epic #434; drawn as objects since #661): the canvases that have a role, what
 * that role is, and how to change it — then the gallery they usually come from, and the triggers
 * that start them.
 *
 * Three cards rather than one long group, each a declarative group so Obsidian's settings search
 * still finds every row (#659 F1).
 */
export function flowsSettingsGroup(plugin: ZettelFlow, refresh: () => void): SettingDefinitionItem[] {
    let pending = "";

    return [
        {
            type: "group",
            heading: t("settings_flows_heading"),
            items: [
                {
                    name: t("settings_flows_intro"),
                    render: (setting) => {
                        setting.setClass(c("readable-setting-item"));
                    },
                },
                {
                    // The list draws its own rows; the row's own name only exists for the search.
                    name: t("settings_flows_heading"),
                    render: (setting) => {
                        setting.settingEl.addClass(c("settings-object-row"), c("flows-list-item"));
                        // Reused, never stacked: a re-render re-runs this callback (#440 follow-up).
                        const host = rowContainer(setting, "flows-list");
                        renderFlowRows(host, flowsWithRole(plugin), {
                            changeRole: (flow, role) =>
                                new AssignRoleModal(plugin.app, plugin, flow.path, role, refresh).open(),
                            removeRole: (flow) => {
                                const plan = planRoleRemoval(flow.path, flowFolders(plugin.settings));
                                if (!plan?.settings) return;
                                plugin.settings[plan.settings.key] = plan.settings.value;
                                void plugin.saveSettings().then(refresh);
                            },
                            open: (flow) => void FileService.openFile(flow.path),
                        });
                    },
                },
                {
                    name: t("settings_flows_assign"),
                    desc: t("settings_flows_assign_description"),
                    render: (setting) => {
                        setting.setClass(c("readable-setting-item"));
                        setting.settingEl.addClass(c("settings-assign-row"));
                        setting.addSearch((search) => {
                            new FileSuggest(search.inputEl, FileService.PATH_SEPARATOR).setExtensions(
                                FILE_EXTENSIONS.ONLY_CANVAS
                            );
                            search
                                .setPlaceholder(t("canvas_file_selector_placeholder"))
                                .setValue("")
                                .onChange((value) => (pending = value.trim()));
                        });
                        setting.addDropdown((dropdown) => {
                            dropdown.addOption("", t("settings_flows_role_placeholder"));
                            for (const role of ASSIGNABLE_ROLES) {
                                dropdown.addOption(role, t(FLOW_ROLE_LABEL_KEY[role] as LocaleKey));
                            }
                            dropdown.onChange((value) => {
                                if (!value || !pending) return;
                                dropdown.setValue("");
                                new AssignRoleModal(
                                    plugin.app,
                                    plugin,
                                    pending,
                                    value as FlowRole,
                                    refresh
                                ).open();
                            });
                        });
                    },
                },
            ],
        },
        {
            // A flow usually arrives from the gallery, so the gallery lives with the flows (#439).
            type: "group",
            heading: t("settings_card_gallery"),
            items: [
                {
                    name: t("community_templates_browser_title"),
                    desc: t("community_templates_browser_description"),
                    render: (setting) => {
                        setting.addButton((button) =>
                            button
                                .setButtonText(t("settings_gallery_browse"))
                                .setCta()
                                .onClick(() => new CommunityTemplatesModal(plugin).open())
                        );
                    },
                },
                {
                    name: t("manage_installed_templates_title"),
                    desc: t("manage_installed_templates_description"),
                    render: (setting) => {
                        setting.addButton((button) =>
                            button
                                .setButtonText(t("settings_gallery_manage"))
                                .onClick(() => new ManageInstalledTemplatesModal(plugin).open())
                        );
                    },
                },
            ],
        },
        {
            // The triggers that are actually bound. Where event flows live is a folder, and the
            // folders are together now, under Advanced › Folders ZettelFlow uses (#663).
            type: "group",
            heading: t("settings_card_triggers"),
            items: [
                {
                    name: t("settings_events_bindings_heading"),
                    render: (setting) => {
                        setting.setClass(c("readable-setting-item"));
                        const list = rowContainer(setting, "event-bindings-list");
                        void renderBindings(list);
                    },
                },
            ],
        },
    ];
}

/** The configured triggers, one row each, with the controls their kind allows. */
async function renderBindings(list: HTMLElement): Promise<void> {
    list.empty();
    const engine = WorkflowEventEngine.getInstance();
    const bindings = await engine.scanTriggers();
    if (!bindings.length) {
        new Setting(list).setName(t("settings_events_binding_list_empty"));
        return;
    }
    for (const binding of bindings) {
        const flowName = binding.flowPath.split(FileService.PATH_SEPARATOR).pop() ?? binding.flowPath;
        const eventLabel = isWiredEvent(binding.event) ? t(EVENT_LABEL_KEY[binding.event]) : binding.event;
        const row = new Setting(list).setName(`${flowName} · ${eventLabel}`).setDesc(binding.flowPath);
        if (binding.filePath) {
            row.addToggle((toggle) =>
                toggle
                    .setTooltip(t("settings_events_binding_enabled_name"))
                    .setValue(binding.enabled !== false)
                    .onChange((value) => void engine.setTriggerEnabled(binding, value))
            );
            row.addExtraButton((btn) =>
                btn
                    .setIcon("trash")
                    .setTooltip(t("settings_events_binding_remove_tooltip"))
                    .onClick(async () => {
                        await engine.removeTrigger(binding);
                        await renderBindings(list);
                    })
            );
        } else {
            row.addExtraButton((btn) =>
                btn
                    .setIcon("pencil")
                    .setTooltip(t("settings_events_binding_open_tooltip"))
                    .onClick(() => void FileService.openFile(binding.flowPath))
            );
        }
    }
}
