import { moment as obsidianMoment, Setting } from "obsidian";
import type MomentFn from "moment";
import { t } from "architecture/lang";
import { c, ObsidianApi } from "architecture";
import {
    POLICY_DESCRIPTION_KEY,
    POLICY_LABEL_KEY,
    SCRIPT_ERROR_POLICIES,
    type ScriptErrorPolicy,
} from "./errorPolicy";
import { failureSummary } from "./scriptRunLog";

/** Obsidian re-exports moment without its call signature; the app's own tabs do the same cast. */
const moment = obsidianMoment as unknown as typeof MomentFn;

type LocaleKey = Parameters<typeof t>[0];

/** A script that carries a policy and can be identified in the log. */
export interface PolicyHolder {
    id?: string;
    onError?: ScriptErrorPolicy;
}

/**
 * The one form that asks *what should happen if this fails* (#445), next to the script it is
 * about — and, under it, what has actually happened: how often this script has failed and when,
 * read from the run log (#444) rather than counted again somewhere else.
 */
export function renderErrorPolicy(contentEl: HTMLElement, script: PolicyHolder): void {
    const setting = new Setting(contentEl)
        .setName(t("script_policy_name"))
        .setDesc(t("script_policy_desc"))
        .addDropdown((dropdown) => {
            for (const policy of SCRIPT_ERROR_POLICIES) {
                dropdown.addOption(policy, t(POLICY_LABEL_KEY[policy] as LocaleKey));
            }
            dropdown.setValue(script.onError ?? "notify").onChange((value) => {
                script.onError = value as ScriptErrorPolicy;
                paintDescription(value as ScriptErrorPolicy);
            });
        });

    const explanation = setting.descEl.createDiv({ cls: c("script-policy-explanation") });
    const paintDescription = (policy: ScriptErrorPolicy) => {
        explanation.textContent = t(POLICY_DESCRIPTION_KEY[policy] as LocaleKey);
    };
    paintDescription(script.onError ?? "notify");

    renderFailures(setting, script.id);
}

/** What this script has actually done lately. Absent when it has never failed. */
function renderFailures(setting: Setting, ref: string | undefined): void {
    if (!ref) return;
    const runs = ObsidianApi.getOwnPlugin()?.settings.scriptLog?.runs ?? [];
    const summary = failureSummary(runs, ref);
    if (summary.count === 0) return;
    setting.descEl.createDiv({
        cls: c("script-policy-failures"),
        text: t(
            "script_failures_summary",
            String(summary.count),
            summary.lastAt ? moment(summary.lastAt).fromNow() : ""
        ),
    });
}
