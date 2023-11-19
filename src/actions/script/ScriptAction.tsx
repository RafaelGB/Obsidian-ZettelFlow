import { Action, CustomZettelAction, ExecuteInfo } from "architecture/api";
import { addIcon } from "obsidian";
import { scriptSettings } from "./ScriptSettings";

export class ScriptAction extends CustomZettelAction {
  private static ICON = "zettelflow-script-icon";
  id = "script";
  defaultAction: Action = {
    type: this.id,
    hasUI: false,
  };
  settings = scriptSettings;
  constructor() {
    super();
    addIcon(
      ScriptAction.ICON,
      "" // TODO: Add icon
    );
  }
  execute(info: ExecuteInfo): Promise<void> {
    throw new Error("Method not implemented.");
  }
  getIcon(): string {
    return ScriptAction.ICON;
  }
  getLabel(): string {
    return "Script";
  }
}
