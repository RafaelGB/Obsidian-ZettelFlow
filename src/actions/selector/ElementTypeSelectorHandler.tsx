import { AbstractHandlerClass } from "architecture/patterns";
import { t } from "architecture/lang";
import { SelectorElement, StepBuilderModal } from "zettelkasten";
import { Root, createRoot } from "react-dom/client";
import React from "react";
import { SelectorDnD } from "components/SelectorDnD";
import { Setting } from "obsidian";

export class ElementTypeSelectorHandler extends AbstractHandlerClass<StepBuilderModal> {
  name = t("step_builder_element_type_selector_title");
  description = t("step_builder_element_type_selector_description");
  root: Root;
  handle(modal: StepBuilderModal): StepBuilderModal {
    const { info } = modal;
    const { contentEl, element } = info;
    const { zone, key, label } = element as SelectorElement;

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
      .addText((text) => {
        text.setValue(key || ``).onChange(async (value) => {
          element.key = value;
        });
      });

    new Setting(contentEl)
      .setName(t("step_builder_element_type_prompt_label_title"))
      .setDesc(t("step_builder_element_type_prompt_label_description"))
      .addText((text) => {
        text.setValue(label || ``).onChange(async (value) => {
          element.label = value;
        });
      });

    const elementSelectorChild = contentEl.createDiv();
    this.root = createRoot(elementSelectorChild);
    this.root.render(<SelectorDnD info={info} />);
    return this.goNext(modal);
  }

  public postAction(): void {
    // Unmount react component
    this.root?.unmount();
    this.nextPostAction();
  }
}
