import { t } from "architecture/lang";
import { ActionSetting } from "architecture/api";

export const tagsSettings: ActionSetting = (contentEl) => {
    contentEl.createEl('p', { text: t('step_builder_element_type_tags_description') });
}
