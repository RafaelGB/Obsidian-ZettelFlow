import React, { useState } from "react";
import { FileService } from "architecture/plugin";
import { c } from "architecture";
import { t } from "architecture/lang";
import { Icon } from "architecture/components/icon";
import { ZETTELFLOW_ICON } from "config/brand";
import { TutorialType } from "./typing";
import { createExampleFlow } from "application/notes/onboardingService";
import { CommunityTemplatesModal } from "application/community/CommunityTemplatesModal";

type LocaleKey = Parameters<typeof t>[0];

/** The three ways in, as cards that say what each one does (#684). Literal keys for the guardrail. */
const WAYS: { title: LocaleKey; detail: LocaleKey; icon: string }[] = [
    { title: "onboarding_way_system_title", detail: "onboarding_way_system_detail", icon: "layout-grid" },
    { title: "onboarding_way_example_title", detail: "onboarding_way_example_detail", icon: "sparkles" },
    { title: "onboarding_way_own_title", detail: "onboarding_way_own_detail", icon: "pencil-ruler" },
];

/**
 * **The first-run screen** (#684): what ZettelFlow is in one sentence, and the three ways in.
 *
 * It used to be a paragraph and four equal buttons, two of which (open the settings, open a canvas)
 * led somewhere that did not explain itself. Now there are two actions — browse the systems,
 * rehearsed before they install, or create the example flow — and the third way, drawing your own,
 * is told rather than buttoned, because it starts in a canvas, not here.
 */
export function WelcomeTutorial({ plugin, modal }: TutorialType) {
    const [isCreating, setIsCreating] = useState(false);
    // On-surface, so the failure is an inline line rather than a toast (#546 C1): the button used to
    // fail silently — you clicked, nothing happened, and nothing was said (#546 C3).
    const [failed, setFailed] = useState(false);

    const handleCreateExample = async () => {
        setIsCreating(true);
        setFailed(false);
        const path = await createExampleFlow(plugin);
        setIsCreating(false);
        if (path) {
            await FileService.openFile(path);
            modal.close();
        } else {
            setFailed(true);
        }
    };

    return (
        <div className={c("welcome")}>
            <Icon name={ZETTELFLOW_ICON} className={c("welcome-logo")} />
            <div className={c("welcome-header")}>
                <h2 className={c("welcome-title")}>{t("onboarding_welcome_title")}</h2>
                <p className={c("welcome-tagline")}>{t("onboarding_welcome_tagline")}</p>
            </div>
            <ul className={c("welcome-ways")}>
                {WAYS.map((way) => (
                    <li className={c("welcome-way")} key={way.title}>
                        <Icon name={way.icon} className={c("welcome-way-icon")} />
                        <span className={c("welcome-way-title")}>{t(way.title)}</span>
                        <span className={c("welcome-way-detail")}>{t(way.detail)}</span>
                    </li>
                ))}
            </ul>
            <div className={c("welcome-actions")}>
                <button
                    className="mod-cta"
                    onClick={() => {
                        modal.close();
                        new CommunityTemplatesModal(plugin).open();
                    }}
                >
                    {t("onboarding_browse_systems")}
                </button>
                <button
                    title={t("onboarding_create_example_tooltip")}
                    onClick={() => void handleCreateExample()}
                    disabled={isCreating}
                >
                    {t("onboarding_create_example")}
                </button>
            </div>
            {failed && (
                <p className={c("welcome-error")} role="alert">
                    {t("onboarding_create_example_failed")}
                </p>
            )}
            <div className={c("welcome-footer")}>
                <a
                    href="https://rafaelgb.github.io/Obsidian-ZettelFlow/"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    {t("onboarding_open_docs")}
                </a>
            </div>
        </div>
    );
}
