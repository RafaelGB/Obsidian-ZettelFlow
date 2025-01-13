import { CustomZettelAction, ExecuteInfo, fnsManager } from "architecture/api";
import { scriptSettings } from "./ScriptSettings";
import { log } from "architecture";
import { CodeElement } from "architecture/components/core";
export class ScriptAction extends CustomZettelAction {
  private static ICON = "code-glyph";
  id = "script";
  defaultAction = {
    type: this.id,
    hasUI: false,
    id: this.id,
  };
  settings = scriptSettings;

  link = "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/Script";
  // TODO: Translate this
  purpose = "Run a JS script when the note is created/edited.";

  async execute(info: ExecuteInfo) {
    try {
      const element = info.element as CodeElement;
      const { content, note, context } = info;
      const { code } = element;

      const AsyncFunction = Object.getPrototypeOf(
        async function () {}
      ).constructor;
      const fnBody = `return (async () => {
        ${code}
      })(content, note, context, zf);`;

      const functions = await fnsManager.getFns();
      const scriptFn = new AsyncFunction(
        "element",
        "content",
        "note",
        "context",
        "zf",
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
