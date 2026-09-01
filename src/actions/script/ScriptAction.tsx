import { CustomZettelAction, ExecuteInfo } from "architecture/api";
import { scriptSettings } from "./ScriptSettings";
import { t } from "architecture/lang";
import { scriptSettingsReader } from "./ScriptSettingsReader";
import { runScriptAction } from "./scriptActionCore";
export class ScriptAction extends CustomZettelAction {
  private static ICON = "code-glyph";
  id = "script";
  category = "manipulation" as const;
  kind = "command" as const;
  defaultAction = {
    type: this.id,
    hasUI: false,
    id: this.id,
  };
  settings = scriptSettings;
  settingsReader = scriptSettingsReader;
  link = "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/Script";
  get purpose(): string {
    return t("script_purpose");
  }

  async execute(info: ExecuteInfo) {
    await runScriptAction(info);
  }

  getIcon(): string {
    return ScriptAction.ICON;
  }

  getLabel(): string {
    return "Script";
  }
}
