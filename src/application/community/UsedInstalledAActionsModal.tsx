import { c } from "architecture";
import ZettelFlow from "main";
import { Modal } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import React from "react";
import { Action } from "architecture/api";
import { ActionTemplatesSelector } from "./components/ActionTemplatesSelector";

export class UsedInstalledActionsModal extends Modal {
  private root: Root;
  constructor(
    private plugin: ZettelFlow,
    private callback: (action: Action) => void
  ) {
    super(plugin.app);
  }

  private selectorCallback = (step: Action) => {
    this.callback(step);
    this.close();
  };
  onOpen(): void {
    this.modalEl.addClass(c("modal"));
    const child = this.contentEl.createDiv();
    this.root = createRoot(child);
    this.root.render(
      <ActionTemplatesSelector
        plugin={this.plugin}
        callback={this.selectorCallback}
      />
    );
  }
}
