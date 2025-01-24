import { c } from "architecture";
import ZettelFlow from "main";
import { Modal } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import { StepSettings } from "zettelkasten";
import { StepTemplatesSelector } from "./components/StepTemplatesSelector";
import React from "react";

export class UsedInstalledStepsModal extends Modal {
  private root: Root;
  constructor(
    private plugin: ZettelFlow,
    private callback: (step: StepSettings) => void
  ) {
    super(plugin.app);
  }

  private selectorCallback = (step: StepSettings) => {
    this.callback(step);
    this.close();
  };
  onOpen(): void {
    this.modalEl.addClass(c("modal"));
    const child = this.contentEl.createDiv();
    this.root = createRoot(child);
    this.root.render(
      <StepTemplatesSelector
        plugin={this.plugin}
        callback={this.selectorCallback}
      />
    );
  }
}
