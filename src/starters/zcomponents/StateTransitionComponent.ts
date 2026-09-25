import { App, MarkdownView, Notice, SuggestModal, TFile } from "obsidian";
import { PluginComponent } from "architecture";
import { FrontmatterService } from "architecture/plugin";
import { StateTransitionService } from "architecture/plugin/services/StateTransitionService";
import { t } from "architecture/lang";
import {
    DEFAULT_STATE_PROPERTY,
    LifecycleState,
    LifecycleStateSchema,
    STATE_EMOJI,
    STATE_LABEL_KEY,
    allowedTargets,
} from "architecture/knowledge/lifecycle";
import { buildLifecycleAliases } from "architecture/knowledge/lifecycleAliases";
import ZettelFlow from "main";

/** Picker over the valid target states for the active note. */
class StatePickerModal extends SuggestModal<LifecycleState> {
    constructor(
        app: App,
        private readonly targets: LifecycleState[],
        private readonly onPick: (state: LifecycleState) => void
    ) {
        super(app);
        this.setPlaceholder(t("state_transition_modal_title"));
    }

    getSuggestions(query: string): LifecycleState[] {
        const q = query.trim().toLowerCase();
        if (!q) return this.targets;
        return this.targets.filter(
            (state) => state.includes(q) || t(STATE_LABEL_KEY[state]).toLowerCase().includes(q)
        );
    }

    renderSuggestion(state: LifecycleState, el: HTMLElement): void {
        el.createDiv({ text: `${STATE_EMOJI[state]} ${t(STATE_LABEL_KEY[state])}` });
    }

    onChooseSuggestion(state: LifecycleState): void {
        this.onPick(state);
    }
}

/**
 * Registers the "change note state" command (#146): hidden unless a markdown note is active, it
 * offers only the transitions valid from the note's current state and delegates the write to
 * {@link StateTransitionService}.
 */
export class StateTransitionComponent extends PluginComponent {
    constructor(private plugin: ZettelFlow) {
        super(plugin);
    }

    onLoad(): void {
        this.plugin.addCommand({
            id: "change-note-state",
            name: t("command_change_note_state"),
            checkCallback: (checking: boolean) => {
                const file = this.plugin.app.workspace.getActiveViewOfType(MarkdownView)?.file;
                if (!file) return false;
                if (!checking) StateTransitionComponent.pickState(this.plugin, file);
                return true;
            },
        });
    }

    /**
     * The picker, exported so the **door** and the command share one implementation (#578).
     *
     * Changing a note's state was in the palette and nowhere else; Cultivate's target card shows
     * the state on a chip, which is the object the change is about, so the chip became the door.
     * Re-implementing the flow there would be two code paths for one capability — the duplication
     * this epic exists to remove — so both call this.
     *
     * A static rather than a free function so the modal and the settings read stay in one file
     * with the command that has always owned them.
     */
    static pickState(plugin: ZettelFlow, file: TFile): void {
        const stateProperty = plugin.settings?.lifecycle?.stateProperty || DEFAULT_STATE_PROPERTY;
        const schema = new LifecycleStateSchema(stateProperty, buildLifecycleAliases());
        const accessor = FrontmatterService.instance(file);
        const current = schema.parse({
            [stateProperty]: accessor.getProperty(stateProperty),
        }) as LifecycleState;
        const targets = allowedTargets(current);
        if (targets.length === 0) {
            new Notice(t("state_transition_no_targets"));
            return;
        }
        new StatePickerModal(plugin.app, targets, (target) => {
            // `human`: you picked the state yourself, so it is not an accepted proposal (#581).
            void StateTransitionService.getInstance().transition(
                accessor,
                stateProperty,
                schema,
                target,
                file.path,
                "human"
            );
        }).open();
    }
}
