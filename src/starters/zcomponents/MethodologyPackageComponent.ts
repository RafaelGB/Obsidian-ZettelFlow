import { PluginComponent, log, ObsidianApi } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { Notice, TFile } from "obsidian";
import { FileService } from "architecture/plugin";
import { ZETTELKASTEN_PACKAGE } from "application/packages/methodologyPackages";
import { PackageVault, installPackage, uninstallPackage } from "application/packages/packageService";

/** A `PackageVault` over the real vault: the create surface + a sanctioned trash (never `.adapter.`). */
function packageVault(): PackageVault {
    const vault = ObsidianApi.vault();
    return {
        getAbstractFileByPath: (path) => vault.getAbstractFileByPath(path),
        getFileByPath: (path) => vault.getFileByPath(path),
        createFolder: (path) => vault.createFolder(path),
        create: (path, data) => vault.create(path, data),
        trash: async (path) => {
            const file = await FileService.getFile(path, false);
            if (file instanceof TFile) await FileService.deleteFile(file);
        },
    };
}

/** Install the reference Zettelkasten package (#174): create its flows atomically, track it, notify. */
export async function installReferencePackage(plugin: ZettelFlow): Promise<void> {
    const pkg = ZETTELKASTEN_PACKAGE;
    if (plugin.settings.installedPackages[pkg.id]) {
        new Notice(t("methodology_package_already_installed", pkg.name));
        return;
    }
    try {
        const { paths } = await installPackage(packageVault(), pkg);
        plugin.settings.installedPackages[pkg.id] = { paths, version: pkg.version };
        await plugin.saveSettings();
        new Notice(t("methodology_package_installed_notice", pkg.name, String(pkg.flows.length)));
    } catch (error) {
        log.error(`[methodology-package] install failed: ${error instanceof Error ? error.message : "unknown error"}`);
        new Notice(t("methodology_package_install_error"));
    }
}

/** Uninstall the reference package (#174): trash its tracked files, drop the record, notify. */
export async function uninstallReferencePackage(plugin: ZettelFlow): Promise<void> {
    const pkg = ZETTELKASTEN_PACKAGE;
    const record = plugin.settings.installedPackages[pkg.id];
    if (!record) {
        new Notice(t("methodology_package_not_installed", pkg.name));
        return;
    }
    try {
        await uninstallPackage(packageVault(), record.paths);
        delete plugin.settings.installedPackages[pkg.id];
        await plugin.saveSettings();
        new Notice(t("methodology_package_removed_notice", pkg.name));
    } catch (error) {
        log.error(`[methodology-package] uninstall failed: ${error instanceof Error ? error.message : "unknown error"}`);
        new Notice(t("methodology_package_uninstall_error"));
    }
}

/** Registers the install/uninstall methodology-package commands (#174). No hotkey. */
export class MethodologyPackageComponent extends PluginComponent {
    constructor(plugin: ZettelFlow) {
        super(plugin);
        this.plugin = plugin;
    }

    private plugin: ZettelFlow;

    onLoad(): void {
        this.plugin.addCommand({
            id: "install-methodology-package",
            name: t("command_install_methodology_package"),
            callback: () => void installReferencePackage(this.plugin),
        });
        this.plugin.addCommand({
            id: "uninstall-methodology-package",
            name: t("command_uninstall_methodology_package"),
            callback: () => void uninstallReferencePackage(this.plugin),
        });
    }
}
