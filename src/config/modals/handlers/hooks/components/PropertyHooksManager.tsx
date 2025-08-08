import React, { useState, useEffect } from "react";
import { c } from "architecture";
import { t } from "architecture/lang";
import { ObsidianNativeTypesManager } from "architecture/plugin";
import ZettelFlow from "main";
import { PropertyHookSettings } from "config/typing";
import { log } from "architecture";
import { Icon } from "architecture/components/icon";
import { v7 as uuid7 } from "uuid";
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
import { Search } from "architecture/components/core";
import { CommunityTemplatesModal } from "application/community";
import { ObsidianTypesModal } from "config";

interface PropertyHooksManagerProps {
  plugin: ZettelFlow;
}

export const PropertyHooksManager: React.FC<PropertyHooksManagerProps> = ({
  plugin,
}) => {
  const { properties } = plugin.settings.hooks;

  // State variables
  const [propertyTypes, setPropertyTypes] = useState<Record<string, string>>(
    {}
  );
  const [hooks, setHooks] = useState<Record<string, PropertyHookSettings>>(
    properties || {}
  );
  const [hookOrder, setHookOrder] = useState<string[]>(
    Object.keys(properties || [])
  );
  const [isAddingHook, setIsAddingHook] = useState(false);
  const [selectedNewProperty, setSelectedNewProperty] = useState("");

  // Setup dndkit sensors with a minimum activation distance
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  useEffect(() => {
    // Load all property types from Obsidian config
    const loadPropertyTypes = async () => {
      const types = await ObsidianNativeTypesManager.getTypes();
      setPropertyTypes(types);
    };
    loadPropertyTypes();
  }, []);

  const saveHooks = async (newHooks: Record<string, PropertyHookSettings>) => {
    plugin.settings.hooks.properties = newHooks;
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
        plugin.settings.hooks.properties = orderedHooks;
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
      hooks[selectedNewProperty] = { script: "" };
      setHooks({ ...hooks });
      setHookOrder([...hookOrder, selectedNewProperty]);
      await saveHooks(hooks);
      setIsAddingHook(false);
    }
  };

  const handleAddHookCancel = () => {
    setIsAddingHook(false);
    setSelectedNewProperty("");
  };

  const handleSaveHook = async (property: string, script: string) => {
    hooks[property] = { script };
    setHooks({ ...hooks });
    await saveHooks(hooks);
  };

  const handleDeleteHook = async (property: string) => {
    delete hooks[property];
    setHooks({ ...hooks });
    setHookOrder(hookOrder.filter((p) => p !== property));
    await saveHooks(hooks);
  };

  // Get available properties (excluding ones that already have hooks)
  const existingHookProperties = Object.keys(hooks);
  const availableProperties: Record<string, string> = Object.keys(propertyTypes)
    .filter((prop) => !existingHookProperties.includes(prop))
    .reduce((acc: Record<string, string>, prop) => {
      const keyToDisplay = `${prop} (${propertyTypes[prop]})`;
      acc[keyToDisplay] = prop;
      return acc;
    }, {});

  return (
    <div className={c("property-hooks-manager")}>
      <div className={c("property-hooks-header")}>
        <button
          className={c("property-hooks-add-button")}
          onClick={handleAddHook}
        >
          <Icon name="plus" />
          {t("property_hooks_add_button")}
        </button>
        <button
          className={"mod-cta"}
          onClick={async () => {
            new ObsidianTypesModal(plugin).open();
          }}
        >
          <Icon name="ManageTypes" />
          {t("manage_types_button")}
        </button>
      </div>

      {isAddingHook && (
        <div className={c("property-hook-selector")}>
          <Search
            options={availableProperties}
            onChange={async (value) => {
              if (!value) return;
              if (!propertyTypes[value]) return;
              setSelectedNewProperty(value);
            }}
            placeholder="Select a type"
          />
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
                  key={property || uuid7()}
                  property={property}
                  propertyType={propertyTypes[property] || "unknown"}
                  script={hooks[property].script || ""}
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
