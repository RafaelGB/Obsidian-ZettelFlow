import React, { useState } from "react";
import { FileService } from "architecture/plugin";
import { c } from "architecture";
import { t } from "architecture/lang";
import { TutorialType } from "./typing";
import { createExampleFlow } from "application/notes/onboardingService";

export function WelcomeTutorial({ plugin, modal }: TutorialType) {
    const { settings } = plugin;
    const { ribbonCanvas } = settings;
    const [isCreating, setIsCreating] = useState(false);

    const handleCreateExample = async () => {
        setIsCreating(true);
        const path = await createExampleFlow(plugin);
        setIsCreating(false);
        if (path) {
            await FileService.openFile(path);
            modal.close();
        }
    };

    return (
        <div className={c("welcome")}>
            <div className={c("welcome-header")}>
                <h2 className={c("welcome-title")}>{t("onboarding_welcome_title")}</h2>
                <p className={c("welcome-tagline")}>{t("onboarding_welcome_tagline")}</p>
            </div>
            <p className={c("welcome-what-is")}>{t("onboarding_what_is")}</p>
            <div className={c("welcome-actions")}>
                <button
                    className={`${c("welcome-btn")} ${c("welcome-btn--primary")}`}
                    aria-label={t("onboarding_create_example_tooltip")}
                    onClick={() => void handleCreateExample()}
                    disabled={isCreating}
                >
                    {t("onboarding_create_example")}
                </button>
                <button
                    className={c("welcome-btn")}
                    onClick={() => {
                        plugin.app.setting.open();
                        plugin.app.setting.openTabById("zettelflow");
                    }}
                >
                    {t("welcome_tutorial_open_settings")}
                </button>
                {ribbonCanvas && (
                    <button
                        className={c("welcome-btn")}
                        onClick={() => {
                            void (async () => {
                                await FileService.openFile(ribbonCanvas);
                                modal.close();
                            })();
                        }}
                    >
                        {t("welcome_tutorial_open_canvas")}
                    </button>
                )}
            </div>
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
