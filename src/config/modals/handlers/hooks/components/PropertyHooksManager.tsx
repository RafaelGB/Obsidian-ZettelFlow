import React, { useState, useEffect } from "react";
import { c } from "architecture";
import { t } from "architecture/lang";
import { ObsidianConfig } from "architecture/plugin";
import ZettelFlow from "main";
import { PropertyHookSettings } from "config/typing";
import { CodeEditor } from "./CodeEditor";
import { log } from "architecture";

// Define interfaces outside component definitions
interface PropertyHooksManagerProps {
  plugin: ZettelFlow;
  refreshSettings?: () => void; // Make refreshSettings optional
}

interface PropertyHookEditModalProps {
  plugin: ZettelFlow;
  propertyTypes: Record<string, string>;
  initialProperty: string | null;
  initialScript: string;
  onSave: (property: string, script: string) => void;
  onClose: () => void;
}

// Export the PropertyHookEditModal as a separate component
export const PropertyHookEditModal: React.FC<PropertyHookEditModalProps> = ({
  plugin,
  propertyTypes,
  initialProperty,
  initialScript,
  onSave,
  onClose,
}) => {
  const { settings } = plugin;
  const { propertyHooks } = settings;

  const [property, setProperty] = useState(initialProperty || "");
  const [script, setScript] = useState(initialScript || "");
  const [availableProperties, setAvailableProperties] = useState<string[]>([]);
  const [isEditing] = useState(!!initialProperty);

  useEffect(() => {
    // Filter out properties that already have hooks (except the one being edited)
    const existingHookProperties = Object.keys(propertyHooks || {});
    const filtered = Object.keys(propertyTypes).filter(
      (prop) =>
        !existingHookProperties.includes(prop) || prop === initialProperty
    );
    setAvailableProperties(filtered);
  }, [propertyTypes, initialProperty, propertyHooks]);

  return (
    <div className={c("property-hook-modal-overlay")}>
      <div className={c("property-hook-modal")}>
        <h3>
          {isEditing
            ? t("property_hooks_edit_title")
            : t("property_hooks_add_title")}
        </h3>

        <div className={c("property-hook-form")}>
          <div className={c("property-hook-field")}>
            <label>{t("property_hooks_property_label")}</label>
            <select
              value={property}
              onChange={(e) => setProperty(e.target.value)}
              disabled={isEditing}
            >
              <option value="">{t("property_hooks_select_property")}</option>
              {availableProperties.map((prop) => (
                <option key={prop} value={prop}>
                  {prop}
                </option>
              ))}
            </select>
          </div>

          <div className={c("property-hook-field")}>
            <label>{t("property_hooks_script_label")}</label>
            <p className={c("property-hook-script-hint")}>
              {t("property_hooks_script_hint")}
            </p>
            <CodeEditor value={script} onChange={setScript} />
          </div>
        </div>

        <div className={c("property-hook-modal-buttons")}>
          <button onClick={onClose}>{t("property_hooks_cancel_button")}</button>
          <button
            onClick={() => onSave(property, script)}
            disabled={!property || !script}
            className={c("property-hook-save-button")}
          >
            {t("property_hooks_save_button")}
          </button>
        </div>
      </div>
    </div>
  );
};

// Main component as a separate export
export const PropertyHooksManager: React.FC<PropertyHooksManagerProps> = ({
  plugin,
  refreshSettings,
}) => {
  const [propertyTypes, setPropertyTypes] = useState<Record<string, string>>(
    {}
  );
  const [hooks, setHooks] = useState<Record<string, PropertyHookSettings>>({});
  const [selectedHook, setSelectedHook] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Load hooks from plugin settings on initial render and when settings change
  useEffect(() => {
    const currentHooks = plugin.settings.propertyHooks || {};
    log.debug("Loading hooks from plugin settings:", currentHooks);
    setHooks(currentHooks);
  }, [plugin.settings]);

  useEffect(() => {
    // Load all property types from Obsidian config
    const loadPropertyTypes = async () => {
      const types = await ObsidianConfig.getTypes();
      setPropertyTypes(types);
    };
    loadPropertyTypes();
  }, []);

  const saveHooks = async (newHooks: Record<string, PropertyHookSettings>) => {
    log.debug("Saving hooks:", newHooks);
    plugin.settings.propertyHooks = newHooks;
    await plugin.saveSettings();

    // Update local state
    setHooks(newHooks);

    // Only call refreshSettings if provided
    if (refreshSettings) {
      refreshSettings();
    }
  };

  const handleAddHook = () => {
    setSelectedHook(null);
    setIsEditModalOpen(true);
  };

  const handleEditHook = (property: string) => {
    setSelectedHook(property);
    setIsEditModalOpen(true);
  };

  const handleDeleteHook = async (property: string) => {
    const newHooks: Record<string, PropertyHookSettings> = { ...hooks };
    delete newHooks[property];
    await saveHooks(newHooks);
  };

  return (
    <div className={c("property-hooks-manager")}>
      <div className={c("property-hooks-header")}>
        <h3>{t("property_hooks_title")}</h3>
        <button
          className={c("property-hooks-add-button")}
          onClick={handleAddHook}
        >
          {t("property_hooks_add_button")}
        </button>
      </div>

      {Object.keys(hooks).length === 0 ? (
        <div className={c("property-hooks-empty")}>
          {t("property_hooks_empty")}
        </div>
      ) : (
        <div className={c("property-hooks-list")}>
          {Object.entries(hooks).map(([property, _]) => (
            <div key={property} className={c("property-hooks-item")}>
              <div className={c("property-hooks-item-header")}>
                <strong>{property}</strong>
                <span className={c("property-type-badge")}>
                  {propertyTypes[property] || "unknown"}
                </span>
              </div>
              <div className={c("property-hooks-item-actions")}>
                <button onClick={() => handleEditHook(property)}>
                  {t("property_hooks_edit_button")}
                </button>
                <button onClick={() => handleDeleteHook(property)}>
                  {t("property_hooks_delete_button")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {isEditModalOpen && (
        <PropertyHookEditModal
          plugin={plugin}
          propertyTypes={propertyTypes}
          initialProperty={selectedHook}
          initialScript={selectedHook ? hooks[selectedHook]?.script : ""}
          onSave={async (property, script) => {
            const newHooks = { ...hooks };
            newHooks[property] = { script };
            await saveHooks(newHooks);
            setIsEditModalOpen(false);
          }}
          onClose={() => setIsEditModalOpen(false)}
        />
      )}
    </div>
  );
};
