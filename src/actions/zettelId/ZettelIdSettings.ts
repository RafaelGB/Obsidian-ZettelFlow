import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { Action, ActionSetting } from "architecture/api";
import { navbarAction } from "architecture/components/settings";
import { ZettelIdElement } from "zettelkasten";

export const zettelIdSettings: ActionSetting = (contentEl, modal, action, disableNavbar) => {
    const name = t("step_builder_element_type_zettel_id_title");
    const description = t("step_builder_element_type_zettel_id_description");
    navbarAction(contentEl, name, description, action, modal, disableNavbar);
    zettelIdDetails(contentEl.createDiv(), action);
};

export function zettelIdDetails(contentEl: HTMLElement, action: Action, readonly = false): void {
    const el = action as ZettelIdElement;

    // Strategy dropdown — keep a reference to the folgezettel section so we
    // can show/hide it reactively.
    let strategyEl: HTMLElement | undefined;

    new Setting(contentEl)
        .setName(t("zettel_id_strategy_title"))
        .setDesc(t("zettel_id_strategy_description"))
        .addDropdown((dd) => {
            dd.addOption("timestamp", t("zettel_id_strategy_timestamp"))
              .addOption("folgezettel", t("zettel_id_strategy_folgezettel"))
              .setDisabled(readonly)
              .setValue(el.strategy ?? "timestamp")
              .onChange((val) => {
                  action.strategy = val;
                  if (strategyEl) {
                      if (val === "folgezettel") {
                          strategyEl.removeClass("zettelkasten-flow__is-hidden");
                          tsFormatSetting.settingEl.addClass("zettelkasten-flow__is-hidden");
                      } else {
                          strategyEl.addClass("zettelkasten-flow__is-hidden");
                          tsFormatSetting.settingEl.removeClass("zettelkasten-flow__is-hidden");
                      }
                  }
              });
        });

    // Frontmatter key
    new Setting(contentEl)
        .setName(t("zettel_id_key_title"))
        .setDesc(t("zettel_id_key_description"))
        .addText((text) => {
            text.setDisabled(readonly)
                .setValue(el.key ?? "id")
                .setPlaceholder("ID")
                .onChange((val) => { action.key = val; });
        });

    // Write targets
    new Setting(contentEl)
        .setName(t("zettel_id_write_frontmatter_title"))
        .setDesc(t("zettel_id_write_frontmatter_description"))
        .addToggle((toggle) => {
            toggle.setDisabled(readonly)
                  .setValue(el.writeFrontmatter ?? true)
                  .onChange((val) => { action.writeFrontmatter = val; });
        });

    new Setting(contentEl)
        .setName(t("zettel_id_write_filename_title"))
        .setDesc(t("zettel_id_write_filename_description"))
        .addToggle((toggle) => {
            toggle.setDisabled(readonly)
                  .setValue(el.writeFilename ?? false)
                  .onChange((val) => { action.writeFilename = val; });
        });

    // Timestamp format (shown only when strategy === "timestamp")
    const tsFormatSetting = new Setting(contentEl)
        .setName(t("zettel_id_timestamp_format_title"))
        .setDesc(t("zettel_id_timestamp_format_description"))
        .addText((text) => {
            text.setDisabled(readonly)
                .setValue(el.timestampFormat ?? "YYYYMMDDHHmm")
                .onChange((val) => { action.timestampFormat = val; });
        });

    // Folgezettel section (conditionally shown)
    strategyEl = contentEl.createDiv();
    const isFolgezettel = (el.strategy ?? "timestamp") === "folgezettel";
    if (!isFolgezettel) {
        strategyEl.addClass("zettelkasten-flow__is-hidden");
    } else {
        tsFormatSetting.settingEl.addClass("zettelkasten-flow__is-hidden");
    }

    // Parent ID input (folgezettel only)
    new Setting(strategyEl)
        .setName(t("zettel_id_parent_title"))
        .setDesc(t("zettel_id_parent_description"))
        .addText((text) => {
            text.setDisabled(readonly)
                .setValue(el.parent ?? "")
                .setPlaceholder("E.g. 21")
                .onChange((val) => { action.parent = val || undefined; });
        });

    // Relationship dropdown (folgezettel only)
    new Setting(strategyEl)
        .setName(t("zettel_id_relationship_title"))
        .setDesc(t("zettel_id_relationship_description"))
        .addDropdown((dd) => {
            dd.addOption("child", t("zettel_id_relationship_child"))
              .addOption("sibling", t("zettel_id_relationship_sibling"))
              .setDisabled(readonly)
              .setValue(el.relationship ?? "child")
              .onChange((val) => { action.relationship = val; });
        });
}
