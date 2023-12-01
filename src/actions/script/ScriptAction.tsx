import { Action, CustomZettelAction, ExecuteInfo } from "architecture/api";
import { scriptSettings } from "./ScriptSettings";
import { CodeElement } from "./typing";
import { log } from "architecture";

export class ScriptAction extends CustomZettelAction {
  private static ICON = "code-glyph";
  id = "script";
  defaultAction: Action = {
    type: this.id,
    hasUI: false,
  };
  settings = scriptSettings;

  async execute(info: ExecuteInfo) {
    try {
      const element = info.element as CodeElement;
      const { content, note, context } = info;
      const { code } = element;

      const fullFunction = `
      (async function(element, content, note, context){
        ${code}
      })(element, content, note, context);
    `;

      const func = new Function(
        "element",
        "content",
        "note",
        "context",
        fullFunction
      );
      const result = await func(element, content, note, context);
      log.debug(`Script result: ${result}`);
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
