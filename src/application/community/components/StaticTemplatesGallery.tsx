import React, { useState, useEffect, useRef, useMemo } from "react";
import { Notice } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { StaticTemplateOptions, SystemDifficulty } from "config";
import { resolveSystemDifficulty } from "../systemDifficulty";
import { REPO_URL } from "../githubContribute";
import { PluginComponentProps } from "../typing";

type TemplateFilter = "all" | "step" | "action" | "markdown" | "flow" | "system";
type DifficultyFilter = "all" | SystemDifficulty;

/** Filter type → its button label i18n key. */
const FILTER_LABEL_KEYS: Record<TemplateFilter, Parameters<typeof t>[0]> = {
  all: "community_templates_filter_all",
  system: "community_templates_type_system",
  step: "community_templates_type_step",
  action: "community_templates_type_action",
  markdown: "community_templates_type_markdown",
  flow: "community_templates_type_template",
};

/** GitHub handles have no spaces; a free-text author name is shown as plain text instead of a link. */
function authorProfileUrl(author: string): string | null {
  const handle = author.trim();
  return handle.length > 0 && !/\s/.test(handle) ? `https://github.com/${handle}` : null;
}
import { CommunityActionModal } from "../CommunityActionModal";
import { CommunityStepModal } from "../CommunityStepModal";
import { CommunityMarkdownModal } from "../CommunityMarkdownModal";
import { CommunityFlowModal } from "../CommunityFlowModal";
import { CommunitySystemModal } from "../CommunitySystemModal";
import {
  fetchActionTemplate,
  fetchCommunityTemplates,
  fetchFlowTemplate,
  fetchMarkdownTemplate,
  fetchStepTemplate,
  fetchSystemTemplate,
} from "../services/CommunityHttpClientService";

export function StaticTemplatesGallery(props: PluginComponentProps) {
  const { plugin } = props;
  const { steps, actions } = plugin.settings.installedTemplates;

  // Estados
  const [searchTerm, setSearchTerm] = useState("");
  const [targetSearchTerm, setTargetSearchTerm] = useState("");
  // Systems are the primary adoption path (#231 Phase 1): the browser leads with them.
  const [filter, setFilter] = useState<TemplateFilter>("system");
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("all");
  const [templates, setTemplates] = useState<StaticTemplateOptions[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Ref para debouncing en búsqueda
  const searchTimeoutRef = useRef<number | null>(null);

  // Reinicia las plantillas al cambiar el término o el filtro
  useEffect(() => {
    setTemplates([]);
  }, [targetSearchTerm, filter]);

  // Carga de datos
  useEffect(() => {
    const getData = async () => {
      try {
        setIsLoading(true);
        const response = await fetchCommunityTemplates();
        setTemplates((prev) => [...prev, ...response]);
      } catch (error) {
        log.error("Error fetching community templates:", error);
      } finally {
        setIsLoading(false);
      }
    };

    void getData();
  }, [targetSearchTerm, filter, plugin.settings]);

  // Filtrado usando useMemo
  const filteredTemplates = useMemo(() => {
    const lowerCaseSearchTerm = targetSearchTerm.toLowerCase();
    return templates.filter((template) => {
      const matchesSearch =
        template.title.toLowerCase().includes(lowerCaseSearchTerm) ||
        template.description.toLowerCase().includes(lowerCaseSearchTerm) ||
        template.author.toLowerCase().includes(lowerCaseSearchTerm);
      const matchesFilter =
        filter === "all" || template.template_type === filter;
      const matchesDifficulty =
        difficulty === "all" || resolveSystemDifficulty(template) === difficulty;
      // Legacy "flow" entries are superseded by one-click systems (#231 Phase 1) — kept in the
      // catalog for back-compat but hidden from the browser (consolidate & hide).
      const isLegacyFlow = template.template_type === "flow";
      return matchesSearch && matchesFilter && matchesDifficulty && !isLegacyFlow;
    });
  }, [templates, targetSearchTerm, filter, difficulty]);

  // Limpieza del timeout al desmontar
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  // Handlers
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = window.setTimeout(() => {
      setTargetSearchTerm(e.target.value);
    }, 400);
  };

  const handleSetFilter = (value: TemplateFilter) => {
    setFilter(value);
  };

  const isTemplateInstalled = (template: StaticTemplateOptions) => {
    if (template.template_type === "step") {
      return !!steps[template.id];
    } else if (template.template_type === "action") {
      return !!actions[template.id];
    }
    return false;
  };

  const handleRefresh = () => {
    // Forzamos una actualización (por ejemplo, tras instalar)
    setTemplates([...templates]);
  };

  const handleTemplateClick = async (template: StaticTemplateOptions) => {
    try {
      switch (template.template_type) {
        case "step": {
          const step = await fetchStepTemplate(template.ref);
          new CommunityStepModal(plugin, step, handleRefresh).open();
          break;
        }
        case "action": {
          const action = await fetchActionTemplate(template.ref);
          new CommunityActionModal(plugin, action).open();
          break;
        }
        case "markdown": {
          const markdown = await fetchMarkdownTemplate(template.ref);
          const filename = template.ref.split("/").pop();

          if (!filename) {
            throw new Error("Invalid markdown template filename");
          }

          new CommunityMarkdownModal(
            plugin,
            markdown,
            template.title,
            template.description,
            filename
          ).open();
          break;
        }
        case "flow": {
          const flow = await fetchFlowTemplate(template.ref);
          new CommunityFlowModal(plugin, flow, template.ref, () => {}).open();
          break;
        }
        case "system": {
          const system = await fetchSystemTemplate(template.ref);
          new CommunitySystemModal(plugin, system, template.ref).open();
          break;
        }
        default: {
          // Handle unexpected template types
          log.warn(`Unknown template type: ${String(template.template_type)}`);
          new Notice(t("community_templates_unknown_type"));
        }
      }
    } catch (error) {
      log.error(`Error processing ${template.template_type} template:`, error);
      new Notice(t("community_templates_open_failed", template.title));
    }
  };

  // Mapping of filter types to CSS classes
  const FILTER_COLORS: Record<TemplateFilter, string> = {
    all: "template-type-all",
    step: "template-type-step",
    action: "template-type-action",
    markdown: "template-type-markdown",
    flow: "template-type-flow",
    system: "template-type-system",
  };

  return (
    <div className={c("community-templates-gallery")}>
      <div className={c("community-templates-controls")}>
        <input
          type="text"
          placeholder={t("community_templates_search_placeholder")}
          value={searchTerm}
          onChange={handleSearchChange}
          className={c("community-templates-search")}
          aria-label={t("community_templates_search_placeholder")}
        />
        <div className={c("community-templates-filters")}>
          {(["system", "all", "step", "action", "markdown"] as const).map(
            (type) => {
              const classesToApply = [
                "community-templates-filter-button",
                FILTER_COLORS[type],
              ];
              if (filter === type)
                classesToApply.push(
                  "community-templates-filter-button-is-active"
                );
              return (
                <button
                  key={type}
                  onClick={() => handleSetFilter(type)}
                  className={c(...classesToApply)}
                  aria-pressed={filter === type}
                >
                  {t(FILTER_LABEL_KEYS[type])}
                </button>
              );
            }
          )}
        </div>
      </div>

      <div className={c("community-templates-difficulty-filter")}>
        <span className={c("community-templates-difficulty-label")}>
          {t("community_templates_difficulty_label")}
        </span>
        {(["all", "easy", "medium", "hard"] as const).map((level) => (
          <button
            key={level}
            onClick={() => setDifficulty(level)}
            aria-pressed={difficulty === level}
            className={
              difficulty === level
                ? c("community-templates-filter-button", "is-active")
                : c("community-templates-filter-button")
            }
          >
            {level === "all"
              ? t("community_templates_difficulty_any")
              : t(`system_difficulty_${level}`)}
          </button>
        ))}
      </div>

      <div className={c("community-templates-list")}>
        {isLoading ? (
          <div className={c("community-templates-loading")}>
            {t("community_templates_loading")}
          </div>
        ) : filteredTemplates.length > 0 ? (
          filteredTemplates.map((template) => {
            const installed = isTemplateInstalled(template);
            const cardDifficulty = resolveSystemDifficulty(template);
            const authorUrl = authorProfileUrl(template.author);
            return (
              <div
                key={template.id}
                className={c(
                  "community-templates-card",
                  `template-type-${template.template_type}`
                )}
                onClick={() => { void handleTemplateClick(template); }}
              >
                <span className={c("community-templates-card-type-badge")}>
                  {t(FILTER_LABEL_KEYS[template.template_type])}
                </span>
                {cardDifficulty && (
                  <span
                    className={c(
                      "community-templates-card-difficulty",
                      `community-templates-card-difficulty--${cardDifficulty}`
                    )}
                  >
                    {t(`system_difficulty_${cardDifficulty}`)}
                  </span>
                )}
                <h3 className={c("community-templates-card-title")}>
                  {template.title}{" "}
                  {installed && (
                    <span className={c("community-templates-card-subtitle")}>
                      ({t("community_templates_installed")})
                    </span>
                  )}
                </h3>
                <p className={c("community-templates-card-description")}>
                  {template.description}
                </p>
                <small className={c("community-templates-card-meta")}>
                  {t("community_templates_author")}:{" "}
                  {authorUrl ? (
                    <a
                      href={authorUrl}
                      target="_blank"
                      rel="noopener"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {template.author}
                    </a>
                  ) : (
                    template.author
                  )}
                  {" · "}
                  <a
                    href={`${REPO_URL}/blob/main${template.ref}`}
                    target="_blank"
                    rel="noopener"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {t("community_templates_view_repo")}
                  </a>
                </small>
              </div>
            );
          })
        ) : (
          <div className={c("community-templates-empty")}>
            {t("community_templates_no_matching")}
          </div>
        )}
      </div>
    </div>
  );
}
