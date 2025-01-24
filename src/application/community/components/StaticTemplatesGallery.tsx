import React, { useState, useEffect, useRef } from "react";
import { request } from "obsidian";
import { c, log } from "architecture";
import {
  CommunityAction,
  CommunityStepSettings,
  StaticTemplateOptions,
  ZettelFlowSettings,
} from "config";
import { PluginComponentProps } from "../typing";
import { CommunityActionModal } from "../CommunityActionModal";
import { CommunityStepModal } from "../CommunityStepModal";

const BASE_URL =
  "https://raw.githubusercontent.com/RafaelGB/Obsidian-ZettelFlow/refs/heads/feature/action-catalog/docs/";
async function fetchCommunityTemplates(
  settings: ZettelFlowSettings
): Promise<StaticTemplateOptions[]> {
  const rawList = await request({
    url: `${BASE_URL}/docs/main_template.json`,
    method: "GET",
    contentType: "application/json",
  });

  return JSON.parse(rawList) as StaticTemplateOptions[];
}

async function fetchActionTemplate(ref: string) {
  const rawList = await request({
    url: `${BASE_URL}${ref}`,
    method: "GET",
    contentType: "application/json",
  });

  return JSON.parse(rawList) as CommunityAction;
}

async function fetchStepTemplate(ref: string) {
  const rawList = await request({
    url: `${BASE_URL}${ref}`,
    method: "GET",
    contentType: "application/json",
  });

  return JSON.parse(rawList) as CommunityStepSettings;
}

export function StaticTemplatesGallery(props: PluginComponentProps) {
  const { plugin } = props;
  const { steps, actions } = plugin.settings.installedTemplates;

  // ---- States ----
  const [searchTerm, setSearchTerm] = useState("");
  const [targetSearchTerm, setTargetSearchTerm] = useState("");

  const [filter, setFilter] = useState<"all" | "step" | "action">("all");
  const [templates, setTemplates] = useState<StaticTemplateOptions[]>([]);
  const [skip, setSkip] = useState(0);

  // Reference for debouncing search input
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Infinite scroll sentinel reference
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // (1) Reset templates when changing search term or filter
  useEffect(() => {
    setTemplates([]);
    setSkip(0);
  }, [targetSearchTerm, filter]);

  // (2) Data loading
  useEffect(() => {
    const getData = async () => {
      try {
        const response = await fetchCommunityTemplates(plugin.settings);

        setTemplates((prev) => [...prev, ...response]);
      } catch (error) {
        log.error("Error fetching community templates:", error);
      }
    };

    getData();
  }, [skip, targetSearchTerm, filter, plugin.settings]);

  // (3) Cleanup de timeouts when unmounting
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

  const isTemplateInstalled = (template: StaticTemplateOptions) => {
    if (template.template_type === "step") {
      return !!steps[template.id];
    } else if (template.template_type === "action") {
      return !!actions[template.id];
    }
    return false;
  };

  const handleTemplateClick = async (template: StaticTemplateOptions) => {
    if (template.template_type === "step") {
      const step = await fetchStepTemplate(template.ref);
      new CommunityStepModal(plugin, step).open();
    } else if (template.template_type === "action") {
      const action = await fetchActionTemplate(template.ref);
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
          const isStep = template.template_type === "step";
          const isAction = template.template_type === "action";

          return (
            <div
              key={template.id}
              className={c(
                "community-templates-card",
                `template-type-${template.template_type}`
              )}
              onClick={() => {
                handleTemplateClick(template);
              }}
            >
              <span className={c("community-templates-card-type-badge")}>
                {isStep ? "Step" : isAction ? "Action" : "Template"}
              </span>

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
                Author: {template.author}
              </small>
            </div>
          );
        })}
      </div>
    </div>
  );
}
