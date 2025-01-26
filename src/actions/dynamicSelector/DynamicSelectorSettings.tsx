import { t } from "architecture/lang";
import { ActionSetting, fnsManager } from "architecture/api";
import { ViewUpdate } from "@codemirror/view";
import { dispatchEditor } from "architecture/components/core";
import { Setting } from "obsidian";
import { DynamicSelectorElement } from "zettelkasten/typing";
import { ScriptResult } from "./typing";
import { c } from "architecture";
import { ObsidianConfig } from "architecture/plugin";
import { PropertySuggest } from "architecture/settings";
import { navbarAction } from "architecture/components/settings";

// Define the settings for the Dynamic Selector element type
export const elementTypeDynamicSelectorSettings: ActionSetting = (
  contentEl,
  modal,
  action
) => {
  const dynamicSelectorElement = action as DynamicSelectorElement;
  const { code, zone, key, multiple } = dynamicSelectorElement;

  const name = t("step_builder_element_type_dynamic_selector_title");
  const description = t(
    "step_builder_element_type_dynamic_selector_description"
  );
  navbarAction(contentEl, name, description, action, modal);

  // Configuration for selecting the zone
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

  new Setting(contentEl)
    .setName(t("step_builder_element_type_key_title"))
    .setDesc(t("step_builder_element_type_key_description"))
    .addSearch((search) => {
      ObsidianConfig.getTypes().then((types) => {
        new PropertySuggest(search.inputEl, types, ["text"]);
        search.setValue(key || ``).onChange(async (value) => {
          action.key = value;
        });
      });
    });

  // Create the container for the code editor
  const editorEl = contentEl.createDiv();
  editorEl.id = "script-editor";

  const handleEditorUpdate = (update: ViewUpdate) => {
    if (update.docChanged) {
      action.code = update.state.doc.toString();
    }
  };

  // Initialize the code editor with the current code
  dispatchEditor(editorEl, code, handleEditorUpdate);

  // Create a container for debugging functionality
  const debugContainer = contentEl.createDiv({
    cls: c("debug-container"),
  });

  // Create debug settings
  new Setting(debugContainer)
    .setName("Debug script")
    .setDesc(
      "Run the script with a test input and verify if it works as expected."
    )
    .addButton((button) => {
      button.setButtonText("Run");
      button.setCta(); // Set as the main call to action (optional)
      button.onClick(async () => {
        // Execute the script with the provided input
        const result = await executeUserScript(action.code as string);

        // Display the result in the UI
        displayScriptResult(debugContainer, result);
      });
    })
    .addButton((button) => {
      button.setButtonText("Clear Output");
      button.onClick(() => {
        clearScriptOutput(debugContainer);
      });
    });

  new Setting(contentEl)
    .setName(t("step_builder_element_type_selector_multiple_title"))
    .setDesc(t("step_builder_element_type_selector_multiple_description"))
    .addToggle((toggle) => {
      toggle.setValue(multiple || false).onChange(async (value) => {
        action.multiple = value;
      });
    });
  // Create a container to display debugging results
  debugContainer.createDiv({
    cls: c("output-container"),
  });

  /**
   * Function to execute the user-provided script with a given input.
   * @param userCode The JavaScript code provided by the user.
   * @returns An object containing the script output or an error if one occurred.
   */
  const executeUserScript = async (userCode: string): Promise<ScriptResult> => {
    try {
      const functions = await fnsManager.getFns();
      // Create a new async function from the user's code
      const AsyncFunction = Object.getPrototypeOf(
        async function () {}
      ).constructor;

      // Prepare the function body
      const fnBody = `
        return (async () => {
          ${userCode}
        })();
      `;

      // Instantiate the function
      const scriptFn = new AsyncFunction("zf", fnBody);

      // Execute the function
      const output = await scriptFn(functions);

      // Validate the output format
      if (!Array.isArray(output)) {
        throw new Error(
          "The script must return an array of tuples. Example: [['key1', 'label1'], ['key2', 'label2']]"
        );
      }

      for (let i = 0; i < output.length; i++) {
        const item = output[i];
        if (
          !Array.isArray(item) ||
          item.length !== 2 ||
          typeof item[0] !== "string" ||
          typeof item[1] !== "string"
        ) {
          throw new Error(
            `The item at index ${i} is not a tuple [string, string]. ${JSON.stringify(
              item
            )}`
          );
        }
      }

      return { output, error: null };
    } catch (err: any) {
      // Capture and return any errors that occur during execution
      return { output: null, error: err.message || String(err) };
    }
  };

  /**
   * Function to display the script execution result in the UI.
   * @param container The container where the result will be displayed.
   * @param result The result of the script execution.
   */
  const displayScriptResult = (
    container: HTMLElement,
    result: ScriptResult
  ) => {
    // Clear any previous content in the output container
    const existingOutput = container.querySelector(`.${c("output-container")}`);
    if (existingOutput) {
      existingOutput.innerHTML = "";
    }

    // Create the output container if it doesn't exist
    const outputDiv =
      container.querySelector<HTMLElement>(`.${c("output-container")}`) ||
      container.createDiv({ cls: c("output-container") });

    // Display the result or error
    if (result.error) {
      outputDiv.createEl("div", {
        text: `Error: ${result.error}`,
        cls: c("error-output"),
      });
    } else {
      // Format the output as JSON for better readability
      const formattedOutput =
        typeof result.output === "object"
          ? JSON.stringify(result.output, null, 2)
          : String(result.output);

      outputDiv.createEl("pre", {
        text: `Output:\n${formattedOutput}`,
        cls: c("success-output"),
      });
    }
  };

  /**
   * Function to clear the output container.
   * @param container The container where the result will be displayed.
   */
  const clearScriptOutput = (container: HTMLElement) => {
    const outputDiv = container.querySelector(`.${c("output-container")}`);
    if (outputDiv) {
      outputDiv.innerHTML = "";
    }
  };
};
