import { c } from "architecture";
import React from "react";
import { OptionItemProps } from "./model/OptionItemModel";
import { Droppable } from "architecture/components/dnd";
import { Icon } from "architecture/components/icon";

export function OptionItem(props: OptionItemProps) {
  const { frontmatter, label, index } = props;

  const [frontmatterValue, setFrontmatterValue] = React.useState(frontmatter);
  const [labelValue, setLabelValue] = React.useState(label);
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
    <div className={c("settings-item")}>
      <Droppable index={index}>{body}</Droppable>
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
          ref={() => console.log("drag")}
        >
          <Icon name="lucide-grip-horizontal" />
        </div>
      </div>
    </div>
  );
}
