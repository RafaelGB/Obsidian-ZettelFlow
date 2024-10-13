import { t } from "architecture/lang";
import { ActionSetting } from "architecture/api";
import { ViewUpdate } from "@codemirror/view";
import { dispatchEditor } from "architecture/components/core";
import { Setting } from "obsidian";
import { DynamicSelectorElement } from "zettelkasten/typing";

type ScriptResult = {
  output: any;
  error: string | null;
};

export const elementTypeDynamicSelectorSettings: ActionSetting = (
  contentEl,
  _,
  action
) => {
  const dynamicSelectorElement = action as DynamicSelectorElement;
  const { code, zone } = dynamicSelectorElement;
  // TODO: adapt this to the dynamic selector
  contentEl.createEl("h3", {
    text: t("step_builder_element_type_script_title"),
  });
  contentEl.createEl("p", {
    text: t("step_builder_element_type_script_description"),
  });

  new Setting(contentEl)
    .setName(t("step_builder_element_type_zone_title"))
    .setDesc(t("step_builder_element_type_zone_description"))
    .addDropdown((dropdown) => {
      dropdown
        .addOption(
          "frontmatter",
          t("step_builder_element_type_zone_frontmatter")
        )
        .addOption("body", t("step_builder_element_type_zone_body"))
        .addOption("context", t("step_builder_element_type_zone_context"))
        .setValue(zone !== undefined ? (zone as string) : "frontmatter")
        .onChange(async (value) => {
          action.zone = value;
        });
    });

  // If the zone is 'context', show another setting to allow the user to specify the context key
  if (zone === "context") {
    new Setting(contentEl)
      .setName("Context key")
      .setDesc("The key to use in the context object.")
      .addText((text) => {
        text
          .setPlaceholder("contextKey")
          .setValue(dynamicSelectorElement.zoneKey || "")
          .onChange(async (value) => {
            action.key = value;
          });
      });
  }

  const editorEl = contentEl.createDiv();
  editorEl.id = "script-editor";

  const handleEditorUpdate = (update: ViewUpdate) => {
    if (update.docChanged) {
      action.code = update.state.doc.toString();
    }
  };

  // Inicializar el editor de código con el código actual
  dispatchEditor(editorEl, code, handleEditorUpdate);

  // Crear un contenedor para la funcionalidad de depuración
  const debugContainer = contentEl.createDiv({
    cls: "debug-container",
  });
  debugContainer.setAttr("style", "margin-top: 20px;");

  // Crear una nueva configuración para la depuración del script
  new Setting(debugContainer)
    .setName("Depurar el script")
    .setDesc(
      "Ejecuta el script con una entrada de prueba y verifica si funciona como se espera."
    )
    .addButton((button) => {
      button.setButtonText("Run");
      button.setCta(); // Establecer como llamada a la acción principal (opcional)
      button.onClick(async () => {
        // Ejecutar el script con la entrada proporcionada
        const result = await executeUserScript(action.code as string);

        // Mostrar el resultado en la interfaz
        displayScriptResult(debugContainer, result);
      });
    });

  // Crear un contenedor para mostrar los resultados de la depuración
  debugContainer.createDiv({
    cls: "output-container",
  });

  /**
   * Función para ejecutar el script proporcionado por el usuario con una entrada dada.
   * @param userCode El código JavaScript proporcionado por el usuario.
   * @param input La entrada proporcionada para la ejecución del script.
   * @returns Un objeto que contiene la salida del script o un error si ocurrió alguno.
   */
  const executeUserScript = async (userCode: string): Promise<ScriptResult> => {
    try {
      // Crear una nueva función asíncrona a partir del código del usuario
      const AsyncFunction = Object.getPrototypeOf(
        async function () {}
      ).constructor;

      // Preparar el cuerpo de la función, pasando 'input' como parámetro
      const fnBody = `
        return (async () => {
          ${userCode}
        })();
      `;

      // Instanciar la función
      const scriptFn = new AsyncFunction(fnBody);

      // Ejecutar la función con la entrada proporcionada
      const output = await scriptFn();

      return { output, error: null };
    } catch (err: any) {
      // Capturar y retornar cualquier error que ocurra durante la ejecución
      return { output: null, error: err.message || String(err) };
    }
  };

  /**
   * Función para mostrar el resultado de la ejecución del script en la interfaz.
   * @param container El contenedor donde se mostrará el resultado.
   * @param result El resultado de la ejecución del script.
   */
  const displayScriptResult = (
    container: HTMLElement,
    result: ScriptResult
  ) => {
    // Limpiar cualquier contenido previo en el contenedor de salida
    const existingOutput = container.querySelector(".output-container");
    if (existingOutput) {
      existingOutput.innerHTML = "";
    }

    // Crear el contenedor de salida si no existe
    const outputDiv =
      container.querySelector<HTMLElement>(".output-container") ||
      container.createDiv({ cls: "output-container" });

    // Mostrar el resultado o el error
    if (result.error) {
      outputDiv.createEl("div", {
        text: `Error: ${result.error}`,
        cls: "error-output",
      });
    } else {
      // Formatear la salida como JSON para una mejor legibilidad
      const formattedOutput =
        typeof result.output === "object"
          ? JSON.stringify(result.output, null, 2)
          : String(result.output);

      outputDiv.createEl("pre", {
        text: `Output:\n${formattedOutput}`,
        cls: "success-output",
      });
    }
  };
};
