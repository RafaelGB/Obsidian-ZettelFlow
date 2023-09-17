import { c } from "architecture";
import React, { useRef, useState } from "react";
import { OptionItemProps } from "./model/OptionItemModel";
import { Droppable, useDragHandle } from "architecture/components/dnd";
import { Icon } from "architecture/components/icon";
import { SELECTOR_DND_ID } from "./utils/Identifiers";

export function OptionItem(props: OptionItemProps) {
  const { frontmatter, label, index } = props;
  const measureRef = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLDivElement>(null);

  useDragHandle(SELECTOR_DND_ID, measureRef, dragHandleRef);

  const [frontmatterValue, setFrontmatterValue] = useState(frontmatter);
  const [labelValue, setLabelValue] = useState(label);
  const body = (
    <div className={c("input_group")}>
      <div>
        <div className={c("input_item")}>Frontmatter value</div>
        <input
          type="text"
          value={frontmatterValue}
          onChange={(e) => setFrontmatterValue(e.target.value)}
        />
      </div>
      <div>
        <div className={c("input_item")}>Label value</div>
        <input
          type="text"
          value={labelValue}
          onChange={(e) => setLabelValue(e.target.value)}
        />
      </div>
    </div>
  );

  return (
    <div className={c("settings-item")} ref={measureRef}>
      <Droppable index={index} measureRef={measureRef}>
        {body}
      </Droppable>
      <div className={c("setting-button-group")}>
        <div
          className="clickable-icon"
          onClick={() => console.log("delete")}
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
  );
}
