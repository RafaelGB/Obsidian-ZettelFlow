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
import { CommunityActionModal } from "../CommunityActionModal";
import { CommunityStepModal } from "../CommunityStepModal";

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

async function fetchActionTemplate(id: string, settings: ZettelFlowSettings) {
  const rawList = await request({
    url: `${settings.communitySettings.url}/actions/${id}`,
    method: "GET",
    contentType: "application/json",
  });

  return JSON.parse(rawList) as CommunityAction;
}

async function fetchStepTemplate(id: string, settings: ZettelFlowSettings) {
  const rawList = await request({
    url: `${settings.communitySettings.url}/steps/${id}`,
    method: "GET",
    contentType: "application/json",
  });

  return JSON.parse(rawList) as CommunityStepSettings;
}

export function CommunityTemplatesGallery(props: PluginComponentProps) {
  const { plugin } = props;
  const { steps, actions } = plugin.settings.installedTemplates;

  // ---- States ----
  const [searchTerm, setSearchTerm] = useState("");
  const [targetSearchTerm, setTargetSearchTerm] = useState("");

  const [filter, setFilter] = useState<"all" | "step" | "action">("all");
  const [templates, setTemplates] = useState<CommunityTemplateOptions[]>([]);
  const [skip, setSkip] = useState(0);
  const LIMIT = 15;
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  // Reference for debouncing search input
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Infinite scroll sentinel reference
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // (1) Reset templates when changing search term or filter
  useEffect(() => {
    setTemplates([]);
    setSkip(0);
    setHasMore(true);
  }, [targetSearchTerm, filter]);

  // (2) Data loading
  useEffect(() => {
    if (!hasMore || isLoading) return;

    const getData = async () => {
      setIsLoading(true);
      try {
        const response = await fetchCommunityTemplates(
          skip,
          LIMIT,
          targetSearchTerm,
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
  }, [skip, targetSearchTerm, filter, plugin.settings, hasMore, isLoading]);

  // (3) Infinite scroll observer
  useEffect(() => {
    if (!hasMore || isLoading) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
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

  // (4) Cleanup de timeouts when unmounting
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // ---- Handlers ----

  // Debounce en el input para actualizar 'targetSearchTerm' tras 400ms
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      setTargetSearchTerm(e.target.value);
    }, 400);
  };

  const handleSetFilter = (value: "all" | "step" | "action") => {
    setFilter(value);
  };

  const isTemplateInstalled = (template: CommunityTemplateOptions) => {
    if (template.template_type === "step") {
      return !!steps[template.id];
    } else if (template.template_type === "action") {
      return !!actions[template.id];
    }
    return false;
  };

  const handleTemplateClick = async (template: CommunityTemplateOptions) => {
    if (template.template_type === "step") {
      const step = await fetchStepTemplate(template.id, plugin.settings);
      new CommunityStepModal(plugin, step).open();
    } else if (template.template_type === "action") {
      const action = await fetchActionTemplate(template.id, plugin.settings);
      new CommunityActionModal(plugin, action).open();
    }
  };

  return (
    <div className={c("community-templates-gallery")}>
      <h1 className={c("community-templates-gallery-title")}>
        Community Templates
      </h1>

      <div className={c("community-templates-controls")}>
        <input
          type="text"
          placeholder="Search by title, description or author..."
          value={searchTerm}
          onChange={handleSearchChange}
          className={c("community-templates-search")}
        />

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
              onClick={() => {
                handleTemplateClick(template);
              }}
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
              {/*
              <div className={c("community-templates-card-actions")}>
                
                <button
                  onClick={(e) => handleInstallUninstall(e, template)}
                  className={c("community-templates-uninstall-button")}
                >
                  {installed ? "Uninstall" : "Install"}
                </button>
              </div>
               */}
            </div>
          );
        })}
      </div>

      {hasMore && !isLoading && (
        <div ref={loadMoreRef} className={c("community-templates-sentinel")} />
      )}

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
