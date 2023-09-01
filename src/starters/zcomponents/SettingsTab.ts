import { ObsidianApi, PluginComponent } from "architecture";
import { log } from "architecture";
import { t } from "architecture/lang";
import { ZettelFlowSettingsTab } from "config";
import ZettlelFlow from "main";
import { Notice } from "obsidian";
export class SettingsTab extends PluginComponent {
    constructor(private plugin: ZettlelFlow) {
        super(plugin);
    }

    onLoad(): void {
        this.plugin.addSettingTab(new ZettelFlowSettingsTab(this.plugin as ZettlelFlow));
        this.plugin.addCommand({
            id: 'open-canvas',
            name: t('command_settings_open_canvas'),
            checkCallback: (checking) => {
                if (this.plugin.settings.canvasFilePath) {
                    ObsidianApi.workspace().openLinkText(this.plugin.settings.canvasFilePath, "");
                } else {
                    new Notice(t('notice_canvas_not_set'));
                }
            }
        });
        log.info('SettingsTab loaded');
    }
}