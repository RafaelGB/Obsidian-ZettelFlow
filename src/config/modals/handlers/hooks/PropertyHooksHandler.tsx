import { AbstractHandlerClass } from "architecture/patterns";
import { SettingsHandlerInfo } from "config/typing";
import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { createRoot } from "react-dom/client";
import React from "react";
import { PropertyHooksManager } from "./components/PropertyHooksManager";
import { FoldersFlowSelectorHandler } from "./FoldersFlowSelectorHandler";

export class PropertyHooksHandler extends AbstractHandlerClass<SettingsHandlerInfo> {
  name = t("property_hooks_setting_title");
  description = t("property_hooks_setting_description");

  handle(info: SettingsHandlerInfo): SettingsHandlerInfo {
    const { containerEl, plugin } = info;

    new Setting(containerEl).setName(this.name).setDesc(this.description);

    // Container for React component
    const reactContainer = containerEl.createDiv({
      cls: "property-hooks-container",
    });

    // Mount React component
    const root = createRoot(reactContainer);
    root.render(<PropertyHooksManager plugin={plugin} />);

    return this.goNext(info);
  }

  manageNextHandler() {
    this.nextHandler = new FoldersFlowSelectorHandler();
  }
}
