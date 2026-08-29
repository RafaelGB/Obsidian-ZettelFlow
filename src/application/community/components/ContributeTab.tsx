import React from "react";
import { Notice } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import { PluginComponentProps } from "../typing";
import { buildActiveCanvasTemplate, downloadTemplate } from "../shareSystem";
import {
  DISCUSSIONS_URL,
  MAX_PREFILL_URL,
  bugReportFields,
  newIssueUrl,
} from "../githubContribute";

type LocaleKey = Parameters<typeof t>[0];

interface ContributeCard {
  icon: string;
  titleKey: LocaleKey;
  descKey: LocaleKey;
  onClick: () => void;
}

/**
 * The Contribute panel (#294 S3): first-class participation, entirely through GitHub (no backend).
 * Share the active canvas as a system, suggest an idea, report a bug (with auto-filled environment),
 * or open Discussions. Each card opens a prefilled GitHub flow in the browser.
 */
export function ContributeTab(props: PluginComponentProps) {
  const { plugin } = props;

  const shareSystem = async () => {
    const built = await buildActiveCanvasTemplate(plugin);
    if (!built) {
      new Notice(t("community_contribute_share_no_canvas"), 6000);
      return;
    }
    const inlineUrl = newIssueUrl("ADD_TEMPLATE.yaml", {
      "template-type": "System",
      description: t("community_contribute_share_prefill_desc", built.name),
      "json-template": built.json,
    });
    if (inlineUrl.length <= MAX_PREFILL_URL) {
      window.open(inlineUrl, "_blank");
      return;
    }
    // Too large to prefill in the URL — download the file and open the form with a paste hint.
    downloadTemplate(built.name, built.json);
    new Notice(t("community_contribute_share_downloaded"));
    window.open(
      newIssueUrl("ADD_TEMPLATE.yaml", {
        "template-type": "System",
        description: t("community_contribute_share_paste_hint"),
      }),
      "_blank"
    );
  };

  const cards: ContributeCard[] = [
    {
      icon: "🧩",
      titleKey: "community_contribute_share_title",
      descKey: "community_contribute_share_desc",
      onClick: () => void shareSystem(),
    },
    {
      icon: "💡",
      titleKey: "community_contribute_idea_title",
      descKey: "community_contribute_idea_desc",
      onClick: () => window.open(newIssueUrl("feature_request.yaml"), "_blank"),
    },
    {
      icon: "🐞",
      titleKey: "community_contribute_bug_title",
      descKey: "community_contribute_bug_desc",
      onClick: () =>
        window.open(newIssueUrl("bug_report.yaml", bugReportFields(plugin)), "_blank"),
    },
    {
      icon: "💬",
      titleKey: "community_contribute_discuss_title",
      descKey: "community_contribute_discuss_desc",
      onClick: () => window.open(DISCUSSIONS_URL, "_blank"),
    },
  ];

  return (
    <div className={c("community-contribute")}>
      <p className={c("community-contribute-intro")}>{t("community_contribute_intro")}</p>
      <div className={c("community-contribute-list")}>
        {cards.map((card) => (
          <button
            key={card.titleKey}
            className={c("community-contribute-card")}
            onClick={card.onClick}
            aria-label={t(card.titleKey)}
          >
            <span className={c("community-contribute-card-icon")} aria-hidden="true">
              {card.icon}
            </span>
            <span className={c("community-contribute-card-body")}>
              <span className={c("community-contribute-card-title")}>{t(card.titleKey)}</span>
              <span className={c("community-contribute-card-desc")}>{t(card.descKey)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
