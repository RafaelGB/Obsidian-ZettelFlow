import React, { useState, useMemo, ChangeEvent } from "react";
import ZettelFlow from "main";
import { c } from "architecture";
import { CommunityAction } from "config";
import { Action } from "architecture/api";

interface ActionTemplatesSelectorProps {
  plugin: ZettelFlow;
  callback: (step: Action) => void;
}

export function ActionTemplatesSelector(props: ActionTemplatesSelectorProps) {
  const { plugin, callback } = props;

  // State for the search term
  const [searchTerm, setSearchTerm] = useState("");

  // Convert installed actions (object) into an array
  const actionsArray = useMemo(() => {
    const installedActions = plugin.settings.installedTemplates.actions;
    return Object.entries(installedActions).map(([key, action]) => ({
      ...action,
      id: key,
    }));
  }, [plugin.settings.installedTemplates.steps]);

  // Filter actions by search term
  const filteredActions = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    return actionsArray.filter((step) => {
      const title = step.title?.toLowerCase() || "";
      const description = step.description?.toLowerCase() || "";
      const author = step.author?.toLowerCase() || "";

      return (
        title.includes(lowerSearch) ||
        description.includes(lowerSearch) ||
        author.includes(lowerSearch)
      );
    });
  }, [actionsArray, searchTerm]);

  // Handler for the input change in the search field
  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  // Renders each step card
  const renderStepCard = (action: CommunityAction & { id: string }) => (
    <div
      key={action.id}
      className={c("community-templates-card", "template-type-step")}
      onClick={() => callback(action)}
      role="button"
    >
      <h3 className={c("community-templates-card-title")}>{action.title}</h3>
      <p className={c("community-templates-card-description")}>
        {action.description}
      </p>
      <small className={c("community-templates-card-meta")}>
        Autor: {action.author}
      </small>
    </div>
  );

  return (
    <div className={c("community-templates-gallery")}>
      <h1 className={c("community-templates-gallery-title")}>Select a Step</h1>

      {/* Search input */}
      <input
        type="text"
        className={c("step-templates-selector__search")}
        placeholder="Buscar por título, descripción o autor..."
        value={searchTerm}
        onChange={handleSearchChange}
        aria-label="Find a step by title, description or author"
      />

      {/* List of actions */}
      <div className={c("community-templates-list")}>
        {filteredActions.map(renderStepCard)}

        {/* No results message */}
        {filteredActions.length === 0 && (
          <p className={c("step-templates-selector__no-results")}>
            No se encontraron resultados.
          </p>
        )}
      </div>
    </div>
  );
}
