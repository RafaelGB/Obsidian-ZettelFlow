import { openCommunity } from "application/community/view/openCommunity";
import { ObsidianApi, PluginComponent } from "architecture";
import { log } from "architecture";
import { t } from "architecture/lang";
import { ZettelFlowSettingsTab, ZettelFlowSettings } from "config";
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
                    void ObsidianApi.workspace().openLinkText(this.plugin.settings.ribbonCanvas, "");
                } else {
                    new Notice(t('notice_canvas_not_set'));
                }
            }
        });
        // Aliases kept so a bound hotkey survives (§XI): Community's Systems and Installed rooms (#798).
        this.plugin.addCommand({
            id: 'open-community-templates',
            name: t('command_open_community_templates'),
            callback: () => void openCommunity(this.plugin.app, "systems")
        });
        this.plugin.addCommand({
            id: 'open-manage-templates',
            name: t('command_open_manage_templates'),
            callback: () => void openCommunity(this.plugin.app, "installed")
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
        // Legacy shape: `propertyHooks` used to live at the settings root before it moved
        // under `hooks.properties`. Type the migration access without unsafe any.
        const settings = this.plugin.settings as ZettelFlowSettings & {
            propertyHooks?: ZettelFlowSettings["hooks"]["properties"];
        };
        if (settings.propertyHooks) {
            settings.hooks.properties = settings.propertyHooks;
            delete settings.propertyHooks;
            await this.plugin.saveSettings();
            log.info('Settings migrated');
        }
    }
}