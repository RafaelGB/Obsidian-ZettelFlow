import React, { useState, useEffect } from "react";
import { c } from "architecture";
import { t } from "architecture/lang";
import { Keyboard, ObsidianNativeTypesManager } from "architecture/plugin";
import ZettelFlow from "main";
import { PropertyHookSettings } from "config/typing";
import { log } from "architecture";
import { Icon } from "architecture/components/icon";
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
import { ObsidianTypesModal } from "config";
import { VaultHooks, HookDryRunResult } from "hooks/VaultHooks";

interface PropertyHooksManagerProps {
  plugin: ZettelFlow;
}

/** One ordered hook: the property it fires on + its settings. The array *is* the source of truth. */
interface HookItem {
  property: string;
  settings: PropertyHookSettings;
}

function toItems(record: Record<string, PropertyHookSettings> | undefined): HookItem[] {
  return Object.entries(record || {}).map(([property, settings]) => ({
    property,
    settings: settings ?? { script: "" },
  }));
}

/**
 * The property-hooks manager (#327). A single ordered `items` array is the source of truth — the old
 * split `hooks`/`hookOrder` state could desync and blank the list. Adding a hook appends + auto-opens
 * it; every mutation persists atomically. Each hook can be paused, described, gated by a condition, and
 * dry-run against the active note.
 */
export const PropertyHooksManager: React.FC<PropertyHooksManagerProps> = ({
  plugin,
}) => {
  const [items, setItems] = useState<HookItem[]>(() =>
    toItems(plugin.settings.hooks.properties)
  );
  const [propertyTypes, setPropertyTypes] = useState<Record<string, string>>({});
  const [isAddingHook, setIsAddingHook] = useState(false);
  const [selectedNewProperty, setSelectedNewProperty] = useState("");
  const [newlyAdded, setNewlyAdded] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  useEffect(() => {
    const loadPropertyTypes = async () => {
      const types = await ObsidianNativeTypesManager.getAllTypes();
      setPropertyTypes(types);
    };
    void loadPropertyTypes();
  }, []);

  /** The single write path: update state + settings + persist together, so they can never desync. */
  const persist = (next: HookItem[]) => {
    setItems(next);
    const record: Record<string, PropertyHookSettings> = {};
    next.forEach((item) => (record[item.property] = item.settings));
    plugin.settings.hooks.properties = record;
    void plugin.saveSettings();
    log.debug("Hooks saved:", record);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.property === active.id);
    const newIndex = items.findIndex((i) => i.property === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      persist(arrayMove(items, oldIndex, newIndex));
    }
  };

  const handleAddHookConfirm = () => {
    const property = selectedNewProperty;
    if (!property || items.some((i) => i.property === property)) return;
    persist([...items, { property, settings: { script: "", enabled: true } }]);
    setNewlyAdded(property);
    setIsAddingHook(false);
    setSelectedNewProperty("");
  };

  const handleAddHookCancel = () => {
    setIsAddingHook(false);
    setSelectedNewProperty("");
  };

  const updateHook = (property: string, patch: Partial<PropertyHookSettings>) => {
    persist(
      items.map((i) =>
        i.property === property ? { property, settings: { ...i.settings, ...patch } } : i
      )
    );
  };

  const deleteHook = (property: string) => {
    persist(items.filter((i) => i.property !== property));
    if (newlyAdded === property) setNewlyAdded(null);
  };

  const testHook = (property: string, settings: PropertyHookSettings): Promise<HookDryRunResult> =>
    VaultHooks.dryRun(plugin.app, property, settings);

  // Available properties: those without a hook yet, labelled with their type.
  const existing = new Set(items.map((i) => i.property));
  const availableProperties: Record<string, string> = Object.keys(propertyTypes)
    .filter((prop) => !existing.has(prop))
    .reduce((acc: Record<string, string>, prop) => {
      acc[`${prop} (${propertyTypes[prop]})`] = prop;
      return acc;
    }, {});

  return (
    <div className={c("property-hooks-manager")}>
      <div className={c("property-hooks-header")}>
        <button
          className={c("property-hooks-btn", "property-hooks-btn--cta")}
          onClick={() => {
            setIsAddingHook(true);
            setSelectedNewProperty("");
          }}
        >
          <Icon name="plus" />
          <span>{t("property_hooks_add_button")}</span>
        </button>
        <div className={c("property-hooks-btn-group")}>
          <button
            className={c("property-hooks-btn")}
            title={t("types_modal_native_properties_edit_button_title")}
            aria-label={t("types_modal_native_properties_edit_button_title")}
            onClick={() => {
              const leaf = plugin.app.workspace.getLeavesOfType("all-properties")[0];
              if (leaf) void plugin.app.workspace.revealLeaf(leaf);
              Keyboard.closeAllModalsByEsc();
            }}
          >
            <Icon name="archive" />
          </button>
          <button
            className={c("property-hooks-btn")}
            onClick={() => new ObsidianTypesModal(plugin).open()}
          >
            <Icon name="ManageTypes" />
            <span>{t("manage_types_button")}</span>
          </button>
        </div>
      </div>

      {isAddingHook && (
        <div className={c("property-hook-selector")}>
          <Search
            options={availableProperties}
            onChange={(value) => {
              if (!value || !propertyTypes[value]) return;
              setSelectedNewProperty(value);
            }}
            placeholder={t("property_hooks_select_placeholder")}
          />
          <div className={c("property-hook-selector-buttons")}>
            <button
              className={c("property-hooks-btn", "property-hooks-btn--cta")}
              disabled={!selectedNewProperty}
              onClick={handleAddHookConfirm}
            >
              {t("property_hooks_add_confirm")}
            </button>
            <button className={c("property-hooks-btn")} onClick={handleAddHookCancel}>
              {t("property_hooks_cancel_button")}
            </button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className={c("property-hooks-empty")}>{t("property_hooks_empty")}</div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToVerticalAxis]}
        >
          <SortableContext
            items={items.map((i) => i.property)}
            strategy={verticalListSortingStrategy}
          >
            <div className={c("property-hooks-list")}>
              {items.map((item) => (
                <PropertyHookAccordion
                  key={item.property}
                  property={item.property}
                  propertyType={propertyTypes[item.property] || "unknown"}
                  settings={item.settings}
                  defaultOpen={item.property === newlyAdded}
                  onChange={(patch) => updateHook(item.property, patch)}
                  onDelete={() => deleteHook(item.property)}
                  onTest={(settings) => testHook(item.property, settings)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
};
