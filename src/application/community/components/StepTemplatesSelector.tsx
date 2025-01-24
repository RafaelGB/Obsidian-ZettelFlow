import React, { useState, useMemo, ChangeEvent } from "react";
import ZettelFlow from "main"; // Ajusta la ruta según tu proyecto
import { c } from "architecture";
import { StepSettings } from "zettelkasten"; // Ajusta la ruta según tu tipado real
import { CommunityStepSettings } from "config";

interface StepTemplatesSelectorProps {
  plugin: ZettelFlow;
  callback: (step: StepSettings) => void;
}

export function StepTemplatesSelector(props: StepTemplatesSelectorProps) {
  const { plugin, callback } = props;

  // English comment: State for the search term
  const [searchTerm, setSearchTerm] = useState("");

  // English comment: Convert installed steps (object) into an array
  const stepsArray = useMemo(() => {
    const installedSteps = plugin.settings.installedTemplates.steps;
    return Object.entries(installedSteps).map(([key, step]) => ({
      ...step,
      id: key,
    }));
  }, [plugin.settings.installedTemplates.steps]);

  // English comment: Filter steps by search term
  const filteredSteps = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    return stepsArray.filter((step) => {
      const title = step.title?.toLowerCase() || "";
      const description = step.description?.toLowerCase() || "";
      const author = step.author?.toLowerCase() || "";

      return (
        title.includes(lowerSearch) ||
        description.includes(lowerSearch) ||
        author.includes(lowerSearch)
      );
    });
  }, [stepsArray, searchTerm]);

  // English comment: Handler for the input change in the search field
  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  // English comment: Renders each step card
  const renderStepCard = (step: CommunityStepSettings & { id: string }) => (
    <div
      key={step.id}
      className={c("community-templates-card", "template-type-step")}
      onClick={() => callback(step)}
      role="button"
    >
      <h3 className={c("community-templates-card-title")}>{step.title}</h3>
      <p className={c("community-templates-card-description")}>
        {step.description}
      </p>
      <small className={c("community-templates-card-meta")}>
        Autor: {step.author}
      </small>
    </div>
  );

  return (
    <div className={c("community-templates-gallery")}>
      <h1 className={c("community-templates-gallery-title")}>Select a Step</h1>

      {/* Barra de búsqueda */}
      <input
        type="text"
        className={c("step-templates-selector__search")}
        placeholder="Buscar por título, descripción o autor..."
        value={searchTerm}
        onChange={handleSearchChange}
        aria-label="Find a step by title, description or author"
      />

      {/* Lista de Steps filtrados */}
      <div className={c("community-templates-list")}>
        {filteredSteps.map(renderStepCard)}

        {/* Si no hay resultados */}
        {filteredSteps.length === 0 && (
          <p className={c("step-templates-selector__no-results")}>
            No se encontraron resultados.
          </p>
        )}
      </div>
    </div>
  );
}
