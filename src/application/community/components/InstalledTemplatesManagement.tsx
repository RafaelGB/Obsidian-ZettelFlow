import React, { useState, useMemo } from "react";
import { PluginComponentProps } from "../typing";
import { c } from "architecture";
import { InstalledActionDetail } from "./ActionComponentView";
import { InstalledStepDetail } from "./StepComponentView";
import { CommunityAction, CommunityStepSettings } from "config";

export function InstalledTemplatesManagement(props: PluginComponentProps) {
  const { plugin } = props;
  const { steps, actions } = plugin.settings.installedTemplates;

  // Preparamos un array conjunto con todos los instalados
  const allInstalled = useMemo(() => {
    const stepArray = Object.entries(steps).map(([key, step]) => ({
      ...step,
      id: key, // Puede que el ID real lo tengas dentro de step, ajusta según tu caso
    }));

    const actionArray = Object.entries(actions).map(([key, action]) => ({
      ...action,
      id: key,
    }));

    return [...stepArray, ...actionArray];
  }, [steps, actions]);

  // ---- Estados ----
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<"all" | "step" | "action">("all");
  // Estado para almacenar el template seleccionado
  const [selectedTemplate, setSelectedTemplate] = useState<
    CommunityStepSettings | CommunityAction | null
  >(null);

  // ---- Handlers ----
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleSetFilter = (value: "all" | "step" | "action") => {
    setFilter(value);
  };

  // Desinstalar template individual
  const handleUninstall = (
    templateId: string,
    templateType: "step" | "action"
  ) => {
    if (templateType === "step") {
      delete plugin.settings.installedTemplates.steps[templateId];
    } else {
      delete plugin.settings.installedTemplates.actions[templateId];
    }
    plugin.saveSettings();
  };

  const onTemplateClick = (
    template: CommunityStepSettings | CommunityAction
  ) => {
    setSelectedTemplate(template);
  };

  const handleBack = () => {
    setSelectedTemplate(null);
  };

  // ---- Filtrado ----
  const filteredInstalled = useMemo(() => {
    // 1) Filtrado por texto
    const textFiltered = allInstalled.filter((item) => {
      const lowerSearch = searchTerm.toLowerCase();
      return (
        item.title.toLowerCase().includes(lowerSearch) ||
        item.description.toLowerCase().includes(lowerSearch) ||
        item.author.toLowerCase().includes(lowerSearch)
      );
    });

    // 2) Filtrado por tipo
    if (filter === "all") return textFiltered;
    return textFiltered.filter((item) => item.type === filter);
  }, [allInstalled, searchTerm, filter]);

  // ---- Render condicional (Lista o Detalle) ----
  if (selectedTemplate) {
    // Si hay un template seleccionado, renderizamos la vista individual
    if (selectedTemplate.type === "step") {
      return (
        <InstalledStepDetail
          step={selectedTemplate as CommunityStepSettings}
          onBack={handleBack}
        />
      );
    } else {
      return (
        <InstalledActionDetail
          action={selectedTemplate as CommunityAction}
          onBack={handleBack}
        />
      );
    }
  }

  return (
    <div>
      <h1>Installed Templates</h1>

      {/* Barra de búsqueda y filtros */}
      <div>
        {/* Barra de búsqueda */}
        <input
          type="text"
          placeholder="Buscar por título, descripción o autor..."
          value={searchTerm}
          onChange={handleSearchChange}
        />

        {/* Filtros por tipo */}
        <div>
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

      {/* Lista de templates instalados, mostrados en forma de cards */}
      {filteredInstalled.length === 0 && (
        <p>No hay templates que coincidan con la búsqueda.</p>
      )}

      <div className={c("actions-list")}>
        {filteredInstalled.map((template) => (
          <div
            key={template.id}
            onClick={() => onTemplateClick(template)}
            className={c("actions-management-add-card")}
          >
            <h3 style={{ margin: 0 }}>
              {template.title} <span>({template.type})</span>
            </h3>
            <p>{template.description}</p>
            <small>Author: {template.author}</small>
            <div>
              <button
                onClick={() => handleUninstall(template.id, template.type)}
              >
                Uninstall
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
