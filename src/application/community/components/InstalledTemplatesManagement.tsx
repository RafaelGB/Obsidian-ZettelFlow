import React, { useState, useMemo, useCallback } from "react";
import { PluginComponentProps } from "../typing";
import { c } from "architecture";
import { CommunityAction, CommunityStepSettings } from "config";
import { InstalledStepEditorModal } from "zettelkasten/modals/InstalledStepEditorModal";
import { InstalledActionEditorModal } from "zettelkasten/modals/InstalledActionEditorModal";

export function InstalledTemplatesManagement(props: PluginComponentProps) {
  const { plugin } = props;

  // Keep local copies of steps and actions to reflect uninstalls immediately
  const [localSteps, setLocalSteps] = useState<
    Record<string, CommunityStepSettings>
  >(() => ({ ...plugin.settings.installedTemplates.steps }));
  const [localActions, setLocalActions] = useState<
    Record<string, CommunityAction>
  >(() => ({ ...plugin.settings.installedTemplates.actions }));

  // Search and filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<"all" | "step" | "action">("all");

  // Combine local steps and actions into a single array
  const allInstalled = useMemo(() => {
    const stepArray = Object.entries(localSteps).map(([key, step]) => ({
      ...step,
      id: key,
    }));
    const actionArray = Object.entries(localActions).map(([key, action]) => ({
      ...action,
      id: key,
    }));
    return [...stepArray, ...actionArray];
  }, [localSteps, localActions]);

  /**
   * Update search term as user types
   */
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  /**
   * Switch filter among "all", "step", "action"
   */
  const handleSetFilter = (value: "all" | "step" | "action") => {
    setFilter(value);
  };

  /**
   * Refresh an installed step template with new data in the list
   */
  const refreshStep = useCallback(
    (step: CommunityStepSettings, removed: boolean) => {
      setLocalSteps((prev) => {
        const updated = { ...prev };
        if (removed) {
          delete updated[step.id];
        } else {
          updated[step.id] = step;
        }
        return updated;
      });
    },
    []
  );

  const refreshAction = useCallback(
    (action: CommunityAction, removed: boolean) => {
      setLocalActions((prev) => {
        const updated = { ...prev };
        if (removed) {
          delete updated[action.id];
        } else {
          updated[action.id] = action;
        }
        return updated;
      });
    },
    []
  );

  /**
   * Open detail view for a template
   */
  const onTemplateClick = (
    template: CommunityStepSettings | CommunityAction
  ) => {
    if (template.template_type === "step") {
      new InstalledStepEditorModal(
        plugin,
        template as CommunityStepSettings,
        refreshStep
      ).open();
    } else if (template.template_type === "action") {
      new InstalledActionEditorModal(
        plugin,
        template as CommunityAction,
        refreshAction
      ).open();
    }
  };

  /**
   * Filter by search term and template type
   */
  const filteredInstalled = useMemo(() => {
    if (!allInstalled.length) {
      return [];
    }
    const lowerSearch = searchTerm.toLowerCase();
    let filtered = allInstalled.filter((item) => {
      return (
        item.title.toLowerCase().includes(lowerSearch) ||
        item.description.toLowerCase().includes(lowerSearch) ||
        item.author.toLowerCase().includes(lowerSearch)
      );
    });

    if (filter !== "all") {
      filtered = filtered.filter((item) => item.template_type === filter);
    }
    return filtered;
  }, [allInstalled, searchTerm, filter]);

  // Render the list of installed templates
  return (
    <div className={c("community-templates-gallery")}>
      {/* Search and filter controls */}
      <div className={c("community-templates-controls")}>
        {/* Search bar */}
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

      {filteredInstalled.length === 0 && (
        <p className={c("community-templates-no-results")}>
          No matching templates found.
        </p>
      )}

      {/* List of installed templates in card format */}
      <div className={c("community-templates-list")}>
        {filteredInstalled.map((template) => {
          const isStep = template.template_type === "step";
          const isAction = template.template_type === "action";
          return (
            <div
              key={template.id}
              className={c(
                "community-templates-card",
                `template-type-${template.template_type}`
              )}
              onClick={() => onTemplateClick(template)}
            >
              <span className={c("community-templates-card-type-badge")}>
                {isStep ? "Step" : isAction ? "Action" : "Template"}
              </span>
              <h3 className={c("community-templates-card-title")}>
                {template.title}{" "}
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
