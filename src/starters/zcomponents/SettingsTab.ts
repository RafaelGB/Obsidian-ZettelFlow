import { CommunityTemplatesModal, ManageInstalledTemplatesModal } from "application/community";
import { ObsidianApi, PluginComponent } from "architecture";
import { log } from "architecture";
import { t } from "architecture/lang";
import { ZettelFlowSettingsTab } from "config";
import ZettelFlow from "main";
import { Notice } from "obsidian";
export class SettingsTab extends PluginComponent {
    constructor(private plugin: ZettelFlow) {
        super(plugin);
    }

    onLoad(): void {
        // Open file with principal canvas flow
        this.plugin.addSettingTab(new ZettelFlowSettingsTab(this.plugin));
        this.plugin.addCommand({
            id: 'open-canvas',
            name: t('command_settings_open_canvas'),
            callback: () => {
                if (this.plugin.settings.ribbonCanvas) {
                    ObsidianApi.workspace().openLinkText(this.plugin.settings.ribbonCanvas, "");
                } else {
                    new Notice(t('notice_canvas_not_set'));
                }
            }
        });
        // Open community templates
        this.plugin.addCommand({
            id: 'open-community-templates',
            name: t('command_open_community_templates'),
            callback: () => {
                new CommunityTemplatesModal(this.plugin).open();
            }
        });
        // Open local manage templates
        this.plugin.addCommand({
            id: 'open-manage-templates',
            name: t('command_open_manage_templates'),
            callback: () => {
                new ManageInstalledTemplatesModal(this.plugin).open();
            }
        });
        log.info('SettingsTab loaded');

        // Migrate settings if needed
        this.legacyMigrateSettings().then(() => {
            log.info('Settings migrated');
        }).catch((error) => {
            log.error('Error migrating settings:', error);
        });
    }
    private async legacyMigrateSettings() {
        const settings = this.plugin.settings as any;
        if (settings.propertyHooks) {
            settings.hooks.properties = settings.propertyHooks;
            delete settings.propertyHooks;
            await this.plugin.saveSettings();
            log.info('Settings migrated');
        }
    }
}