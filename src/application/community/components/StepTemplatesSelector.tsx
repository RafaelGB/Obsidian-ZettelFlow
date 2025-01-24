import React, { useState, useMemo } from "react";
import ZettelFlow from "main"; // Ajusta la ruta según tu proyecto
import { c } from "architecture";
import { StepSettings } from "zettelkasten"; // Ajusta la ruta según tu tipado real

interface StepTemplatesSelectorProps {
  plugin: ZettelFlow;
  callback: (step: StepSettings) => void;
}

export function StepTemplatesSelector(props: StepTemplatesSelectorProps) {
  const { plugin, callback } = props;

  // Campo de búsqueda
  const [searchTerm, setSearchTerm] = useState("");

  /**
   * Obtenemos todos los Steps instalados desde la config del plugin,
   * transformándolos a un array para iterar más fácilmente.
   */
  const stepsArray = useMemo(() => {
    const installedSteps = plugin.settings.installedTemplates.steps;
    return Object.entries(installedSteps).map(([key, step]) => ({
      ...step,
      id: key,
    }));
  }, [plugin.settings.installedTemplates.steps]);

  /**
   * Filtramos los steps en base al campo de búsqueda
   */
  const filteredSteps = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    return stepsArray.filter((step) => {
      // Ajusta los campos de búsqueda que necesites (title, description, author, etc.)
      return (
        step.title.toLowerCase().includes(lowerSearch) ||
        step.description.toLowerCase().includes(lowerSearch) ||
        step.author.toLowerCase().includes(lowerSearch)
      );
    });
  }, [stepsArray, searchTerm]);

  return (
    <div className={c("step-templates-selector")}>
      <h2 className={c("step-templates-selector__title")}>
        Selecciona un Step
      </h2>

      {/* Barra de búsqueda */}
      <input
        type="text"
        className={c("step-templates-selector__search")}
        placeholder="Buscar por título, descripción o autor..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      {/* Lista de Steps filtrados */}
      <div className={c("step-templates-selector__list")}>
        {filteredSteps.map((step) => (
          <div
            key={step.id}
            className={c("step-templates-selector__card")}
            onClick={() => callback(step)} // Al hacer clic, se invoca el callback
          >
            <h3 className={c("step-templates-selector__card-title")}>
              {step.title}
            </h3>
            <p className={c("step-templates-selector__card-description")}>
              {step.description}
            </p>
            <small className={c("step-templates-selector__card-author")}>
              Autor: {step.author}
            </small>
          </div>
        ))}

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
