import { ActionSetting, fnsManager } from "architecture/api";
import { t } from "architecture/lang";
import { CodeElement, dispatchEditor } from "architecture/components/core";
import { Setting } from "obsidian";
import { ScriptResult } from "actions";
import { ContentDTO, NoteDTO } from "application/notes";
import { c } from "architecture";
import { navbarAction } from "architecture/components/settings";
import { scriptActionAutocomplete } from "./extensions/autoconfiguration/ScriptStepAutocomplete";

export const scriptSettings: ActionSetting = (
  contentEl,
  modal,
  action,
  disableNavbar
) => {
  const scriptAction = action as CodeElement;
  const { code } = scriptAction;
  const name = t("step_builder_element_type_script_title");
  const description = t("step_builder_element_type_script_description");
  navbarAction(contentEl, name, description, action, modal, disableNavbar);

  const editorEl = contentEl.createDiv();
  editorEl.id = "script-editor";

  dispatchEditor(
    editorEl,
    code,
    (update) => {
      if (update.docChanged) {
        scriptAction.code = update.state.doc.toString();
      }
    },
    [scriptActionAutocomplete]
  );
  // Contenedor para resultados de depuración
  const debugContainer = contentEl.createDiv({
    cls: "debug-container",
  });

  new Setting(debugContainer)
    .setName("Debug script")
    .setDesc("Run the script with mock data and view the result.")
    .addButton((button) => {
      button.setButtonText("Run").setCta();
      button.onClick(async () => {
        const result = await executeUserScript(scriptAction.code);
        displayScriptResult(debugContainer, result);
      });
    })
    .addButton((button) => {
      button.setButtonText("Clear Output");
      button.onClick(() => {
        clearScriptOutput(debugContainer);
      });
    });

  debugContainer.createDiv({
    cls: "output-container",
  });

  // Función para ejecutar el script con datos mock
  const executeUserScript = async (userCode: string): Promise<ScriptResult> => {
    try {
      const functions = await fnsManager.getFns();
      const mockContext: Record<string, unknown> = {};
      const mockContent: ContentDTO = new ContentDTO();
      const mockNote: NoteDTO = new NoteDTO();
      const AsyncFunction = Object.getPrototypeOf(
        async function () {}
      ).constructor;
      const scriptFn = new AsyncFunction(
        "content",
        "note",
        "context",
        "zf",
        `
        return (async () => {
          ${userCode}
        })(content, note, context, zf);
      `
      );

      const output = await scriptFn(
        mockContent,
        mockNote,
        mockContext,
        functions
      );

      return { output, error: null };
    } catch (error) {
      return { output: null, error: error.message };
    }
  };

  // Función para mostrar resultados
  const displayScriptResult = (
    container: HTMLElement,
    result: ScriptResult
  ) => {
    const outputDiv = container.querySelector(".output-container");
    if (!outputDiv) return;

    outputDiv.innerHTML = "";

    if (result.error) {
      outputDiv.createEl("div", {
        text: `Error: ${result.error}`,
        cls: c("error-output"),
      });
    } else {
      outputDiv.createEl("pre", {
        text: `Output:\n${JSON.stringify(result.output, null, 2)}`,
        cls: c("success-output"),
      });
    }
  };

  // Función para limpiar resultados
  const clearScriptOutput = (container: HTMLElement) => {
    const outputDiv = container.querySelector(".output-container");
    if (outputDiv) outputDiv.innerHTML = "";
  };
};
