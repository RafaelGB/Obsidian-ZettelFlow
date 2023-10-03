import { AbstractHandlerClass } from "architecture/patterns";
import { t } from "architecture/lang";
import { StepBuilderModal } from "zettelkasten";
import { Root, createRoot } from "react-dom/client";
import React from "react";
import { SelectorDnD } from "components/SelectorDnD";

export class ElementTypeSelectorHandler extends AbstractHandlerClass<StepBuilderModal> {
  name = t("step_builder_element_type_selector_title");
  description = t("step_builder_element_type_selector_description");
  root: Root;
  handle(modal: StepBuilderModal): StepBuilderModal {
    const { info } = modal;
    const { element, contentEl } = info;
    const { type = "bridge" } = element;
    if (type === "selector") {
      const elementSelectorChild = contentEl.createDiv();
      this.root = createRoot(elementSelectorChild);
      this.root.render(<SelectorDnD info={info} />);
    }
    return this.goNext(modal);
  }

  public postAction(): void {
    // Unmount react component
    this.root.unmount();
    this.nextPostAction();
  }
}
