import { AbstractHandlerClass } from "architecture/patterns";
import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { TargetFolderSuggesterHandler } from "./TargetFolderSuggesterHandler";
import { AbstractStepModal } from "../AbstractStepModal";
import { WIRED_EVENTS, EVENT_LABEL_KEY, isWiredEvent } from "architecture/plugin/events";
import { lowerWhenToTrigger } from "architecture/plugin/workflow";

/** Sentinel dropdown value for "no trigger" — clears the WHEN binding (the flow stays manual). */
const NO_TRIGGER = "__manual__";

/**
 * Authors the WHEN block (#151) — a root step's event trigger, first-class in the builder (the piece
 * #150 deferred). Renders only for the root step; picks a wired vault event (or "manual"), plus an
 * optional `zf` condition. Writes `info.trigger` via `lowerWhenToTrigger`, the identity map onto the
 * #150 trigger the engine already consumes (one execution path).
 */
export class StepTriggerHandler extends AbstractHandlerClass<AbstractStepModal> {
    name = t("step_builder_trigger_name");
    description = t("step_builder_trigger_desc");

    handle(modal: AbstractStepModal): AbstractStepModal {
        const { info } = modal;
        // WHEN is root-only: a non-root step never triggers a flow.
        if (!info.root) return this.goNext(modal);

        const { contentEl } = info;
        let condition = info.trigger?.condition ?? "";
        const applyEvent = (value: string) => {
            if (!isWiredEvent(value)) {
                info.trigger = undefined;
                return;
            }
            info.trigger = lowerWhenToTrigger({
                event: value,
                ...(condition ? { condition } : {}),
            });
        };

        new Setting(contentEl)
            .setName(this.name)
            .setDesc(this.description)
            .addDropdown((dropdown) => {
                dropdown.addOption(NO_TRIGGER, t("step_builder_trigger_none"));
                for (const event of WIRED_EVENTS) {
                    dropdown.addOption(event, t(EVENT_LABEL_KEY[event]));
                }
                dropdown
                    .setValue(info.trigger?.event ?? NO_TRIGGER)
                    .onChange((value) => applyEvent(value));
            });

        new Setting(contentEl)
            .setName(t("step_builder_trigger_condition_name"))
            .setDesc(t("step_builder_trigger_condition_desc"))
            .addText((text) =>
                text.setValue(condition).onChange((value) => {
                    condition = value.trim();
                    if (info.trigger) applyEvent(info.trigger.event);
                })
            );

        return this.goNext(modal);
    }

    public manageNextHandler(): void {
        this.nextHandler = new TargetFolderSuggesterHandler();
    }
}
