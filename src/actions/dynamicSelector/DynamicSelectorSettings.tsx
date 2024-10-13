import { t } from "architecture/lang";
import { ActionSetting } from "architecture/api";
import { ViewUpdate } from "@codemirror/view";
import { dispatchEditor } from "architecture/components/core";
import { Setting } from "obsidian";
import { DynamicSelectorElement } from "zettelkasten/typing";
import { ScriptResult } from "./typing";
import { c } from "architecture";

// Define the settings for the Dynamic Selector element type
export const elementTypeDynamicSelectorSettings: ActionSetting = (
  contentEl,
  _,
  action
) => {
  const dynamicSelectorElement = action as DynamicSelectorElement;
  const { code, zone } = dynamicSelectorElement;

  // Create the title and description for the scripts section
  contentEl.createEl("h3", {
    text: t("step_builder_element_type_script_title"),
  });
  contentEl.createEl("p", {
    text: t("step_builder_element_type_script_description"),
  });

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
          // Show or hide the "Context key" field based on the selected zone
          if (value === "context") {
            contextKeySetting.setDisabled(false);
            contextKeySetting.settingEl.style.display = "";
          } else {
            contextKeySetting.setDisabled(true);
            contextKeySetting.settingEl.style.display = "none";
            // Optional: Clear the value if the zone is not "context"
            action.key = "";
            contextKeyTextInput.value = "";
          }
        });
    });

  // Create the "Context key" field but hide it initially if the zone is not "context"
  const contextKeySetting = new Setting(contentEl)
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

  // Hide the "Context key" field if the initial zone is not "context"
  if (zone !== "context") {
    contextKeySetting.settingEl.style.display = "none";
    contextKeySetting.setDisabled(true);
  }

  // Get a reference to the "Context key" input to clear its value if necessary
  const contextKeyTextInput = contextKeySetting.controlEl.querySelector(
    "input"
  ) as HTMLInputElement;

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
      const scriptFn = new AsyncFunction(fnBody);

      // Execute the function
      const output = await scriptFn();

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
