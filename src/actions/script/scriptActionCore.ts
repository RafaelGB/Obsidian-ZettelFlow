import { Notice } from "obsidian";
import {
    ExecuteInfo,
    buildAsyncScriptFunction,
    errorMessage,
    sharedScriptValues,
    SCRIPT_ACTION_BINDINGS,
    bindingNames,
    bindingArgs,
} from "architecture/api";
import { log } from "architecture";
import { withScriptRun } from "architecture/api/lib/recordScriptRun";
import { t } from "architecture/lang";
import type { CodeElement } from "architecture/components/core";

/**
 * The **execution core** of the Script action, decoupled from its authoring UI (#349) — the same split
 * as `knowledgeActionCore` (#264) and `aiActionCore` (#337). No editor import here, so the run path
 * loads in a unit test without the CodeMirror graph.
 *
 * The signature comes from {@link SCRIPT_ACTION_BINDINGS}, so what a script receives at runtime is
 * exactly what the settings reader advertises and what the debug run provides.
 */

/** The collaborators the run path needs, injectable so failure handling is testable offline. */
export interface ScriptRunDeps {
    /** The `zf` API and Obsidian's `app`, resolved together. */
    values: () => Promise<Record<string, unknown>>;
    /** Surface a failure to the user. */
    notify: (message: string) => void;
}

const defaultDeps: ScriptRunDeps = {
    values: async () => ({ ...(await sharedScriptValues()) }),
    notify: (message) => {
        new Notice(message);
    },
};

/**
 * Run a Script action's code.
 *
 * A throw used to be logged and forgotten: the wizard carried on and the note was created as if the
 * step had worked, while the authoring panel reported the very same failure. So the script told you
 * about its error while you wrote it and hid it when it ran. It now always surfaces.
 */
export async function runScriptAction(info: ExecuteInfo, deps: ScriptRunDeps = defaultDeps): Promise<void> {
    const element = info.element as CodeElement;
    try {
        const { content, note, context } = info;
        const scriptFn = buildAsyncScriptFunction(
            bindingNames(SCRIPT_ACTION_BINDINGS),
            `return (async () => {\n${element.code}\n})();`
        );

        const args = bindingArgs(SCRIPT_ACTION_BINDINGS, {
            element,
            content,
            note,
            context,
            ...(await deps.values()),
        });
        // Timed and written down, whatever it does (#444): a step's script that fails while you
        // are answering the next question used to leave nothing behind.
        await withScriptRun(
            {
                surface: "action",
                origin: { ref: element.id, label: element.description ?? element.type },
                input: { element, content, note, context },
            },
            () => scriptFn(...args)
        );
    } catch (error) {
        const message = errorMessage(error);
        log.error(`Error executing script action "${element.id}": ${message}`);
        deps.notify(t("script_action_error_notice", message));
    }
}
