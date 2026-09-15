import { AbstractHandlerClass } from "architecture/patterns";
import { Setting } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import { SATELLITE_ERROR_KEYS } from "application/notes/satellitePlan";
import { AbstractStepModal } from "../AbstractStepModal";
import { OptionalToggleHandler } from "./OptionalToggleHandler";
import { satelliteSummary } from "./satelliteSummary";

type LocaleKey = Parameters<typeof t>[0];

/**
 * Shows the step's **linked note** declaration and states its defects (#419, FR-12).
 *
 * Read-only on purpose: the declaration is authored in YAML/frontmatter in v1, exactly like
 * `trigger` (#150), `wait` (#151) and `onCreation` (#170). What this adds is what those three lack —
 * a defect is reported **here, while authoring**, instead of at build time, so the plugin never
 * manufactures the knowledge debt its own Health surface would then report.
 *
 * Renders nothing at all for a step that declares no linked note.
 */
export class SatelliteSummaryHandler extends AbstractHandlerClass<AbstractStepModal> {
    name = t("step_builder_satellite_heading");
    description = t("step_builder_satellite_desc");

    handle(modal: AbstractStepModal): AbstractStepModal {
        const { info } = modal;
        const summary = satelliteSummary(info.satellite);
        if (!summary) return this.goNext(modal);

        const { contentEl } = info;
        new Setting(contentEl).setName(this.name).setHeading();

        const list = contentEl.createDiv({ cls: c("satellite-summary") });
        for (const row of summary.rows) {
            const entry = list.createDiv({ cls: c("satellite-summary-row") });
            entry.createSpan({ cls: c("satellite-summary-label"), text: t(row.label as LocaleKey) });
            // A declared value is literal text; a placeholder is a locale key.
            entry.createSpan({
                cls: c("satellite-summary-value"),
                text: row.value.startsWith("satellite_summary_")
                    ? t(row.value as LocaleKey)
                    : row.value,
            });
        }

        if (summary.error) {
            list.createDiv({
                cls: c("satellite-summary-error"),
                text: t(SATELLITE_ERROR_KEYS[summary.error]),
            });
        }

        return this.goNext(modal);
    }

    public manageNextHandler(): void {
        this.nextHandler = new OptionalToggleHandler();
    }
}
