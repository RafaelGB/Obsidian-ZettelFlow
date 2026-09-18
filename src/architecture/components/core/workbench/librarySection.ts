import { Notice, Setting } from "obsidian";
import { c, log, ObsidianApi } from "architecture";
import { t } from "architecture/lang";
import { FileService } from "architecture/plugin";
import { ZfScripts, type LibraryModuleStatus } from "architecture/api/lib/scripts/service/ZfScripts";
import { fnsManager } from "architecture/api";
import type { ScriptSurface } from "application/scripts/scriptRunLog";
import { boundedScan, describeScan } from "application/search/boundedScan";

type LocaleKey = Parameters<typeof t>[0];

/**
 * **The library manager** (#448, epic #443): which modules loaded, what they export, what they say
 * about themselves, and who uses them.
 *
 * A module that failed to load used to show one toast at startup and then disappear from the
 * story — there was nowhere to ask what happened. And a module that loaded fine was equally
 * silent about what it was for.
 */

export interface LibraryHandlers {
    /** Try a function in the bench above, with a call already written. */
    onTry: (surface: ScriptSurface, code: string) => void;
}

/** A starter module, with the contract already in it — nobody should begin at an empty file. */
const STARTER = `/**
 * What this function is for.
 * @param {string} title The note's title
 * @returns {string} what it gives back
 * @zf-surface action
 */
module.exports = (title) => title;
`;

export function renderLibrary(contentEl: HTMLElement, handlers: LibraryHandlers): void {
    contentEl.createEl("h3", { text: t("library_title") });
    contentEl.createDiv({ cls: c("workbench-intro"), text: t("library_intro") });

    const modules = ZfScripts.describeModules();
    const list = contentEl.createDiv({ cls: c("library-list") });
    if (modules.length === 0) {
        list.createDiv({ cls: c("workbench-note"), text: t("library_empty") });
    }
    for (const module of modules) renderModule(list, module, handlers);

    new Setting(contentEl)
        .setName(t("library_new"))
        .setDesc(t("library_new_desc"))
        .addButton((button) =>
            button.setButtonText(t("library_new")).onClick(() => void createStarter())
        )
        .addButton((button) =>
            button.setButtonText(t("library_reload")).onClick(() => {
                fnsManager.invalidateCache();
                void fnsManager.getFns().then(() => new Notice(t("library_reloaded_all")));
            })
        );
}

function renderModule(
    list: HTMLElement,
    module: LibraryModuleStatus,
    handlers: LibraryHandlers
): void {
    const row = new Setting(list).setName(module.name).setDesc(module.path);
    if (!module.loaded) {
        row.settingEl.addClass(c("library-failed"));
        row.descEl.createDiv({
            cls: c("library-error"),
            text: t("library_failed", module.error ?? ""),
        });
    }

    const contract = module.contract;
    if (contract?.description) {
        row.descEl.createDiv({ cls: c("library-doc"), text: contract.description });
    }
    if (contract && contract.params.length > 0) {
        row.descEl.createDiv({
            cls: c("library-doc"),
            text: contract.params
                .map((param) => (param.type ? `${param.name}: ${param.type}` : param.name))
                .join(", "),
        });
    }
    if (contract?.desktopOnly) {
        // `window.require` does not exist on mobile, where it used to return undefined in silence.
        row.descEl.createDiv({ cls: c("library-desktop"), text: t("library_desktop_only") });
    }
    if (contract && !contract.description && contract.params.length === 0) {
        row.descEl.createDiv({ cls: c("library-doc"), text: t("library_undocumented") });
    }

    row.addButton((button) =>
        button.setButtonText(t("library_try")).onClick(() => {
            const args = (contract?.params ?? []).map((param) => param.name).join(", ");
            handlers.onTry(
                (contract?.surface as ScriptSurface | undefined) ?? "action",
                `return zf.internal.user.${module.name}(${args});`
            );
        })
    );
    row.addExtraButton((button) =>
        button
            .setIcon("search")
            .setTooltip(t("library_find_usages"))
            .onClick(() => void findUsages(module.name))
    );
    row.addExtraButton((button) =>
        button
            .setIcon("external-link")
            .setTooltip(t("library_open"))
            .onClick(() => void FileService.openFile(module.path))
    );
}

/**
 * Who calls this function. Scanned on demand rather than on every render: the answer needs the
 * hooks and the flows, and a manager that reads the vault to draw a list is a manager nobody
 * opens twice.
 *
 * **Bounded and honest since #461.** This reads canvas files, and before the bound it read *every*
 * canvas in the vault with nothing to stop it — the one place in ZettelFlow that could genuinely
 * hang while you waited for a `Notice`. It now covers at most {@link SCAN_LIMIT} canvases, yields
 * while it works, and the result says how many it actually searched rather than implying it
 * searched them all.
 */
async function findUsages(name: string): Promise<void> {
    const plugin = ObsidianApi.getOwnPlugin();
    if (!plugin) return;
    const needle = `user.${name}`;
    const used: string[] = [];

    for (const [property, hook] of Object.entries(plugin.settings.hooks?.properties ?? {})) {
        if (hook.script?.includes(needle)) used.push(t("library_used_by_hook", property));
    }

    let coverage = { key: "scan_searched", count: 0 };
    try {
        const { vault } = plugin.app;
        const canvases = vault.getFiles().filter((file) => file.path.endsWith(".canvas"));
        const result = await boundedScan(canvases, async (file) =>
            (await vault.cachedRead(file)).includes(needle)
        );
        for (const file of result.matches) used.push(file.path);
        coverage = describeScan(result);
    } catch (error) {
        log.warn("[library] could not scan the vault for usages", error);
    }

    const where =
        used.length === 0 ? t("library_used_by_nobody", name) : t("library_used_by", name, used.join(", "));
    // Say what was covered, always: an answer that does not state its scope is a claim about the
    // whole vault, and at this size that claim would often be wrong.
    new Notice(`${where} ${t(coverage.key as LocaleKey, String(coverage.count))}`);
}

/** Write a starter module into the library folder, then reload so it is immediately callable. */
async function createStarter(): Promise<void> {
    const plugin = ObsidianApi.getOwnPlugin();
    const folder = plugin?.settings.jsLibraryFolderPath;
    if (!plugin || !folder) {
        new Notice(t("library_no_folder"));
        return;
    }
    const path = `${folder}/new-function.js`;
    try {
        if (ObsidianApi.vault().getFileByPath(path)) {
            await FileService.openFile(path);
            return;
        }
        await FileService.createFile(path, STARTER, false);
        await FileService.openFile(path);
        fnsManager.invalidateCache();
    } catch (error) {
        log.error("[library] could not create the starter module", error);
        new Notice(t("library_new_failed"));
    }
}
