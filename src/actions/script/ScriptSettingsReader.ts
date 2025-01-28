import { ObsidianApi } from "architecture";
import { ActionSettingReader } from "architecture/api";
import { CodeElement } from "architecture/components/core";
import { MarkdownService } from "architecture/plugin";
import { Component } from "obsidian";

export const scriptSettingsReader: ActionSettingReader = (contentEl, action) => {
    const scriptAction = action as CodeElement;
    // Script settings reader logic here
    const mdJSBlock = "```js\n" + scriptAction.code + "\n```";
    const comp = new Component();
    MarkdownService.render(ObsidianApi.globalApp(), mdJSBlock, contentEl, "/", comp);
}