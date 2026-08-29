import React, { useState, useEffect } from "react";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { Keyboard, ObsidianNativeTypesManager } from "architecture/plugin";
import ZettelFlow from "main";
import { PropertyHookSettings } from "config/typing";
import { Icon } from "architecture/components/icon";
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { PropertyHookAccordion } from "./PropertyHookAccordion";
import { HookErrorBoundary } from "./HookErrorBoundary";
import { Search } from "architecture/components/core";
import { ObsidianTypesModal } from "config";
import { VaultHooks, HookDryRunResult } from "hooks/VaultHooks";
import {
  HookItem,
  toItems,
  toRecord,
  addHook,
  updateHook as updateHookItem,
  deleteHook as deleteHookItem,
  reorderHooks,
} from "../hookItems";

interface PropertyHooksManagerProps {
  plugin: ZettelFlow;
}

/**
 * The property-hooks manager (#327). A single ordered `items` array is the source of truth — the old
 * split `hooks`/`hookOrder` state could desync and blank the list. All mutations go through the pure,
 * unit-tested {@link hookItems} operations; adding a hook appends + auto-opens it; every mutation persists
 * atomically and defensively. Wrapped in a `HookErrorBoundary` at the mount site so a render throw can
 * never silently wipe the panel.
 */
export const PropertyHooksManager: React.FC<PropertyHooksManagerProps> = ({
  plugin,
}) => {
  const [items, setItems] = useState<HookItem[]>(() => toItems(plugin.settings.hooks.properties));
  const [propertyTypes, setPropertyTypes] = useState<Record<string, string>>({});
  const [isAddingHook, setIsAddingHook] = useState(false);
  const [selectedNewProperty, setSelectedNewProperty] = useState("");
  const [newlyAdded, setNewlyAdded] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  useEffect(() => {
    const loadPropertyTypes = async () => {
      try {
        setPropertyTypes(await ObsidianNativeTypesManager.getAllTypes());
      } catch (error) {
        log.error("[PropertyHooks] could not load property types", error);
        setPropertyTypes({});
      }
    };
    void loadPropertyTypes();
  }, []);

  /** The single write path: update React state + persist, atomically and defensively. */
  const persist = (next: HookItem[]) => {
    setItems(next);
    try {
      plugin.settings.hooks.properties = toRecord(next);
      void plugin.saveSettings();
      log.debug("[PropertyHooks] saved", next.length, "hook(s)");
    } catch (error) {
      log.error("[PropertyHooks] failed to persist hooks", error);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.property === active.id);
    const to = items.findIndex((i) => i.property === over.id);
    const next = reorderHooks(items, from, to);
    if (next !== items) persist(next);
  };

  const handleAddHookConfirm = () => {
    const property = selectedNewProperty;
    const next = addHook(items, property);
    if (next === items) return; // blank or duplicate — nothing added
    persist(next);
    setNewlyAdded(property);
    setIsAddingHook(false);
    setSelectedNewProperty("");
  };

  const handleAddHookCancel = () => {
    setIsAddingHook(false);
    setSelectedNewProperty("");
  };

  const updateHook = (property: string, patch: Partial<PropertyHookSettings>) => {
    persist(updateHookItem(items, property, patch));
  };

  const deleteHook = (property: string) => {
    persist(deleteHookItem(items, property));
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
                // Per-row boundary: a crash in one hook row can never blank the others (#327 hardening).
                <HookErrorBoundary key={item.property}>
                  <PropertyHookAccordion
                    property={item.property}
                    propertyType={propertyTypes[item.property] || "unknown"}
                    settings={item.settings}
                    defaultOpen={item.property === newlyAdded}
                    onChange={(patch) => updateHook(item.property, patch)}
                    onDelete={() => deleteHook(item.property)}
                    onTest={(settings) => testHook(item.property, settings)}
                  />
                </HookErrorBoundary>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
};
