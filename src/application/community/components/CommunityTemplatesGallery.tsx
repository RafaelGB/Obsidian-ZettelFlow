import React, { useState, useEffect, useRef } from "react";
import { request } from "obsidian";
import { c, log } from "architecture";
import {
  CommunityAction,
  CommunityStepSettings,
  CommunityTemplateOptions,
  ZettelFlowSettings,
} from "config";
import { PluginComponentProps } from "../typing";

/**
 * Response type expected from the server.
 */
interface CommunityTemplatesResponse {
  total: number;
  items: CommunityTemplateOptions[];
  page_info: {
    skip: number;
    limit: number;
    has_next: boolean;
    has_previous: boolean;
  };
}

/**
 * Fetch templates from the API with pagination, search, and type filtering.
 */
async function fetchCommunityTemplates(
  skip: number,
  limit: number,
  searchTerm: string,
  type: "all" | "step" | "action",
  settings: ZettelFlowSettings
): Promise<CommunityTemplatesResponse> {
  const rawList = await request({
    url: `${
      settings.communitySettings.url
    }/templates/filter?skip=${skip}&limit=${limit}&search=${encodeURIComponent(
      searchTerm
    )}&template_type=${type}`,
    method: "GET",
    contentType: "application/json",
  });

  return JSON.parse(rawList) as CommunityTemplatesResponse;
}

export function CommunityTemplatesGallery(props: PluginComponentProps) {
  const { plugin } = props;
  // Installed steps & actions from plugin settings
  const { steps, actions } = plugin.settings.installedTemplates;

  // ---- States ----
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<"all" | "step" | "action">("all");
  const [templates, setTemplates] = useState<CommunityTemplateOptions[]>([]);
  const [skip, setSkip] = useState(0);
  const LIMIT = 15;
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  // Sentinel for infinite scroll
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // ---- Effects ----

  // (1) Reset template list whenever search term or filter changes
  useEffect(() => {
    setTemplates([]);
    setSkip(0);
    setHasMore(true);
  }, [searchTerm, filter]);

  // (2) Fetch more data when 'skip' changes or on initial load
  useEffect(() => {
    if (!hasMore) return;

    const getData = async () => {
      setIsLoading(true);
      try {
        const response = await fetchCommunityTemplates(
          skip,
          LIMIT,
          searchTerm,
          filter,
          plugin.settings
        );

        if (!response.page_info.has_next || response.items.length < LIMIT) {
          setHasMore(false);
        }

        setTemplates((prev) => [...prev, ...response.items]);
      } catch (error) {
        log.error("Error fetching community templates:", error);
      } finally {
        setIsLoading(false);
      }
    };

    getData();
  }, [skip, searchTerm, filter, hasMore, plugin.settings]);

  // (3) Infinite scroll logic via IntersectionObserver
  useEffect(() => {
    if (!hasMore || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const firstEntry = entries[0];
        if (firstEntry.isIntersecting) {
          setSkip((prevSkip) => prevSkip + LIMIT);
        }
      },
      { threshold: 0.1 }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) observer.observe(currentRef);

    return () => {
      if (currentRef) observer.unobserve(currentRef);
    };
  }, [hasMore, isLoading]);

  // ---- Handlers ----

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleSetFilter = (value: "all" | "step" | "action") => {
    setFilter(value);
  };

  /**
   * Check if a given template is installed (either step or action).
   */
  const isTemplateInstalled = (template: CommunityTemplateOptions) => {
    if (template.template_type === "step") {
      return !!steps[template.id];
    } else if (template.template_type === "action") {
      return !!actions[template.id];
    }
    return false;
  };

  /**
   * Install/uninstall logic. After updating plugin settings,
   * re-render by refreshing 'templates' array in local state.
   */
  const handleInstallUninstall = (
    e: React.MouseEvent<HTMLButtonElement>,
    template: CommunityTemplateOptions
  ) => {
    e.stopPropagation(); // Prevent any onClick on the card itself
    const installed = isTemplateInstalled(template);

    if (installed) {
      // Uninstall
      if (template.template_type === "step") {
        delete plugin.settings.installedTemplates.steps[template.id];
      } else {
        delete plugin.settings.installedTemplates.actions[template.id];
      }
    } else {
      // Install
      if (template.template_type === "step") {
        plugin.settings.installedTemplates.steps[template.id] =
          template as CommunityStepSettings;
      } else {
        plugin.settings.installedTemplates.actions[template.id] =
          template as CommunityAction;
      }
    }

    plugin.saveSettings();
    // Force re-render of this gallery (so "Installed" label toggles)
    setTemplates((prev) => [...prev]);
  };

  return (
    <div className={c("community-templates-gallery")}>
      {/* Title (optional) */}
      <h1 className={c("community-templates-gallery-title")}>
        Community Templates
      </h1>

      {/* Controls: Search & Filter */}
      <div className={c("community-templates-controls")}>
        {/* Search input */}
        <input
          type="text"
          placeholder="Search by title, description or author..."
          value={searchTerm}
          onChange={handleSearchChange}
          className={c("community-templates-search")}
        />

        {/* Filter buttons */}
        <div className={c("community-templates-filters")}>
          <button
            onClick={() => handleSetFilter("all")}
            className={
              filter === "all"
                ? c("community-templates-filter-button", "is-active")
                : c("community-templates-filter-button")
            }
          >
            All
          </button>
          <button
            onClick={() => handleSetFilter("step")}
            className={
              filter === "step"
                ? c("community-templates-filter-button", "is-active")
                : c("community-templates-filter-button")
            }
          >
            Steps
          </button>
          <button
            onClick={() => handleSetFilter("action")}
            className={
              filter === "action"
                ? c("community-templates-filter-button", "is-active")
                : c("community-templates-filter-button")
            }
          >
            Actions
          </button>
        </div>
      </div>

      {/* Template List */}
      <div className={c("community-templates-list")}>
        {templates.map((template) => {
          const installed = isTemplateInstalled(template);
          return (
            <div
              key={template.id}
              className={c(
                "community-templates-card",
                c(`template-type-${template.template_type}`)
              )}
              // Could add onClick or card detail logic here if needed
            >
              <h3 className={c("community-templates-card-title")}>
                {template.title}{" "}
                {installed && (
                  <span className={c("community-templates-card-subtitle")}>
                    (Installed)
                  </span>
                )}
              </h3>
              <p className={c("community-templates-card-description")}>
                {template.description}
              </p>
              <small className={c("community-templates-card-meta")}>
                Author: {template.author} | Type: {template.template_type} |
                Downloads: {template.downloads}
              </small>
              <div className={c("community-templates-card-actions")}>
                <button
                  onClick={(e) => handleInstallUninstall(e, template)}
                  className={c("community-templates-uninstall-button")}
                >
                  {installed ? "Uninstall" : "Install"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Infinite Scroll Sentinel */}
      {hasMore && !isLoading && (
        <div ref={loadMoreRef} className={c("community-templates-sentinel")} />
      )}

      {/* Loading / No More Results indicators */}
      {isLoading && (
        <p className={c("community-templates-load-status")}>
          Loading more templates...
        </p>
      )}
      {!hasMore && (
        <p className={c("community-templates-no-results")}>No more results.</p>
      )}
    </div>
  );
}
