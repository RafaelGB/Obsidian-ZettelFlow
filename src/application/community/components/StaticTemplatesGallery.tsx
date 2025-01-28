import React, { useState, useEffect, useRef } from "react";
import { request } from "obsidian";
import { c, log } from "architecture";
import {
  CommunityAction,
  CommunityStepSettings,
  StaticTemplateOptions,
} from "config";
import { PluginComponentProps } from "../typing";
import { CommunityActionModal } from "../CommunityActionModal";
import { CommunityStepModal } from "../CommunityStepModal";
import { CommunityMarkdownModal } from "../CommunityMarkdownModal";

const BASE_URL =
  "https://raw.githubusercontent.com/RafaelGB/Obsidian-ZettelFlow/refs/heads/feature/markdown_template_download";
async function fetchCommunityTemplates(): Promise<StaticTemplateOptions[]> {
  log.debug("Fetching community templates");
  const rawList = await request({
    url: `${BASE_URL}/docs/main_template.json`,
    method: "GET",
    contentType: "application/json",
  });

  return JSON.parse(rawList) as StaticTemplateOptions[];
}

async function fetchActionTemplate(ref: string) {
  log.debug("Fetching action template", ref);
  const rawList = await request({
    url: `${BASE_URL}${ref}`,
    method: "GET",
    contentType: "application/json",
  });

  return JSON.parse(rawList) as CommunityAction;
}

async function fetchStepTemplate(ref: string) {
  log.debug("Fetching step template", ref);
  const rawList = await request({
    url: `${BASE_URL}${ref}`,
    method: "GET",
    contentType: "application/json",
  });

  return JSON.parse(rawList) as CommunityStepSettings;
}

async function fetchMarkdownTemplate(ref: string) {
  log.debug("Fetching markdown template", ref);
  const markdown = await request({
    url: `${BASE_URL}${ref}`,
    method: "GET",
    contentType: "text/plain",
  });

  return markdown;
}

export function StaticTemplatesGallery(props: PluginComponentProps) {
  const { plugin } = props;
  const { steps, actions } = plugin.settings.installedTemplates;

  // ---- States ----
  const [searchTerm, setSearchTerm] = useState("");
  const [targetSearchTerm, setTargetSearchTerm] = useState("");

  const [filter, setFilter] = useState<"all" | "step" | "action" | "markdown">(
    "all"
  );
  const [templates, setTemplates] = useState<StaticTemplateOptions[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<
    StaticTemplateOptions[]
  >([]);
  const [skip, setSkip] = useState(0);

  // Reference for debouncing search input
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // (1) Reset templates when changing search term or filter
  useEffect(() => {
    setTemplates([]);
    setSkip(0);
  }, [targetSearchTerm, filter]);

  // (2) Data loading
  useEffect(() => {
    const getData = async () => {
      try {
        const response = await fetchCommunityTemplates();
        setTemplates((prev) => [...prev, ...response]);
      } catch (error) {
        log.error("Error fetching community templates:", error);
      }
    };

    getData();
  }, [skip, targetSearchTerm, filter, plugin.settings]);

  // (3) Apply search and filter
  useEffect(() => {
    const lowerCaseSearchTerm = targetSearchTerm.toLowerCase();
    const filtered = templates.filter((template) => {
      const matchesSearch =
        template.title.toLowerCase().includes(lowerCaseSearchTerm) ||
        template.description.toLowerCase().includes(lowerCaseSearchTerm);
      const matchesFilter =
        filter === "all" || template.template_type === filter;

      return matchesSearch && matchesFilter;
    });

    setFilteredTemplates(filtered);
  }, [templates, targetSearchTerm, filter]);

  // (4) Cleanup timeouts when unmounting
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

  const handleSetFilter = (value: "all" | "step" | "action" | "markdown") => {
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
    // mark as installed/to be installed
    const templates = [...filteredTemplates];
    setFilteredTemplates(templates);
  };

  const handleTemplateClick = async (template: StaticTemplateOptions) => {
    if (template.template_type === "step") {
      const step = await fetchStepTemplate(template.ref);
      new CommunityStepModal(plugin, step, handleRefresh).open();
    } else if (template.template_type === "action") {
      const action = await fetchActionTemplate(template.ref);
      new CommunityActionModal(plugin, action).open();
    } else if (template.template_type === "markdown") {
      const markdown = await fetchMarkdownTemplate(template.ref);
      const filename = template.ref.split("/").pop();
      if (filename) {
        new CommunityMarkdownModal(
          plugin,
          markdown,
          template.title,
          template.description,
          filename
        ).open();
      }
    }
  };

  return (
    <div className={c("community-templates-gallery")}>
      <h1 className={c("community-templates-gallery-title")}>
        ZettelFlow Repository Examples
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
          <button
            onClick={() => handleSetFilter("markdown")}
            className={
              filter === "markdown"
                ? c("community-templates-filter-button", "is-active")
                : c("community-templates-filter-button")
            }
          >
            Markdown
          </button>
        </div>
      </div>

      <div className={c("community-templates-list")}>
        {filteredTemplates.map((template) => {
          const installed = isTemplateInstalled(template);
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
                {template.template_type}
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
