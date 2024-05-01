import { c } from "architecture";
import React, { useMemo, useRef, useState } from "react";
import { Droppable, useDragHandle } from "architecture/components/dnd";
import { Icon } from "architecture/components/icon";
import { OptionItemProps } from "./model/OptionItemModel";

import { useOptionsContext } from "./contexts/OptionsContext";

export function OptionItem(props: OptionItemProps) {
  const { index } = props;
  const measureRef = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLDivElement>(null);
  const {
    options,
    defaultOption,
    delete: deleteOption,
    update,
    modifyDefault,
  } = useOptionsContext();
  const [key, value] = options[index];
  const { id } = useOptionsContext();
  useDragHandle(id, measureRef, dragHandleRef, index);

  const [frontmatterValue, setFrontmatterValue] = useState(key);
  const [labelValue, setLabelValue] = useState(value);

  const isDefaultMemo = useMemo(() => {
    return defaultOption === key;
  }, [defaultOption]);

  const body = (
    <div className={c("input_group")}>
      <div>
        <div className={c("input_item")}>Frontmatter value</div>
        <input
          type="text"
          value={frontmatterValue}
          onChange={(e) => {
            setFrontmatterValue(e.target.value);
            update(index, e.target.value, labelValue);
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
            update(index, frontmatterValue, e.target.value);
          }}
        />
      </div>
      <div className={c("settings-toggle-group")}>
        <div>
          <div
            className={`checkbox-container${
              isDefaultMemo ? " is-enabled" : ""
            }`}
            onClick={() => {
              modifyDefault(key);
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
            onClick={() => deleteOption(index)}
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
