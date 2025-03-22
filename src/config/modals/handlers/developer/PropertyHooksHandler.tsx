import { AbstractHandlerClass } from "architecture/patterns";
import { SettingsHandlerInfo } from "config/typing";
import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { createRoot } from "react-dom/client";
import { CommunitySettingsHandler } from "./CommunitySettingsHandler";
import { PropertyHooksManager } from "./components/PropertyHooksManager";
import React from "react";

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

  public manageNextHandler(): void {
    this.nextHandler = new CommunitySettingsHandler();
  }
}
