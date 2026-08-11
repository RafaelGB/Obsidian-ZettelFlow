import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";
import { WORKFLOW_BLOCK_KINDS, BLOCK_LABEL_KEY } from "architecture/plugin/workflow/blocks";

/** The visual-workflow-language i18n keys added in #151 (WAIT prompt/authoring + WHEN authoring +
 * node menu + block labels). The in-canvas tooltip keys are asserted separately once T16 lands. */
const WORKFLOW_KEYS = [
    // WAIT prompt
    "workflow_wait_prompt_title",
    "workflow_wait_prompt_default_message",
    "workflow_wait_continue_button",
    "workflow_wait_cancel_button",
    // WAIT authoring
    "step_builder_wait_name",
    "step_builder_wait_desc",
    "step_builder_wait_message_name",
    "step_builder_wait_message_desc",
    // WHEN authoring
    "step_builder_trigger_name",
    "step_builder_trigger_desc",
    "step_builder_trigger_none",
    "step_builder_trigger_condition_name",
    "step_builder_trigger_condition_desc",
    // node menu
    "canvas_node_menu_mark_wait",
    "canvas_node_menu_unmark_wait",
    // in-canvas legibility tooltips
    "workflow_canvas_when_tooltip",
    "workflow_canvas_if_tooltip",
    "workflow_canvas_wait_tooltip",
    // block labels
    ...WORKFLOW_BLOCK_KINDS.map((kind) => BLOCK_LABEL_KEY[kind]),
];

describe("visual workflow language i18n parity (#151, AC-7)", () => {
    it("defines every new key in both en and es, non-empty", () => {
        expect(WORKFLOW_KEYS.length).toBe(22);
        const enMap = en as Record<string, string>;
        const esMap = es as Record<string, string>;
        for (const key of WORKFLOW_KEYS) {
            expect(typeof enMap[key]).toBe("string");
            expect(enMap[key].length).toBeGreaterThan(0);
            expect(typeof esMap[key]).toBe("string");
            expect(esMap[key].length).toBeGreaterThan(0);
        }
    });
});
