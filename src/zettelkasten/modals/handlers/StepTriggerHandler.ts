import { AbstractHandlerClass } from "architecture/patterns";
import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { c } from "architecture";
import { FileService } from "architecture/plugin";
import { TargetFolderSuggesterHandler } from "./TargetFolderSuggesterHandler";
import { AbstractStepModal } from "../AbstractStepModal";
import { WIRED_EVENTS, EVENT_LABEL_KEY, isWiredEvent } from "architecture/plugin/events";
import { triggerSurface } from "architecture/plugin/events/triggerSurface";
import { flowFolders, flowRole } from "architecture/plugin/canvas/flowRole";
import { lowerWhenToTrigger } from "architecture/plugin/workflow";

/** Sentinel dropdown value for "no trigger" — clears the WHEN binding (the flow stays manual). */
const NO_TRIGGER = "__manual__";

/**
 * Authors the WHEN block (#151) — a root step's event trigger, first-class in the builder (the piece
 * #150 deferred). Picks a wired vault event (or "manual"), plus an optional `zf` condition. Writes
 * `info.trigger` via `lowerWhenToTrigger`, the identity map onto the #150 trigger the engine already
 * consumes (one execution path).
 *
 * **Where** it renders is #436's rule: only on the root of an **event flow**, because that is the
 * only place the engine ever reads a trigger from. Anywhere else the section does not exist — and a
 * trigger that is already stored is shown regardless, with the reason it cannot fire, so nobody's
 * configuration becomes invisible.
 */
export class StepTriggerHandler extends AbstractHandlerClass<AbstractStepModal> {
    name = t("step_builder_trigger_name");
    description = t("step_builder_trigger_desc");

    handle(modal: AbstractStepModal): AbstractStepModal {
        const { info } = modal;
        const surface = triggerSurface({
            role: this.roleOfCanvas(modal),
            isRoot: Boolean(info.root),
            hasTrigger: Boolean(info.trigger),
        });
        if (surface === "none") return this.goNext(modal);

        if (surface === "make-root") {
            // The offer stays reachable: one click makes this step the start, which is what the
            // trigger needs, instead of a switch that would never be read.
            new Setting(modal.groupEl("when"))
                .setName(this.name)
                .setDesc(t("step_builder_trigger_root_only"))
                .addButton((button) =>
                    button.setButtonText(t("step_builder_trigger_make_root")).onClick(() => {
                        info.root = true;
                        info.optional = false;
                        modal.refresh();
                    })
                );
            return this.goNext(modal);
        }

        if (surface === "orphan") {
            // Configuration that exists is never hidden from the person who wrote it.
            new Setting(modal.groupEl("when"))
                .setName(this.name)
                .setDesc(t("step_builder_trigger_cannot_fire"))
                .addButton((button) =>
                    button.setButtonText(t("step_builder_trigger_remove")).onClick(() => {
                        info.trigger = undefined;
                        modal.refresh();
                    })
                )
                .settingEl.addClass(c("step-trigger-orphan"));
            return this.goNext(modal);
        }

        
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

        new Setting(modal.groupEl("when"))
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

        new Setting(modal.groupEl("when"))
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

    /**
     * The role of the canvas this step lives on. A step note opened from the file menu has no
     * canvas to ask about — `unknown` keeps the offer where it might still be honoured.
     */
    private roleOfCanvas(modal: AbstractStepModal): ReturnType<typeof flowRole> | "unknown" {
        const { info } = modal;
        if (modal.mode !== "embed" || !info.folder || !info.filename) return "unknown";
        const path = info.folder.path
            .concat(FileService.PATH_SEPARATOR)
            .concat(info.filename)
            .concat(".canvas");
        return flowRole(path, flowFolders(modal.getPlugin().settings));
    }

    public manageNextHandler(): void {
        this.nextHandler = new TargetFolderSuggesterHandler();
    }
}
