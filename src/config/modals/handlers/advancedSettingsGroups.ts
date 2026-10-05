import { Notice, type SearchComponent, type Setting, type SettingDefinitionItem, type SettingGroupItem } from "obsidian";
import type ZettelFlow from "main";
import { c } from "architecture";
import { t } from "architecture/lang";
import { FolderSuggest } from "architecture/settings";
import { fnsManager, writeTypeDeclarations } from "architecture/api";
import { flowFolders, validateFlowFolders } from "architecture/plugin/canvas/flowRole";
import { DEFAULT_SETTINGS } from "config/typing";
import type { ZettelFlowSettings } from "config/typing";
import { speedSettingsItems } from "./speedSettingsItems";

type LocaleKey = Parameters<typeof t>[0];

/** One folder ZettelFlow uses: where it lives in the settings, and what it falls back to. */
interface FolderCell {
    nameKey: LocaleKey;
    descKey: LocaleKey;
    read: (settings: ZettelFlowSettings) => string;
    write: (settings: ZettelFlowSettings, value: string) => void;
    fallback: string;
    /** One of the three flow homes: a canvas there must not also be in another (#435). */
    flowHome?: "foldersFlowsPath" | "eventFlowsPath" | "hooksFolderPath";
    /** After a change: what else has to hear about it. */
    after?: () => void;
}

/** The cells, in the order the grid reads: the three flow homes, then scripts and templates. */
export const FOLDER_CELLS: readonly FolderCell[] = [
    {
        nameKey: "folders_flows_selector_title",
        descKey: "folders_flows_selector_description",
        read: (s) => s.foldersFlowsPath ?? "",
        write: (s, v) => (s.foldersFlowsPath = v),
        fallback: DEFAULT_SETTINGS.foldersFlowsPath ?? "",
        flowHome: "foldersFlowsPath",
    },
    {
        nameKey: "settings_event_flows_title",
        descKey: "settings_event_flows_description",
        read: (s) => s.eventFlowsPath ?? "",
        write: (s, v) => (s.eventFlowsPath = v),
        fallback: DEFAULT_SETTINGS.eventFlowsPath ?? "",
        flowHome: "eventFlowsPath",
    },
    {
        nameKey: "hooks_flows_selector_title",
        descKey: "hooks_flows_selector_description",
        read: (s) => s.hooks.folderFlowPath ?? "",
        write: (s, v) => (s.hooks.folderFlowPath = v),
        fallback: DEFAULT_SETTINGS.hooks?.folderFlowPath ?? "",
        flowHome: "hooksFolderPath",
    },
    {
        nameKey: "scripts_folder_selector_title",
        descKey: "scripts_folder_selector_description",
        read: (s) => s.jsLibraryFolderPath ?? "",
        write: (s, v) => (s.jsLibraryFolderPath = v),
        fallback: DEFAULT_SETTINGS.jsLibraryFolderPath ?? "",
        // Rebuild the `zf` script API so it reads from the new folder.
        after: () => fnsManager.invalidateCache(),
    },
    {
        nameKey: "markdown_templates_folder_title",
        descKey: "markdown_templates_folder_description",
        read: (s) => s.communitySettings.markdownTemplateFolder ?? "",
        write: (s, v) => (s.communitySettings.markdownTemplateFolder = v),
        fallback: DEFAULT_SETTINGS.communitySettings?.markdownTemplateFolder ?? "",
    },
];

/**
 * The folder a flow home would move to, checked against the other two homes first (#435). Three
 * homes that overlap would make one canvas two things at once, so an overlapping value is refused
 * and the old one stays. Returns whether the value was taken.
 */
export function acceptFolder(plugin: ZettelFlow, cell: FolderCell, value: string): boolean {
    if (cell.flowHome) {
        const conflict = validateFlowFolders({ ...flowFolders(plugin.settings), [cell.flowHome]: value });
        if (conflict) {
            new Notice(t("settings_flow_folders_conflict", conflict.against));
            return false;
        }
    }
    cell.write(plugin.settings, value);
    return true;
}

/**
 * How long a blur waits before it commits: a click on a folder suggestion blurs the field first, and
 * the choice must win over the half-typed text it replaces.
 */
const BLUR_COMMIT_MS = 200;

/**
 * One cell of the grid: a folder suggest, and a reset that puts the default back in the field.
 *
 * A path is committed when you leave the field, press Enter or pick a suggestion — never per
 * keystroke (#659 runtime audit). Typing `_ZettelFlow/x` passes through `_ZettelFlow`, which is a
 * parent of the other flow homes: checking every keystroke refused the path mid-word, snapped the
 * field back and raised a notice each time, and clearing the field saved an empty folder on the way.
 */
function folderItem(plugin: ZettelFlow, cell: FolderCell): SettingGroupItem {
    return {
        name: t(cell.nameKey),
        desc: t(cell.descKey),
        render: (setting: Setting) => {
            setting.settingEl.addClass(c("settings-folder-cell"));
            let search: SearchComponent | null = null;
            let pendingBlur: number | null = null;
            const commit = async (raw: string): Promise<void> => {
                if (pendingBlur !== null) window.clearTimeout(pendingBlur);
                pendingBlur = null;
                const value = raw.trim();
                if (value === cell.read(plugin.settings)) return;
                if (!acceptFolder(plugin, cell, value)) {
                    // Refused once, said once (the notice), and the field shows what is kept.
                    search?.setValue(cell.read(plugin.settings));
                    return;
                }
                await plugin.saveSettings();
                cell.after?.();
            };
            setting.addSearch((cb) => {
                search = cb;
                new FolderSuggest(cb.inputEl, (path) => void commit(path));
                cb.setPlaceholder(cell.fallback || t("scripts_folder_selector_placeholder")).setValue(
                    cell.read(plugin.settings)
                );
                cb.inputEl.addEventListener("blur", () => {
                    if (pendingBlur !== null) window.clearTimeout(pendingBlur);
                    pendingBlur = window.setTimeout(() => void commit(cb.getValue()), BLUR_COMMIT_MS);
                });
                cb.inputEl.addEventListener("keydown", (event: KeyboardEvent) => {
                    if (event.key === "Enter" && !event.isComposing) void commit(cb.getValue());
                });
            });
            setting.addExtraButton((button) =>
                button
                    .setIcon("rotate-ccw")
                    .setTooltip(t("reset_to_default"))
                    .onClick(async () => {
                        // The reset obeys the same rule: a default that overlaps another home is refused.
                        search?.setValue(cell.fallback);
                        await commit(cell.fallback);
                    })
            );
        },
    };
}

/**
 * **Folders ZettelFlow uses** (#663, epic #659): every place the plugin keeps its own files, in one
 * grid. They used to be scattered — the events folder under *Your flows*, the folder and hook flows
 * under *Advanced*, the templates folder at the end. Each cell has its folder and its reset.
 *
 * The thinking space is the one folder edited elsewhere: it is a choice about thinking, and it lives
 * under Thinking › Returns. Here it is shown, not edited — one setting, one editor — with a way there.
 */
export function foldersSettingsGroup(
    plugin: ZettelFlow,
    visible: () => boolean,
    goToThinking: () => void,
    /** Hands the tab a way to redraw the pointer when the thinking folder changes under Thinking. */
    onPointer: (refresh: () => void) => void = () => undefined
): SettingDefinitionItem {
    return {
        type: "group",
        heading: t("settings_card_folders"),
        cls: c("settings-folders-grid"),
        visible,
        items: [
            ...FOLDER_CELLS.map((cell) => folderItem(plugin, cell)),
            {
                name: t("settings_folders_thinking_name"),
                desc: t("settings_folders_thinking_desc"),
                aliases: [t("settings_thought_lab_name")],
                render: (setting: Setting) => {
                    setting.settingEl.addClass(c("settings-folder-cell"), c("settings-folder-pointer"));
                    const path = () => plugin.settings.thoughtLabPath || DEFAULT_SETTINGS.thoughtLabPath || "";
                    setting.addButton((button) => {
                        button
                            .setButtonText(path())
                            .setTooltip(t("settings_folders_thinking_go"))
                            .onClick(() => goToThinking());
                        // The path is the one edited under Thinking: it follows that field.
                        onPointer(() => {
                            button.setButtonText(path());
                        });
                    });
                },
            },
        ],
    };
}

/** The log levels, in order of how much they say, named the way a person would. */
const LOG_LEVELS: [string, LocaleKey][] = [
    ["off", "logger_level_off"],
    ["error", "logger_level_error"],
    ["warn", "logger_level_warn"],
    ["info", "logger_level_info"],
    ["debug", "logger_level_debug"],
    ["trace", "logger_level_trace"],
];

/** **Scripts and logging** (#663): the type declarations, how much ZettelFlow logs, the timings. */
export function scriptsLoggingGroup(visible: () => boolean): SettingDefinitionItem {
    return {
        type: "group",
        heading: t("settings_card_scripts_logging"),
        visible,
        items: [
            {
                name: t("generate_types_name"),
                desc: t("generate_types_description"),
                render: (setting) => {
                    setting.addButton((button) => {
                        button.setButtonText(t("generate_types_button")).onClick(async () => {
                            const result = await writeTypeDeclarations();
                            if (result.status === "written") {
                                new Notice(t("generate_types_written", result.path));
                            } else if (result.status === "no-folder") {
                                new Notice(t("generate_types_no_folder"));
                            } else {
                                new Notice(t("generate_types_failed", result.message));
                            }
                        });
                    });
                },
            },
            {
                name: t("logger_level_title"),
                desc: t("logger_level_description"),
                control: {
                    type: "dropdown",
                    key: "logLevel",
                    options: Object.fromEntries(LOG_LEVELS.map(([value, key]) => [value, t(key)])),
                },
            },
            // The timings from this vault, read-only (#645): what you look at when something feels
            // slow — beside the log level, not on the Health surface.
            ...speedSettingsItems(),
        ],
    };
}
