import { CustomZettelAction, ExecuteInfo, fnsManager, buildAsyncScriptFunction } from "architecture/api";
import { scriptSettings } from "./ScriptSettings";
import { log } from "architecture";
import { t } from "architecture/lang";
import { CodeElement } from "architecture/components/core";
import { scriptSettingsReader } from "./ScriptSettingsReader";
export class ScriptAction extends CustomZettelAction {
  private static ICON = "code-glyph";
  id = "script";
  category = "manipulation" as const;
  defaultAction = {
    type: this.id,
    hasUI: false,
    id: this.id,
  };
  settings = scriptSettings;
  settingsReader = scriptSettingsReader;
  link = "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/Script";
  // TODO: Translate this
  get purpose(): string {
    return t("script_purpose");
  }

  async execute(info: ExecuteInfo) {
    try {
      const element = info.element as CodeElement;
      const { content, note, context } = info;
      const { code } = element;

      const fnBody = `return (async () => {
        ${code}
      })(content, note, context, zf);`;

      const functions = await fnsManager.getFns();
      const scriptFn = buildAsyncScriptFunction(
        ["element", "content", "note", "context", "zf"],
        fnBody
      );

      await scriptFn(element, content, note, context, functions);
    } catch (error) {
      log.error(`Error executing script: ${error}`);
    }
  }

  getIcon(): string {
    return ScriptAction.ICON;
  }

  getLabel(): string {
    return "Script";
  }
}
