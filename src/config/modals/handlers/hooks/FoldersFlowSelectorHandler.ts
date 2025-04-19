import { c } from "architecture";
import { t } from "architecture/lang";
import { AbstractHandlerClass } from "architecture/patterns";
import { FolderSuggest } from "architecture/settings";
import { DEFAULT_SETTINGS, SettingsHandlerInfo } from "config/typing";
import { Setting } from "obsidian";


export class FoldersFlowSelectorHandler extends AbstractHandlerClass<SettingsHandlerInfo> {
    name = t('hooks_flows_selector_title');
    description = t('hooks_flows_selector_description');
    handle(info: SettingsHandlerInfo): SettingsHandlerInfo {
        const { containerEl, plugin } = info;
        const source_form_promise = async (value: string): Promise<void> => {
            // set search value
            info.plugin.settings.hooks.folderFlowPath
                = value;
            // update settings
            await info.plugin.saveSettings();
        };

        new Setting(containerEl)
            .setName(this.name)
            .setDesc(this.description)
            .setClass(c('readable-setting-item'))
            .addSearch((cb) => {
                new FolderSuggest(
                    cb.inputEl
                );

                cb.setPlaceholder(t("folders_flows_selector_placeholder"))
                    .setValue(plugin.settings.hooks.folderFlowPath)
                    .onChange(source_form_promise);
            })
            // Reset to default button
            .addButton(button => button
                .setClass('mod-cta')
                .setButtonText(t('reset_to_default'))
                .setIcon('reset')
                .onClick(async () => {
                    const defaultFolderFlowPath = DEFAULT_SETTINGS.hooks?.folderFlowPath;
                    if (defaultFolderFlowPath) {
                        info.plugin.settings.hooks.folderFlowPath = defaultFolderFlowPath;
                        await info.plugin.saveSettings();
                        await info.section?.refresh(info);
                    }
                }));

        return this.goNext(info);
    }
}