import React, { useState, useEffect, useRef, useMemo } from "react";
import { Notice, request } from "obsidian";
import { c, log } from "architecture";
import {
  CommunityAction,
  CommunityStepSettings,
  StaticTemplateOptions,
} from "config";
import { CommunityFlowData, PluginComponentProps } from "../typing";
import { CommunityActionModal } from "../CommunityActionModal";
import { CommunityStepModal } from "../CommunityStepModal";
import { CommunityMarkdownModal } from "../CommunityMarkdownModal";
import { CommunityFlowModal } from "../CommunityFlowModal";

const BASE_URL =
  "https://raw.githubusercontent.com/RafaelGB/Obsidian-ZettelFlow/refs/heads/feature/community-docs";

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

async function fetchFlowTemplate(ref: string) {
  log.debug("Fetching flow template", ref);
  const rawList = await request({
    url: `${BASE_URL}${ref}/flow.json`,
    method: "GET",
    contentType: "application/json",
  });
  return JSON.parse(rawList) as CommunityFlowData;
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

  // Estados
  const [searchTerm, setSearchTerm] = useState("");
  const [targetSearchTerm, setTargetSearchTerm] = useState("");
  const [filter, setFilter] = useState<
    "all" | "step" | "action" | "markdown" | "flow"
  >("all");
  const [templates, setTemplates] = useState<StaticTemplateOptions[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Ref para debouncing en búsqueda
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

    getData();
  }, [targetSearchTerm, filter, plugin.settings]);

  // Filtrado usando useMemo
  const filteredTemplates = useMemo(() => {
    const lowerCaseSearchTerm = targetSearchTerm.toLowerCase();
    return templates.filter((template) => {
      const matchesSearch =
        template.title.toLowerCase().includes(lowerCaseSearchTerm) ||
        template.description.toLowerCase().includes(lowerCaseSearchTerm);
      const matchesFilter =
        filter === "all" || template.template_type === filter;
      return matchesSearch && matchesFilter;
    });
  }, [templates, targetSearchTerm, filter]);

  // Limpieza del timeout al desmontar
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  // Handlers
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setTargetSearchTerm(e.target.value);
    }, 400);
  };

  const handleSetFilter = (
    value: "all" | "step" | "action" | "markdown" | "flow"
  ) => {
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
          new CommunityFlowModal(
            plugin,
            flow,
            `${BASE_URL}${template.ref}/image.png`,
            () => {}
          ).open();
          break;
        }
        default: {
          // Handle unexpected template types
          log.warn(`Unknown template type: ${template.template_type}`);
          new Notice(
            `Unknown template type: ${template.template_type}. Please check the console for details.`
          );
        }
      }
    } catch (error) {
      log.error(`Error processing ${template.template_type} template:`, error);
      // Could show a notification to the user here
      new Notice(
        `Failed to open ${template.title}. Check the console for details.`
      );
    }
  };

  // Mapeo de cada filtro a su clase de color (usa las mismas que en las cards)
  const FILTER_COLORS: Record<
    "all" | "step" | "action" | "markdown" | "flow",
    string
  > = {
    all: "template-type-all", // Puedes definir este color en CSS o elegir otro
    step: "template-type-step",
    action: "template-type-action",
    markdown: "template-type-markdown",
    flow: "template-type-flow",
  };

  return (
    <div className={c("community-templates-gallery")}>
      <div className={c("community-templates-controls")}>
        <input
          type="text"
          placeholder="Search by title, description or author..."
          value={searchTerm}
          onChange={handleSearchChange}
          className={c("community-templates-search")}
        />
        <div className={c("community-templates-filters")}>
          {(["all", "step", "action", "markdown", "flow"] as const).map(
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
                >
                  {type === "all"
                    ? "All"
                    : type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              );
            }
          )}
        </div>
      </div>

      <div className={c("community-templates-list")}>
        {isLoading ? (
          <div className={c("community-templates-loading")}>
            Cargando plantillas...
          </div>
        ) : filteredTemplates.length > 0 ? (
          filteredTemplates.map((template) => {
            const installed = isTemplateInstalled(template);
            return (
              <div
                key={template.id}
                className={c(
                  "community-templates-card",
                  `template-type-${template.template_type}`
                )}
                onClick={() => handleTemplateClick(template)}
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
          })
        ) : (
          <div className={c("community-templates-empty")}>
            No se encontraron plantillas.
          </div>
        )}
      </div>
    </div>
  );
}
