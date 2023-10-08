import { AbstractHandlerClass } from "architecture/patterns";
import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { CalendarElement, StepBuilderModal } from "zettelkasten";

export class ElementTypeCalendarHandler extends AbstractHandlerClass<StepBuilderModal>  {
    name = t('step_builder_element_type_calendar_title');
    description = t('step_builder_element_type_calendar_description');
    handle(modal: StepBuilderModal): StepBuilderModal {
        const { info } = modal;
        const { element, contentEl } = info;
        const { key, label, zone } = element as CalendarElement;
        contentEl.createEl('h3', { text: this.name });
        contentEl.createEl('p', { text: this.description });

        new Setting(contentEl)
            .setName(t("step_builder_element_type_zone_title"))
            .setDesc(t("step_builder_element_type_zone_description"))
            .addDropdown((dropdown) => {
                dropdown
                    .addOption(
                        "frontmatter",
                        t("step_builder_element_type_zone_frontmatter")
                    )
                    .addOption("body", t("step_builder_element_type_zone_body"))
                    .setValue(zone !== undefined ? (zone as string) : "frontmatter")
                    .onChange(async (value) => {
                        element.zone = value;
                    });
            });

        new Setting(contentEl)
            .setName(t("step_builder_element_type_key_title"))
            .setDesc(t("step_builder_element_type_key_description"))
            .addText(text => {
                text
                    .setValue(key || ``)
                    .onChange(async (value) => {
                        element.key = value;
                    });
            });

        new Setting(contentEl)
            .setName(t("step_builder_element_type_calendar_label_title"))
            .setDesc(t("step_builder_element_type_calendar_label_description"))
            .addText(text => {
                text
                    .setValue(label || ``)
                    .onChange(async (value) => {
                        element.label = value;
                    });
            });
        return this.goNext(modal);
    }
}