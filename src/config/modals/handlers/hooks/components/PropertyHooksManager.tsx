import React, { useState, useEffect } from "react";
import { c } from "architecture";
import { t } from "architecture/lang";
import { ObsidianConfig } from "architecture/plugin";
import ZettelFlow from "main";
import { PropertyHookSettings } from "config/typing";
import { log } from "architecture";
import { Icon } from "architecture/components/icon";
import { v4 as uuid4 } from "uuid";
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { PropertyHookAccordion } from "./PropertyHookAccordion";

interface PropertyHooksManagerProps {
  plugin: ZettelFlow;
}

export const PropertyHooksManager: React.FC<PropertyHooksManagerProps> = ({
  plugin,
}) => {
  const [propertyTypes, setPropertyTypes] = useState<Record<string, string>>(
    {}
  );
  const [hooks, setHooks] = useState<Record<string, PropertyHookSettings>>({});
  const [hookOrder, setHookOrder] = useState<string[]>([]);
  const [editingScripts, setEditingScripts] = useState<Record<string, string>>(
    {}
  );
  const [isAddingHook, setIsAddingHook] = useState(false);
  const [selectedNewProperty, setSelectedNewProperty] = useState("");

  // Setup dndkit sensors with a minimum activation distance
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Load hooks from plugin settings
  useEffect(() => {
    const currentHooks = plugin.settings.propertyHooks || {};
    log.debug("Loading hooks from plugin settings:", currentHooks);
    setHooks(currentHooks);
    setHookOrder(Object.keys(currentHooks));

    // Initialize editing scripts with current values
    const scripts: Record<string, string> = {};
    Object.entries(currentHooks).forEach(([property, hook]) => {
      scripts[property] = hook.script;
    });
    setEditingScripts(scripts);
  }, [plugin.settings]);

  useEffect(() => {
    // Load all property types from Obsidian config
    const loadPropertyTypes = async () => {
      const types = await ObsidianConfig.getTypes();
      setPropertyTypes(types);
    };
    loadPropertyTypes();
  }, []);

  const saveHooks = async () => {
    const newHooks = { ...hooks };
    plugin.settings.propertyHooks = newHooks;
    await plugin.saveSettings();
    log.debug("Hooks saved:", newHooks);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = hookOrder.findIndex(
        (property) => property === active.id
      );
      const newIndex = hookOrder.findIndex((property) => property === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newHookOrder = arrayMove(hookOrder, oldIndex, newIndex);
        setHookOrder(newHookOrder);

        // Rebuild the hooks object in the new order
        const orderedHooks: Record<string, PropertyHookSettings> = {};
        newHookOrder.forEach((property) => {
          orderedHooks[property] = hooks[property];
        });

        setHooks(orderedHooks);
        plugin.settings.propertyHooks = orderedHooks;
        plugin.saveSettings();
      }
    }
  };

  const handleAddHook = () => {
    setIsAddingHook(true);
    setSelectedNewProperty("");
  };

  const handleAddHookConfirm = async () => {
    if (selectedNewProperty) {
      const newHooks = { ...hooks };
      newHooks[selectedNewProperty] = { script: "" };
      setHooks(newHooks);
      setHookOrder([...hookOrder, selectedNewProperty]);
      setEditingScripts({ ...editingScripts, [selectedNewProperty]: "" });
      await saveHooks();
      setIsAddingHook(false);
    }
  };

  const handleAddHookCancel = () => {
    setIsAddingHook(false);
  };

  const handleSaveHook = async (property: string, script: string) => {
    const newHooks = { ...hooks };
    newHooks[property] = { script };
    setHooks(newHooks);
    setEditingScripts({ ...editingScripts, [property]: script });
    await saveHooks();
  };

  const handleDeleteHook = async (property: string) => {
    const newHooks = { ...hooks };
    delete newHooks[property];
    setHooks(newHooks);
    setHookOrder(hookOrder.filter((p) => p !== property));
    await saveHooks();
  };

  // Get available properties (excluding ones that already have hooks)
  const existingHookProperties = Object.keys(hooks);
  const availableProperties = Object.keys(propertyTypes).filter(
    (prop) => !existingHookProperties.includes(prop)
  );

  return (
    <div className={c("property-hooks-manager")}>
      <div className={c("property-hooks-header")}>
        <h3>{t("property_hooks_title")}</h3>
        <button
          className={c("property-hooks-add-button")}
          onClick={handleAddHook}
        >
          <Icon name="plus" />
          {t("property_hooks_add_button")}
        </button>
      </div>

      {isAddingHook && (
        <div className={c("property-hook-selector")}>
          <select
            value={selectedNewProperty}
            onChange={(e) => setSelectedNewProperty(e.target.value)}
          >
            <option value="">{t("property_hooks_select_property")}</option>
            {availableProperties.map((prop) => (
              <option key={prop} value={prop}>
                {prop}
              </option>
            ))}
          </select>
          <div className={c("property-hook-selector-buttons")}>
            <button onClick={handleAddHookConfirm}>
              {t("property_hooks_add_button")}
            </button>
            <button onClick={handleAddHookCancel}>
              {t("property_hooks_cancel_button")}
            </button>
          </div>
        </div>
      )}

      {hookOrder.length === 0 ? (
        <div className={c("property-hooks-empty")}>
          {t("property_hooks_empty")}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToVerticalAxis]}
        >
          <SortableContext
            items={hookOrder}
            strategy={verticalListSortingStrategy}
          >
            <div className={c("property-hooks-list")}>
              {hookOrder.map((property) => (
                <PropertyHookAccordion
                  key={property || uuid4()}
                  property={property}
                  propertyType={propertyTypes[property] || "unknown"}
                  script={editingScripts[property] || ""}
                  onScriptChange={(value) => {
                    setEditingScripts({
                      ...editingScripts,
                      [property]: value,
                    });
                  }}
                  onSave={(script) => handleSaveHook(property, script)}
                  onDelete={() => handleDeleteHook(property)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
};
