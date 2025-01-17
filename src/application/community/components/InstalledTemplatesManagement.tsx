import React, { useState, useMemo, useCallback } from "react";
import { PluginComponentProps } from "../typing";
import { c } from "architecture";
import { InstalledActionDetail } from "./ActionComponentView";
import { CommunityAction, CommunityStepSettings } from "config";
import { InstalledStepEditorModal } from "zettelkasten/modals/InstalledStepEditorModal";

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

  // Currently selected template for detail view
  const [selectedTemplate, setSelectedTemplate] = useState<
    CommunityStepSettings | CommunityAction | null
  >(null);

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
   * Uninstall a template from both local state and plugin settings
   */
  const handleUninstall = useCallback(
    (templateId: string, templateType: "step" | "action") => {
      if (templateType === "step") {
        setLocalSteps((prev) => {
          const updated = { ...prev };
          delete updated[templateId];
          return updated;
        });
        delete plugin.settings.installedTemplates.steps[templateId];
      } else {
        setLocalActions((prev) => {
          const updated = { ...prev };
          delete updated[templateId];
          return updated;
        });
        delete plugin.settings.installedTemplates.actions[templateId];
      }
      plugin.saveSettings();

      // If we were viewing this template in detail, reset
      setSelectedTemplate((prevSelected) => {
        if (
          prevSelected &&
          prevSelected._id === templateId &&
          prevSelected.type === templateType
        ) {
          return null;
        }
        return prevSelected;
      });
    },
    [plugin]
  );

  /**
   * Refresh an installed step template with new data in the list
   */
  const refreshStep = useCallback((step: CommunityStepSettings) => {
    setLocalSteps((prev) => {
      const updated = { ...prev };
      updated[step._id] = step;
      return updated;
    });
  }, []);

  /**
   * Open detail view for a template
   */
  const onTemplateClick = (
    template: CommunityStepSettings | CommunityAction
  ) => {
    if (template.type === "step") {
      new InstalledStepEditorModal(
        plugin,
        template as CommunityStepSettings,
        refreshStep
      ).open();
    } else if (template.type === "action") {
      // TODO: Open action detail view
    }
  };

  /**
   * Return to the list from the detail view
   */
  const handleBack = () => {
    setSelectedTemplate(null);
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
      filtered = filtered.filter((item) => item.type === filter);
    }
    return filtered;
  }, [allInstalled, searchTerm, filter]);

  /**
   * Conditional rendering:
   * - If a template is selected, show detail view
   * - Otherwise, list all installed templates
   */
  if (selectedTemplate) {
    return (
      <InstalledActionDetail
        action={selectedTemplate as CommunityAction}
        onBack={handleBack}
      />
    );
  }

  // Render the list of installed templates
  return (
    <div className={c("community-templates-gallery")}>
      <h1 className={c("community-templates-gallery-title")}>
        Installed Templates
      </h1>

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
        {filteredInstalled.map((template) => (
          <div
            key={template.id}
            className={c("community-templates-card")}
            onClick={() => onTemplateClick(template)}
          >
            <h3 className={c("community-templates-card-title")}>
              {template.title}{" "}
              <span className={c("community-templates-card-subtitle")}>
                ({template.type})
              </span>
            </h3>
            <p className={c("community-templates-card-description")}>
              {template.description}
            </p>
            <small className={c("community-templates-card-meta")}>
              Author: {template.author} - Downloads: {template.downloads}
            </small>
            <div className={c("community-templates-card-actions")}>
              {/* Stop propagation to avoid triggering detail view */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleUninstall(template.id, template.type);
                }}
                className={c("community-templates-uninstall-button")}
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
