/**
 * The **binding contract** of every scripting surface (#349) — the one place that says which variables
 * a user script receives.
 *
 * Before this existed, each execution site passed a literal argument array while the editor's
 * completion tables and the settings reader kept their *own* lists of what was available. They drifted:
 * `app` was advertised by both the editor and the settings reader, documented in `docs/actions/`, and
 * injected by nobody — it resolved only through Obsidian's deprecated `window.app` global. The Script
 * action's debug run and its real run disagreed too.
 *
 * Both the signature (`bindingNames`) and the arguments (`bindingArgs`) are derived from these
 * constants, so a surface cannot advertise a variable it does not inject. A guardrail test rejects any
 * literal argument array reaching `buildAsyncScriptFunction`.
 *
 * Pure and Obsidian-free: names and labels only.
 */

/** One variable a user script receives, and the short type label the editor shows for it. */
export interface ScriptBinding {
    /** The identifier the user writes in their script. */
    readonly name: string;
    /** Short type label, shown in the editor's available-variables list. */
    readonly type: string;
}

/**
 * Obsidian's own API. Injected explicitly from the `ObsidianApi` facade rather than left to the
 * deprecated global, so plugin code honours the convention while the user's script keeps its escape
 * hatch — the same deal Templater and Dataview offer.
 */
const APP: ScriptBinding = { name: "app", type: "Obsidian App" };

/** The ZettelFlow script API. */
const ZF: ScriptBinding = { name: "zf", type: "ZettelFlow script API" };

/**
 * The Script action. `element` is the action's own configuration; it has always been in scope, so it is
 * documented here rather than silently withdrawn from whoever already relies on it.
 */
export const SCRIPT_ACTION_BINDINGS: readonly ScriptBinding[] = [
    { name: "element", type: "the action's own configuration" },
    { name: "content", type: "ContentDTO" },
    { name: "note", type: "NoteDTO" },
    { name: "context", type: "Record<string, Literal>" },
    ZF,
    APP,
];

/** The Dynamic Selector, single and multiple. Its script returns the options, so it takes no note. */
export const DYNAMIC_SELECTOR_BINDINGS: readonly ScriptBinding[] = [ZF, APP];

/** A property hook's body: it mutates `event.response` and returns the event. */
export const HOOK_BINDINGS: readonly ScriptBinding[] = [
    { name: "event", type: "HookEvent (request / response)" },
    ZF,
    APP,
];

/** A run condition — a hook condition, a canvas edge condition, a workflow-event binding condition. */
export const CONDITION_BINDINGS: readonly ScriptBinding[] = [
    { name: "event", type: "the event context" },
    ZF,
    APP,
];

/**
 * A `.js` file in the library folder is a CommonJS module, so nothing is *injected* into it — it
 * receives whatever its caller passes. `zf` and `app` are what every caller has, so they are what its
 * editor offers.
 */
export const LIBRARY_SCRIPT_BINDINGS: readonly ScriptBinding[] = [ZF, APP];

/** The formal parameter names, in order, for {@link buildAsyncScriptFunction}. */
export function bindingNames(bindings: readonly ScriptBinding[]): string[] {
    return bindings.map((binding) => binding.name);
}

/** The argument values, in the same order as {@link bindingNames}, looked up by binding name. */
export function bindingArgs(bindings: readonly ScriptBinding[], values: Record<string, unknown>): unknown[] {
    return bindings.map((binding) => values[binding.name]);
}
