import React, { useState, useEffect } from "react";
import { c } from "architecture";
import { t } from "architecture/lang";
import { Icon } from "architecture/components/icon";
import { CodeEditor } from "./CodeEditor";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface PropertyHookAccordionProps {
  property: string;
  propertyType: string;
  script: string;
  onSave: (script: string) => void;
  onDelete: () => void;
}

export const PropertyHookAccordion: React.FC<PropertyHookAccordionProps> = ({
  property,
  propertyType,
  script,
  onSave,
  onDelete,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [animationClass, setAnimationClass] = useState("entrance");
  const [localScript, setLocalScript] = useState(script);

  useEffect(() => {
    setLocalScript(script);

    const timer = setTimeout(() => {
      setAnimationClass("");
    }, 300);

    return () => clearTimeout(timer);
  }, [script]);

  // Integrate with dndkit for drag-and-drop
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: property });

  // Apply transformation styles provided by dndkit
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Handle the removal with animation
  const handleDelete = () => {
    setAnimationClass("exit");
    setTimeout(() => {
      onDelete();
    }, 300);
  };

  // Handle the save action
  const handleSave = () => {
    console.log("Saving script:", localScript);
    onSave(localScript);
    setIsOpen(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${c("property-hooks-item")} ${animationClass}`}
    >
      <div className={c("property-hooks-item-header")}>
        <div className={c("property-hooks-item-info")}>
          <strong>{property}</strong>
          <span className={c("property-type-badge")}>{propertyType}</span>
        </div>

        <div className={c("property-hooks-item-actions")}>
          {/* Drag handle with dndkit listeners */}
          <div
            className={c("property-hooks-drag-handle")}
            aria-label="Drag to rearrange"
            {...attributes}
            {...listeners}
          >
            <Icon name="lucide-grip-horizontal" />
          </div>

          <button
            onClick={() => setIsOpen(!isOpen)}
            className={c("property-hooks-edit-button")}
            title={
              t(
                isOpen ? "property_hooks_title" : "property_hooks_empty"
              ) as string
            }
          >
            <Icon name={isOpen ? "up-chevron-glyph" : "down-chevron-glyph"} />
          </button>

          <button
            onClick={handleDelete}
            className={c("property-hooks-delete-button")}
            title={t("property_hooks_delete_button")}
          >
            <Icon name="cross" />
          </button>
        </div>
      </div>

      {isOpen && (
        <div className={c("property-hooks-item-editor")}>
          <div className={c("property-hook-field")}>
            <label>{t("property_hooks_script_label")}</label>
            <p className={c("property-hook-script-hint")}>
              {t("property_hooks_script_hint")}
            </p>
            <CodeEditor
              value={localScript}
              onChange={(value) => {
                setLocalScript(value);
              }}
            />
          </div>

          <div className={c("property-hook-editor-buttons")}>
            <button
              onClick={() => setIsOpen(false)}
              className={c("property-hook-cancel-button")}
            >
              {t("property_hooks_cancel_button")}
            </button>

            <button
              onClick={handleSave}
              className={c("property-hook-save-button")}
              disabled={!localScript}
            >
              {t("property_hooks_save_button")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
