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
        this.plugin.addSettingTab(new ZettelFlowSettingsTab(this.plugin as ZettelFlow));
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
        log.info('SettingsTab loaded');
    }
}