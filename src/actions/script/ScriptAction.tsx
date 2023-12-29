import { CustomZettelAction, ExecuteInfo } from "architecture/api";
import { scriptSettings } from "./ScriptSettings";
import { CodeElement } from "./typing";
import { log } from "architecture";

export class ScriptAction extends CustomZettelAction {
  private static ICON = "code-glyph";
  id = "script";
  defaultAction = {
    type: this.id,
    hasUI: false,
    id: this.id,
  };
  settings = scriptSettings;

  async execute(info: ExecuteInfo) {
    try {
      const element = info.element as CodeElement;
      const { content, note, context, externalFns } = info;
      const { code } = element;

      const AsyncFunction = Object.getPrototypeOf(
        async function () {}
      ).constructor;
      const fnBody = `return (async () => {
        ${code}
      })(element, content, note, context, zf);`;

      const scriptFn = new AsyncFunction(
        "element",
        "content",
        "note",
        "context",
        "zf",
        fnBody
      );
      await scriptFn(element, content, note, context, externalFns);
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
