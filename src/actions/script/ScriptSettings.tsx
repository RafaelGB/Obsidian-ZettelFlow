import {
  ActionSetting,
  fnsManager,
  buildAsyncScriptFunction,
  errorMessage,
  SCRIPT_ACTION_BINDINGS,
  bindingNames,
  bindingArgs,
} from "architecture/api";
import { t } from "architecture/lang";
import { CodeElement, dispatchEditor } from "architecture/components/core";
import { Setting } from "obsidian";
import { ScriptResult } from "actions";
import { ContentDTO, NoteDTO } from "application/notes";
import { c, ObsidianApi } from "architecture";
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
    .setName(t("script_debug_name"))
    .setDesc(t("script_debug_description"))
    .addButton((button) => {
      button.setButtonText(t("script_debug_run")).setCta();
      button.onClick(async () => {
        const result = await executeUserScript(scriptAction.code);
        displayScriptResult(debugContainer, result);
      });
    })
    .addButton((button) => {
      button.setButtonText(t("script_debug_clear"));
      button.onClick(() => {
        clearScriptOutput(debugContainer);
      });
    });

  debugContainer.createDiv({
    cls: "output-container",
  });

  // A debug run must see exactly what the real run sees, so both derive their signature from
  // SCRIPT_ACTION_BINDINGS. They used to disagree: `element` was in scope at runtime but not here.
  const executeUserScript = async (userCode: string): Promise<ScriptResult> => {
    try {
      const scriptFn = buildAsyncScriptFunction(
        bindingNames(SCRIPT_ACTION_BINDINGS),
        `
        return (async () => {
          ${userCode}
        })();
      `
      );

      const output = await scriptFn(
        ...bindingArgs(SCRIPT_ACTION_BINDINGS, {
          element: scriptAction,
          content: new ContentDTO(),
          note: new NoteDTO(),
          context: {},
          zf: await fnsManager.getFns(),
          app: ObsidianApi.globalApp(),
        })
      );

      return { output, error: null };
    } catch (error) {
      return { output: null, error: errorMessage(error) };
    }
  };

  // Función para mostrar resultados
  const displayScriptResult = (
    container: HTMLElement,
    result: ScriptResult
  ) => {
    const outputDiv = container.querySelector(".output-container");
    if (!outputDiv) return;

    outputDiv.empty();

    if (result.error) {
      outputDiv.createDiv({
        text: t("script_debug_error", result.error),
        cls: c("error-output"),
      });
    } else {
      outputDiv.createEl("pre", {
        text: t("script_debug_output", JSON.stringify(result.output, null, 2)),
        cls: c("success-output"),
      });
    }
  };

  // Función para limpiar resultados
  const clearScriptOutput = (container: HTMLElement) => {
    const outputDiv = container.querySelector(".output-container");
    if (outputDiv) outputDiv.empty();
  };
};
