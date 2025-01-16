import React, { useState, useEffect, useRef } from "react";
import { request } from "obsidian";
import { c } from "architecture";
import {
  CommunityStepSettings,
  CommunityTemplateOptions,
  ZettelFlowSettings,
} from "config";
import { PluginComponentProps } from "../typing";

/**
 * Response type expected from the server.
 * Ajusta esta interfaz de acuerdo a la respuesta real de tu API.
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
 * Función para obtener templates de la API, con filtros de paginación, búsqueda y tipo (step/action/all).
 */
async function fetchCommunityTemplates(
  skip: number,
  limit: number,
  searchTerm: string,
  filter: "all" | "step" | "action",
  settings: ZettelFlowSettings
): Promise<CommunityTemplatesResponse> {
  const rawList = await request({
    url: `${
      settings.communitySettings.url
    }/filter?skip=${skip}&limit=${limit}&search=${encodeURIComponent(
      searchTerm
    )}&filter=${filter}`,
    method: "GET",
    contentType: "application/json",
  });

  return JSON.parse(rawList) as CommunityTemplatesResponse;
}

export function CommunityTemplatesGallery(props: PluginComponentProps) {
  const { plugin } = props;
  // Obtenemos steps y actions instalados desde las settings del plugin
  const { steps, actions } = plugin.settings.installedTemplates;

  // ---- State ----
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<"all" | "step" | "action">("all");
  const [templates, setTemplates] = useState<CommunityTemplateOptions[]>([]);
  const [skip, setSkip] = useState(0);
  const LIMIT = 15;
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  // Sentinel para el infinite scroll
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // ---- Effects ----

  // 1) Reset de templates al cambiar búsqueda o filtro
  useEffect(() => {
    setTemplates([]);
    setSkip(0);
    setHasMore(true);
  }, [searchTerm, filter]);

  // 2) Cada vez que 'skip' cambia (por scroll) o se resetea, cargamos más datos
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
        console.error("Error fetching community templates:", error);
      } finally {
        setIsLoading(false);
      }
    };

    getData();
  }, [skip, searchTerm, filter, hasMore]);

  // 3) IntersectionObserver para el infinite scroll
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
   * Determina si el template está instalado según su tipo (step/action).
   * Retorna true/false para indicar si está instalado.
   */
  const isTemplateInstalled = (template: CommunityTemplateOptions) => {
    if (template.type === "step") {
      return steps[template.id];
    } else if (template.type === "action") {
      return actions[template.id];
    }
    return false;
  };

  /**
   * Lógica para instalar/desinstalar un template:
   * Aquí deberías invocar la lógica real de tu plugin para modificar
   * las settings. Por ejemplo, guardarlo en plugin.settings.installedTemplates
   * y llamar a plugin.saveSettings(), etc.
   */
  const handleInstallUninstall = (
    e: React.MouseEvent<HTMLButtonElement>,
    template: CommunityTemplateOptions
  ) => {
    e.stopPropagation(); // Evita que se dispare el onClick del card
    const installed = isTemplateInstalled(template);
    if (installed) {
      if (template.type === "step") {
        delete plugin.settings.installedTemplates.steps[template.id];
      } else if (template.type === "action") {
        delete plugin.settings.installedTemplates.actions[template.id];
      }
      setTemplates([...templates]);
    } else {
      if (template.type === "step") {
        plugin.settings.installedTemplates.steps[template.id] =
          template as CommunityStepSettings;
      }

      if (template.type === "action") {
        plugin.settings.installedTemplates.actions[template.id] = template;
      }

      setTemplates([...templates]);
    }
    plugin.saveSettings();
  };

  return (
    <div className={c("community-templates-gallery")}>
      {/* Search + Filter */}
      <div>
        {/* Barra de búsqueda */}
        <input
          type="text"
          placeholder="Buscar por título, descripción o autor..."
          value={searchTerm}
          onChange={handleSearchChange}
          style={{ width: "60%", padding: "0.5rem" }}
        />

        {/* Filtros */}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={() => handleSetFilter("all")}
            style={{
              backgroundColor: filter === "all" ? "#cccccc" : "",
              padding: "0.5rem",
            }}
          >
            All
          </button>
          <button
            onClick={() => handleSetFilter("step")}
            style={{
              backgroundColor: filter === "step" ? "#cccccc" : "",
              padding: "0.5rem",
            }}
          >
            Steps
          </button>
          <button
            onClick={() => handleSetFilter("action")}
            style={{
              backgroundColor: filter === "action" ? "#cccccc" : "",
              padding: "0.5rem",
            }}
          >
            Actions
          </button>
        </div>
      </div>

      {/* Lista de templates */}
      <div className={c("actions-list")}>
        {templates.map((template) => {
          const installed = isTemplateInstalled(template);

          return (
            <div key={template.id} className={c("actions-management-add-card")}>
              <h3 style={{ margin: 0 }}>
                {template.title}
                {installed && <span>(Installed)</span>}
              </h3>
              <p>{template.description}</p>
              <small>
                Author: {template.author} | Type: {template.type} | Downloads:{" "}
                {template.downloads}
              </small>
              <div>
                <button
                  onClick={(e) => {
                    handleInstallUninstall(e, template);
                  }}
                >
                  {installed ? "Uninstall" : "Install"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sentinel para el infinite scroll */}
      {hasMore && !isLoading && <div ref={loadMoreRef} />}

      {/* Mensajes de estado */}
      {isLoading && <p>Loading more templates...</p>}
      {!hasMore && <p>No more results.</p>}
    </div>
  );
}
