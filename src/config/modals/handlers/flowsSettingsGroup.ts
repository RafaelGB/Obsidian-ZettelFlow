import { Notice, Setting, SettingDefinitionItem } from "obsidian";
import ZettelFlow from "main";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { FileService } from "architecture/plugin";
import { EVENT_LABEL_KEY, isWiredEvent } from "architecture/plugin/events";
import { FILE_EXTENSIONS } from "architecture/plugin/services/FileService";
import { FileSuggest, FolderSuggest } from "architecture/settings";
import {
    ASSIGNABLE_ROLES,
    FLOW_ROLE_LABEL_KEY,
    flowFolders,
    flowRole,
    isExclusive,
    isUnderFolder,
    validateFlowFolders,
    type FlowRole,
} from "architecture/plugin/canvas/flowRole";
import { WorkflowEventEngine } from "architecture/plugin/events/WorkflowEventEngine";
import { planRoleRemoval } from "config/roles/assignRole";
import { AssignRoleModal } from "config/modals/AssignRoleModal";
import { CommunityTemplatesModal } from "application/community/CommunityTemplatesModal";
import { ManageInstalledTemplatesModal } from "application/community/ManageInstalledTemplatesModal";

type LocaleKey = Parameters<typeof t>[0];

/** The order the list reads in: how you launch it, from the most deliberate to the most automatic. */
const ROLE_ORDER: FlowRole[] = ["create", "edit", "folder", "event", "hook"];

export interface FlowWithRole {
    path: string;
    role: FlowRole;
}

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
 * **Your flows** (#435, epic #434): the canvases that have a role, what that role is, and how to
 * change it.
 *
 * Until now a role was two text fields buried among sixty settings and two folder conventions
 * nobody states. Naming it is what lets the gallery install *into* one (#437) and the editor offer
 * a trigger only where it can fire (#436).
 */
export function flowsSettingsGroup(plugin: ZettelFlow, refresh: () => void): SettingDefinitionItem {
    let pending = "";

    return {
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
                name: t("settings_flows_heading"),
                render: (setting) => {
                    setting.settingEl.addClass(c("flows-list-item"));
                    const host = setting.settingEl.createDiv({ cls: c("flows-list") });
                    renderFlows(plugin, host, refresh);
                },
            },
            {
                name: t("settings_flows_assign"),
                desc: t("settings_flows_assign_description"),
                render: (setting) => {
                    setting.setClass(c("readable-setting-item"));
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
            {
                // The triggers that are actually bound, listed where the flows are (#439): they
                // are a fact about your flows, not a section of their own.
            name: t("settings_events_bindings_heading"),
            render: (setting) => {
                setting.setClass(c("readable-setting-item"));
                const list = setting.settingEl.createDiv({
                    cls: c("event-bindings-list"),
                });
                const renderList = async () => {
                    list.empty();
                    const engine = WorkflowEventEngine.getInstance();
                    const bindings = await engine.scanTriggers();
                    if (!bindings.length) {
                        new Setting(list).setName(
                            t("settings_events_binding_list_empty")
                        );
                        return;
                    }
                    for (const binding of bindings) {
                        const flowName =
                            binding.flowPath.split(FileService.PATH_SEPARATOR).pop() ??
                            binding.flowPath;
                        const eventLabel = isWiredEvent(binding.event)
                            ? t(EVENT_LABEL_KEY[binding.event])
                            : binding.event;
                        const row = new Setting(list)
                            .setName(`${flowName} · ${eventLabel}`)
                            .setDesc(binding.flowPath);
                        if (binding.filePath) {
                            row.addToggle((toggle) =>
                                toggle
                                    .setTooltip(t("settings_events_binding_enabled_name"))
                                    .setValue(binding.enabled !== false)
                                    .onChange((value) =>
                                        void engine.setTriggerEnabled(binding, value)
                                    )
                            );
                            row.addExtraButton((btn) =>
                                btn
                                    .setIcon("trash")
                                    .setTooltip(
                                        t("settings_events_binding_remove_tooltip")
                                    )
                                    .onClick(async () => {
                                        await engine.removeTrigger(binding);
                                        await renderList();
                                    })
                            );
                        } else {
                            row.addExtraButton((btn) =>
                                btn
                                    .setIcon("pencil")
                                    .setTooltip(
                                        t("settings_events_binding_open_tooltip")
                                    )
                                    .onClick(() =>
                                        void FileService.openFile(binding.flowPath)
                                    )
                            );
                        }
                    }
                };
                void renderList();
            },
        },
            {
                // A flow usually arrives from the gallery, so the gallery lives with the flows
                // rather than among sixty unrelated settings (#439).
                name: t("community_templates_browser_title"),
                desc: t("community_templates_browser_description"),
                action: () => new CommunityTemplatesModal(plugin).open(),
            },
            {
                name: t("manage_installed_templates_title"),
                desc: t("manage_installed_templates_description"),
                action: () => new ManageInstalledTemplatesModal(plugin).open(),
            },
            {
                name: t("settings_event_flows_title"),
                desc: t("settings_event_flows_description"),
                render: (setting) => {
                    setting.setClass(c("readable-setting-item"));
                    setting.addSearch((search) => {
                        new FolderSuggest(search.inputEl);
                        search
                            .setPlaceholder(t("folders_flows_selector_placeholder"))
                            .setValue(plugin.settings.eventFlowsPath)
                            .onChange(async (value) => {
                                const folders = { ...flowFolders(plugin.settings), eventFlowsPath: value };
                                const conflict = validateFlowFolders(folders);
                                if (conflict) {
                                    // The value is refused, and the old one stays: two homes that
                                    // overlap would make a canvas two things at once.
                                    new Notice(t("settings_flow_folders_conflict", conflict.against));
                                    search.setValue(plugin.settings.eventFlowsPath);
                                    return;
                                }
                                plugin.settings.eventFlowsPath = value;
                                await plugin.saveSettings();
                            });
                    });
                },
            },
        ],
    };
}

/** One row per flow: what it is called, what it is for, and the two ways to change that. */
function renderFlows(plugin: ZettelFlow, host: HTMLElement, refresh: () => void): void {
    host.empty();
    const flows = flowsWithRole(plugin);
    if (flows.length === 0) {
        host.createDiv({ cls: c("flows-empty"), text: t("settings_flows_empty") });
        return;
    }

    const rows = new Map<string, Setting>();
    for (const flow of flows) {
        const name = (flow.path.split("/").pop() ?? flow.path).replace(/\.canvas$/, "");
        const row = new Setting(host).setName(name).setDesc(flow.path);
        row.nameEl.createSpan({
            cls: c("flows-role"),
            text: t(FLOW_ROLE_LABEL_KEY[flow.role] as LocaleKey),
        });

        row.addDropdown((dropdown) => {
            dropdown.addOption(flow.role, t(FLOW_ROLE_LABEL_KEY[flow.role] as LocaleKey));
            for (const role of ASSIGNABLE_ROLES) {
                if (role === flow.role) continue;
                dropdown.addOption(role, t(FLOW_ROLE_LABEL_KEY[role] as LocaleKey));
            }
            dropdown.setValue(flow.role).onChange((value) => {
                dropdown.setValue(flow.role);
                new AssignRoleModal(plugin.app, plugin, flow.path, value as FlowRole, refresh).open();
            });
        });

        if (isExclusive(flow.role)) {
            row.addExtraButton((button) =>
                button
                    .setIcon("x")
                    .setTooltip(t("flow_role_none"))
                    .onClick(() => {
                        const plan = planRoleRemoval(flow.path, flowFolders(plugin.settings));
                        if (!plan?.settings) return;
                        plugin.settings[plan.settings.key] = plan.settings.value;
                        void plugin.saveSettings().then(refresh);
                    })
            );
        }

        row.addExtraButton((button) =>
            button
                .setIcon("external-link")
                .setTooltip(t("settings_flows_open"))
                .onClick(() => void FileService.openFile(flow.path))
        );
        rows.set(flow.path, row);
    }

    void markLegacyEventFlows(plugin, rows, refresh);
}

/**
 * A flow that still reacts to events from the **folder-flows** folder (#436). It keeps working —
 * nothing that fires today stops firing — and it is offered the move that makes it an event flow
 * like any other.
 */
async function markLegacyEventFlows(
    plugin: ZettelFlow,
    rows: Map<string, Setting>,
    refresh: () => void
): Promise<void> {
    let bindings;
    try {
        bindings = await WorkflowEventEngine.getInstance().scanTriggers();
    } catch (error) {
        log.debug("[flows] could not read the triggers", error);
        return;
    }
    const folders = flowFolders(plugin.settings);
    for (const binding of bindings) {
        if (isUnderFolder(folders.eventFlowsPath, binding.flowPath)) continue;
        const row = rows.get(binding.flowPath);
        if (!row) continue;
        row.nameEl.createSpan({ cls: c("flows-legacy"), text: t("settings_flows_legacy") });
        row.addButton((button) =>
            button
                .setButtonText(t("settings_flows_move_to_events"))
                .onClick(() =>
                    new AssignRoleModal(plugin.app, plugin, binding.flowPath, "event", refresh).open()
                )
        );
    }
}
