import React, { useMemo, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { c } from "architecture";
import { t } from "architecture/lang";
import { Icon } from "architecture/components/icon";
import { OptionItemProps } from "./model/OptionItemModel";
import { useOptionsContext } from "./contexts/OptionsContext";

interface OptionItemExtendedProps extends OptionItemProps {
  id: string;
}

export function OptionItem({ index, id }: OptionItemExtendedProps) {
  const {
    options,
    defaultOption,
    delete: deleteOption,
    update,
    modifyDefault,
  } = useOptionsContext();
  const [frontmatterValue, setFrontmatterValue] = useState(options[index][0]);
  const [labelValue, setLabelValue] = useState(options[index][1]);

  // Initialize sortable hook from dndkit
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });

  // Style transformation for the draggable item
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Determine if the current option is set as default
  const isDefault = useMemo(
    () => defaultOption === options[index][0],
    [defaultOption, options, index]
  );

  return (
    <div ref={setNodeRef} style={style} className={c("settings-item")}>
      <div className={c("settings-item-content")}>
        <div className={c("input_group")}>
          <div>
            <div className={c("input_item")}>{t("selector_option_value")}</div>
            <input
              type="text"
              value={frontmatterValue}
              onChange={(e) => setFrontmatterValue(e.target.value)}
              onBlur={() => update(index, frontmatterValue.trim(), labelValue)}
            />
          </div>
          <div>
            <div className={c("input_item")}>{t("selector_option_label")}</div>
            <input
              type="text"
              value={labelValue}
              onChange={(e) => setLabelValue(e.target.value)}
              onBlur={() => update(index, frontmatterValue.trim(), labelValue)}
            />
          </div>
          <div className={c("settings-toggle-group")}>
            <div>
              <div
                className={`checkbox-container${
                  isDefault ? " is-enabled" : ""
                }`}
                onClick={() => modifyDefault(options[index][0])}
                aria-label={t("selector_option_default")}
              />
              <div className={c("setting-item-label")}>{t("selector_option_default")}</div>
            </div>
          </div>
        </div>
      </div>
      <div className={c("setting-button-group")}>
        <div
          className="clickable-icon"
          onClick={() => deleteOption(index)}
          aria-label={t("selector_option_delete")}
        >
          <Icon name="lucide-trash-2" />
        </div>
        {/* Drag handle: attaches dndkit listeners to enable dragging */}
        <div
          className="clickable-icon"
          {...attributes}
          {...listeners}
          aria-label={t("selector_option_drag")}
        >
          <Icon name="lucide-grip-horizontal" />
        </div>
      </div>
    </div>
  );
}
