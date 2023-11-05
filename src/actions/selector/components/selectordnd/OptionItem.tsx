import { c } from "architecture";
import React, { useRef, useState } from "react";
import { Droppable, useDragHandle } from "architecture/components/dnd";
import { Icon } from "architecture/components/icon";
import { OptionItemProps } from "./model/OptionItemModel";
import { SELECTOR_DND_ID } from "./utils/Identifiers";

export function OptionItem(props: OptionItemProps) {
  const {
    frontmatter,
    label,
    index,
    isDefault,
    deleteOptionCallback,
    updateOptionInfoCallback,
    changeDefaultCallback,
  } = props;
  const measureRef = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLDivElement>(null);

  useDragHandle(SELECTOR_DND_ID, measureRef, dragHandleRef, index);

  const [frontmatterValue, setFrontmatterValue] = useState(frontmatter);
  const [labelValue, setLabelValue] = useState(label);
  const body = (
    <div className={c("input_group")}>
      <div>
        <div className={c("input_item")}>Frontmatter value</div>
        <input
          type="text"
          value={frontmatterValue}
          onChange={(e) => {
            setFrontmatterValue(e.target.value);
            updateOptionInfoCallback(index, e.target.value, labelValue);
          }}
        />
      </div>
      <div>
        <div className={c("input_item")}>Label value</div>
        <input
          type="text"
          value={labelValue}
          onChange={(e) => {
            setLabelValue(e.target.value);
            updateOptionInfoCallback(index, frontmatterValue, e.target.value);
          }}
        />
      </div>
      <div className={c("settings-toggle-group")}>
        <div>
          <div
            className={`checkbox-container${isDefault ? " is-enabled" : ""}`}
            onClick={() => {
              changeDefaultCallback(frontmatter);
            }}
            aria-label={"Set as default"}
          />
          <div className={c("setting-item-label")}>{"Set as default"}</div>
        </div>
      </div>
    </div>
  );

  return (
    <div ref={measureRef}>
      <div className={c("settings-item")}>
        <Droppable index={index}>{body}</Droppable>
        <div className={c("setting-button-group")}>
          <div
            className="clickable-icon"
            onClick={() => deleteOptionCallback(index)}
            aria-label="Delete"
          >
            <Icon name="lucide-trash-2" />
          </div>
          <div
            className="mobile-option-setting-drag-icon clickable-icon"
            aria-label="Drag to rearrange"
            ref={dragHandleRef}
          >
            <Icon name="lucide-grip-horizontal" />
          </div>
        </div>
      </div>
    </div>
  );
}
