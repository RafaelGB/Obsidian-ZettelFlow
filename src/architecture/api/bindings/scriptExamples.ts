import {
    SCRIPT_ACTION_BINDINGS,
    DYNAMIC_SELECTOR_BINDINGS,
    HOOK_BINDINGS,
    type ScriptBinding,
} from "./scriptBindings";

/**
 * Ready-to-insert examples for the script editors (#351).
 *
 * The Script action and the Dynamic Selector shipped an empty editor and a **Run** button — you had to
 * already know the API to write the first line. The condition editor solved this long ago with
 * clickable examples, so this reuses that idea rather than inventing a second affordance.
 *
 * Each example is pinned by a test: it must parse, and it may only reference bindings its surface
 * actually injects. An example that rots into a lie is the same drift this epic exists to remove — and
 * a wrong example is worse than none, because the user assumes it works.
 *
 * The code is code, so it stays as written. Only the labels go through i18n.
 */

/** One insertable example, tied to the surface whose bindings it may use. */
export interface ScriptExample {
    /** i18n key for the human label. */
    readonly labelKey: string;
    /** The bindings this example is allowed to reference. */
    readonly bindings: readonly ScriptBinding[];
    readonly code: string;
}

export const SCRIPT_ACTION_EXAMPLES: readonly ScriptExample[] = [
    {
        labelKey: "script_example_frontmatter",
        bindings: SCRIPT_ACTION_BINDINGS,
        code: `content.addFrontMatter({ created: new Date().toISOString() });`,
    },
    {
        labelKey: "script_example_route_by_context",
        bindings: SCRIPT_ACTION_BINDINGS,
        code: `if (context.kind === "meeting") {
  note.setTargetFolder("Meetings");
}`,
    },
    {
        labelKey: "script_example_vault_metrics",
        bindings: SCRIPT_ACTION_BINDINGS,
        code: `if (!zf.knowledge.ready()) return;

content.addFrontMatter({
  vault_notes: zf.knowledge.model().size(),
  vault_debt: zf.knowledge.debt().score,
});`,
    },
    {
        labelKey: "script_example_unexamined",
        bindings: SCRIPT_ACTION_BINDINGS,
        code: `if (!zf.knowledge.ready()) return;

const neglected = zf.knowledge.unexamined({ limit: 3 });
content.add("\\n" + neglected.map((entry) => "- [[" + entry.path + "]]").join("\\n"));`,
    },
    {
        labelKey: "script_example_ai_proposal",
        bindings: SCRIPT_ACTION_BINDINGS,
        code: `if (!zf.ai.available()) return;

const summary = await zf.ai.propose("Summarise this note in one sentence:\\n" + content.get(), {
  path: note.getFinalPath(),
  subject: "one-line-summary",
});
if (summary) content.addFrontMatter({ summary });`,
    },
];

export const DYNAMIC_SELECTOR_EXAMPLES: readonly ScriptExample[] = [
    {
        labelKey: "script_example_static_options",
        bindings: DYNAMIC_SELECTOR_BINDINGS,
        code: `return [
  ["home", "Home"],
  ["work", "Work"],
];`,
    },
    {
        labelKey: "script_example_folders",
        bindings: DYNAMIC_SELECTOR_BINDINGS,
        code: `return app.vault.getAllFolders().map((folder) => [folder.path, folder.name]);`,
    },
    {
        labelKey: "script_example_open_questions",
        bindings: DYNAMIC_SELECTOR_BINDINGS,
        code: `if (!zf.knowledge.ready()) return [];

return zf.knowledge.openQuestions().map((question) => [question.path, question.text]);`,
    },
];

export const HOOK_EXAMPLES: readonly ScriptExample[] = [
    {
        labelKey: "script_example_hook_timestamp",
        bindings: HOOK_BINDINGS,
        code: `event.response.frontmatter.modified = new Date().toISOString();
return event;`,
    },
    {
        labelKey: "script_example_hook_hub",
        bindings: HOOK_BINDINGS,
        code: `if (zf.knowledge.ready()) {
  const { groups } = zf.knowledge.neighbors(event.file.path);
  const degree = groups.reduce((sum, group) => sum + group.targets.length, 0);
  event.response.frontmatter.hub = degree >= 5;
}
return event;`,
    },
];

/** Every shipped example, for the guardrail that keeps them honest. */
export const ALL_SCRIPT_EXAMPLES: readonly ScriptExample[] = [
    ...SCRIPT_ACTION_EXAMPLES,
    ...DYNAMIC_SELECTOR_EXAMPLES,
    ...HOOK_EXAMPLES,
];
