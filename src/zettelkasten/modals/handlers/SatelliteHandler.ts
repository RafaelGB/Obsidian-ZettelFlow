import { AbstractHandlerClass } from "architecture/patterns";
import { Setting } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import { FileSuggest, FolderSuggest } from "architecture/settings";
import { FileService } from "architecture/plugin";
import { SATELLITE_ERROR_KEYS } from "application/notes/satellitePlan";
import { SEMANTIC_RELATION_TYPES } from "architecture/knowledge/relations/vocabulary";
import { AbstractStepModal } from "../AbstractStepModal";
import { OptionalToggleHandler } from "./OptionalToggleHandler";
import { satelliteFormState, satelliteFromForm } from "./satelliteForm";

type LocaleKey = Parameters<typeof t>[0];

/** The #147 vocabulary's own labels — one list, already translated, no second copy. */
const RELATION_LABEL_KEYS: Record<string, LocaleKey> = {
    supports: "relation_type_supports",
    contradicts: "relation_type_contradicts",
    expands: "relation_type_expands",
    "inspired-by": "relation_type_inspired_by",
    question: "relation_type_question",
    example: "relation_type_example",
    implements: "relation_type_implements",
};

/**
 * Authors the step's **linked note** (#419): the second, related note this step also creates.
 *
 * A form, not a YAML block. The first cut of this feature followed the `trigger`/`wait`/`onCreation`
 * precedent and expected the author to hand-edit configuration — which nobody does, however well it
 * is documented. That is now a rule rather than a taste ([constitution §XIII](../../../../docs/development/constitution.md)):
 * a capability is authored from the interface that owns it, with working defaults, and the YAML is
 * only what the form writes.
 *
 * Everything the engine reads is expressible here — template, title pattern, folder, relation type
 * and direction — because a half-authorable capability is exactly what sends people back to the file.
 */
export class SatelliteHandler extends AbstractHandlerClass<AbstractStepModal> {
    name = t("step_builder_satellite_heading");
    description = t("step_builder_satellite_desc");

    handle(modal: AbstractStepModal): AbstractStepModal {
        // An editor flow inserts into a note that already exists; `buildEditor` creates nothing, so
        // it would never honour a linked note. Offering the control there would be a lie — the same
        // reason TargetFolderSuggesterHandler hides the destination in this mode.
        if (modal.builder === "editor") return this.goNext(modal);

        const { info } = modal;
        const { contentEl } = info;
        const state = satelliteFormState(info.satellite);

        new Setting(modal.groupEl("writes")).setName(this.name).setDesc(this.description).setHeading();

        // The fields live in their own container so the toggle can reveal or hide them as a block.
        const fields = contentEl.createDiv({ cls: c("satellite-fields") });
        const errorEl = fields.createDiv({ cls: c("satellite-error") });

        const apply = () => {
            info.satellite = satelliteFromForm(state);
            const refreshed = satelliteFormState(info.satellite);
            errorEl.setText(refreshed.error ? t(SATELLITE_ERROR_KEYS[refreshed.error]) : "");
            fields.toggleClass(c("is-hidden"), !state.enabled);
        };

        new Setting(modal.groupEl("writes"))
            .setName(t("step_builder_satellite_enable_name"))
            .setDesc(t("step_builder_satellite_enable_desc"))
            .addToggle((toggle) =>
                toggle.setValue(state.enabled).onChange((value) => {
                    state.enabled = value;
                    apply();
                })
            );

        new Setting(fields)
            .setName(t("step_builder_satellite_template_name"))
            .setDesc(t("step_builder_satellite_template_desc"))
            .addSearch((search) => {
                // Suggest from the vault root: a template lives wherever the author keeps them.
                new FileSuggest(search.inputEl, FileService.PATH_SEPARATOR);
                search
                    .setPlaceholder(t("step_builder_satellite_template_placeholder"))
                    .setValue(state.template)
                    .onChange((value) => {
                        state.template = value;
                        apply();
                    });
            });

        new Setting(fields)
            .setName(t("step_builder_satellite_title_name"))
            .setDesc(t("step_builder_satellite_title_desc"))
            .addText((text) =>
                text.setValue(state.title).onChange((value) => {
                    state.title = value;
                    apply();
                })
            );

        new Setting(fields)
            .setName(t("step_builder_satellite_folder_name"))
            .setDesc(t("step_builder_satellite_folder_desc"))
            .addSearch((search) => {
                new FolderSuggest(search.inputEl);
                search
                    .setPlaceholder(t("satellite_summary_folder_inherited"))
                    .setValue(state.folder)
                    .onChange((value) => {
                        state.folder = value;
                        apply();
                    });
            });

        new Setting(fields)
            .setName(t("step_builder_satellite_relation_name"))
            .setDesc(t("step_builder_satellite_relation_desc"))
            .addDropdown((dropdown) => {
                for (const type of SEMANTIC_RELATION_TYPES) {
                    dropdown.addOption(type, t(RELATION_LABEL_KEYS[type]));
                }
                dropdown.setValue(state.type).onChange((value) => {
                    state.type = value;
                    apply();
                });
            })
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("satellite-to-main", t("step_builder_satellite_direction_from"))
                    .addOption("main-to-satellite", t("step_builder_satellite_direction_to"))
                    .setValue(state.direction)
                    .onChange((value) => {
                        state.direction = value === "main-to-satellite" ? value : "satellite-to-main";
                        apply();
                    })
            );

        // Paint the initial state (hidden when off) without writing anything the author did not.
        fields.toggleClass(c("is-hidden"), !state.enabled);
        errorEl.setText(state.error ? t(SATELLITE_ERROR_KEYS[state.error]) : "");

        return this.goNext(modal);
    }

    public manageNextHandler(): void {
        this.nextHandler = new OptionalToggleHandler();
    }
}
