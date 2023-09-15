import { c } from "architecture";
import React from "react";
import { OptionItemProps } from "./model/OptionItemModel";
import { Droppable } from "architecture/components/dnd";

export function OptionItem(props: OptionItemProps) {
  const { frontmatter, label, index } = props;

  const [frontmatterValue, setFrontmatterValue] = React.useState(frontmatter);
  const [labelValue, setLabelValue] = React.useState(label);
  const body = (
    <div className={c("setting-input-wrapper")}>
      <div>
        <div className={c("setting-item-label")}>Frontmatter value</div>
        <input
          type="text"
          value={frontmatterValue}
          onChange={(e) => setFrontmatterValue(e.target.value)}
        />
      </div>
      <div>
        <div className={c("setting-item-label")}>Label value</div>
        <input
          type="text"
          value={labelValue}
          onChange={(e) => setLabelValue(e.target.value)}
        />
      </div>
    </div>
  );

  return <Droppable index={index}>{body}</Droppable>;
}
