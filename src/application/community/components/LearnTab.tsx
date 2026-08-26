import React from "react";
import { c } from "architecture";
import { t } from "architecture/lang";
import { PluginComponentProps } from "../typing";
import { REPO_URL } from "../githubContribute";

type LocaleKey = Parameters<typeof t>[0];

/** Published docs site (GitHub Pages). mkdocs uses directory URLs, so pages end in a trailing slash. */
const DOCS_BASE = "https://rafaelgb.github.io/Obsidian-ZettelFlow/";

interface Guide {
  icon: string;
  titleKey: LocaleKey;
  descKey: LocaleKey;
  url: string;
}

const GUIDES: Guide[] = [
  { icon: "🚀", titleKey: "community_learn_start_title", descKey: "community_learn_start_desc", url: DOCS_BASE },
  { icon: "📜", titleKey: "community_learn_manifesto_title", descKey: "community_learn_manifesto_desc", url: `${DOCS_BASE}manifesto/` },
  { icon: "🧩", titleKey: "community_learn_systems_title", descKey: "community_learn_systems_desc", url: `${DOCS_BASE}how-to-contribute/systems-gallery/` },
  { icon: "🤝", titleKey: "community_learn_contribute_title", descKey: "community_learn_contribute_desc", url: `${DOCS_BASE}how-to-contribute/community-examples/` },
  { icon: "⚙️", titleKey: "community_learn_actions_title", descKey: "community_learn_actions_desc", url: `${DOCS_BASE}actions/Prompt/` },
  { icon: "🧑‍💻", titleKey: "community_learn_api_title", descKey: "community_learn_api_desc", url: `${DOCS_BASE}api/cookbook/` },
  { icon: "🆕", titleKey: "community_learn_whatsnew_title", descKey: "community_learn_whatsnew_desc", url: `${REPO_URL}/releases` },
];

/**
 * The Learn panel (#294 S4): curated, in-app access to the docs guides + the manifesto. Plain
 * external links (open in the browser) — no docs content is fetched or rendered inside Obsidian.
 */
export function LearnTab(_props: PluginComponentProps) {
  return (
    <div className={c("community-learn")}>
      <p className={c("community-learn-intro")}>{t("community_learn_intro")}</p>
      <div className={c("community-learn-list")}>
        {GUIDES.map((guide) => (
          <a
            key={guide.titleKey}
            className={c("community-learn-card")}
            href={guide.url}
            target="_blank"
            rel="noopener"
            aria-label={t(guide.titleKey)}
          >
            <span className={c("community-learn-card-icon")} aria-hidden="true">
              {guide.icon}
            </span>
            <span className={c("community-learn-card-title")}>{t(guide.titleKey)}</span>
            <span className={c("community-learn-card-desc")}>{t(guide.descKey)}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
