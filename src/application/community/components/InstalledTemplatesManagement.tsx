import React, { useState, useMemo, useCallback } from "react";
import { PluginComponentProps } from "../typing";
import { c } from "architecture";
import { InstalledActionDetail } from "./ActionComponentView";
import { InstalledStepDetail } from "./StepComponentView";
import { CommunityAction, CommunityStepSettings } from "config";

export function InstalledTemplatesManagement(props: PluginComponentProps) {
  const { plugin } = props;

  /**
   * We keep local copies of steps and actions in state
   * so that uninstalling an item removes it immediately from the UI.
   */
  const [localSteps, setLocalSteps] = useState<
    Record<string, CommunityStepSettings>
  >(() => ({ ...plugin.settings.installedTemplates.steps }));
  const [localActions, setLocalActions] = useState<
    Record<string, CommunityAction>
  >(() => ({ ...plugin.settings.installedTemplates.actions }));

  /**
   * We'll store the search term and current filter in state
   */
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<"all" | "step" | "action">("all");

  /**
   * Keep track of the currently selected template (step or action)
   * to display the detail view if needed.
   */
  const [selectedTemplate, setSelectedTemplate] = useState<
    CommunityStepSettings | CommunityAction | null
  >(null);

  /**
   * Combine local steps and actions into a single array
   * so we can filter and map them easily.
   * Recomputed whenever localSteps or localActions changes.
   */
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
   * Handler for searching by text.
   */
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  /**
   * Handler for changing the filter (all, step, or action).
   */
  const handleSetFilter = (value: "all" | "step" | "action") => {
    setFilter(value);
  };

  /**
   * Handler to uninstall a given template.
   * This removes the template from both local state and the plugin settings,
   * then calls `plugin.saveSettings()` to persist.
   */
  const handleUninstall = useCallback(
    (templateId: string, templateType: "step" | "action") => {
      if (templateType === "step") {
        // Remove from local state
        setLocalSteps((prev) => {
          const updated = { ...prev };
          delete updated[templateId];
          return updated;
        });
        // Remove from plugin settings
        delete plugin.settings.installedTemplates.steps[templateId];
      } else {
        setLocalActions((prev) => {
          const updated = { ...prev };
          delete updated[templateId];
          return updated;
        });
        delete plugin.settings.installedTemplates.actions[templateId];
      }
      // Persist changes
      plugin.saveSettings();

      // If the uninstalled template is currently being viewed, clear it.
      setSelectedTemplate((prevSelected) => {
        if (!prevSelected) return null;
        if (
          prevSelected.id === templateId &&
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
   * Handler for selecting a template to view in detail.
   */
  const onTemplateClick = (
    template: CommunityStepSettings | CommunityAction
  ) => {
    setSelectedTemplate(template);
  };

  /**
   * Handler for going back to the list from the detail view.
   */
  const handleBack = () => {
    setSelectedTemplate(null);
  };

  /**
   * Memoized filter function to derive the list of templates
   * that match the current search term and filter type.
   */
  const filteredInstalled = useMemo(() => {
    // If nothing installed, short-circuit
    if (!allInstalled.length) {
      return [];
    }

    // Filter by search text
    const lowerSearch = searchTerm.toLowerCase();
    let filtered = allInstalled.filter((item) => {
      return (
        item.title.toLowerCase().includes(lowerSearch) ||
        item.description.toLowerCase().includes(lowerSearch) ||
        item.author.toLowerCase().includes(lowerSearch)
      );
    });

    // Then filter by type (if not 'all')
    if (filter !== "all") {
      filtered = filtered.filter((item) => item.type === filter);
    }

    return filtered;
  }, [allInstalled, searchTerm, filter]);

  /**
   * If a template is selected, render the detail view (Step or Action).
   * Otherwise, render the list.
   */
  if (selectedTemplate) {
    if (selectedTemplate.type === "step") {
      return (
        <InstalledStepDetail
          step={selectedTemplate as CommunityStepSettings}
          onBack={handleBack}
        />
      );
    }
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
      <h1>Installed Templates</h1>

      {/* Search and filter controls */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "1rem",
        }}
      >
        {/* Search bar */}
        <input
          type="text"
          placeholder="Search by title, description or author..."
          value={searchTerm}
          onChange={handleSearchChange}
          style={{ flex: 1, marginRight: "1rem", padding: "0.5rem" }}
        />

        {/* Filter buttons */}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={() => handleSetFilter("all")}
            style={{
              padding: "0.5rem",
              backgroundColor: filter === "all" ? "#cccccc" : "",
            }}
          >
            All
          </button>
          <button
            onClick={() => handleSetFilter("step")}
            style={{
              padding: "0.5rem",
              backgroundColor: filter === "step" ? "#cccccc" : "",
            }}
          >
            Steps
          </button>
          <button
            onClick={() => handleSetFilter("action")}
            style={{
              padding: "0.5rem",
              backgroundColor: filter === "action" ? "#cccccc" : "",
            }}
          >
            Actions
          </button>
        </div>
      </div>

      {filteredInstalled.length === 0 && (
        <p style={{ fontStyle: "italic" }}>No matching templates found.</p>
      )}

      {/* List of installed templates in card format */}
      <div
        className={c("actions-list")}
        style={{ display: "grid", gap: "1rem" }}
      >
        {filteredInstalled.map((template) => (
          <div
            key={template.id}
            className={c("actions-management-add-card")}
            onClick={() => onTemplateClick(template)}
            style={{
              border: "1px solid #ccc",
              borderRadius: "4px",
              padding: "1rem",
              cursor: "pointer",
            }}
          >
            <h3 style={{ margin: 0 }}>
              {template.title}{" "}
              <span style={{ fontSize: "0.9rem", color: "#555" }}>
                ({template.type})
              </span>
            </h3>
            <p style={{ margin: "0.5rem 0" }}>{template.description}</p>
            <small style={{ color: "#999" }}>
              Author: {template.author} - Downloads: {template.downloads}
            </small>
            <div style={{ marginTop: "0.5rem", textAlign: "right" }}>
              {/* Stop propagation to avoid triggering the onClick to open details */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleUninstall(template.id, template.type);
                }}
                style={{
                  padding: "0.3rem 0.7rem",
                  border: "none",
                  borderRadius: "4px",
                  backgroundColor: "#ff9999",
                  cursor: "pointer",
                }}
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
