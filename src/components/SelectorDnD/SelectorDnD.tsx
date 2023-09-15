import React from "react";
import { SelectorDnDProps } from "./model/DnDSelectorStateModel";
import { t } from "architecture/lang";
import { DndScope, Sortable } from "architecture/components/dnd";
import { SelectorElement } from "zettelkasten";
import { OptionItem } from "./OptionItem";
import { SELECTOR_DND_ID } from "./utils/Identifiers";
import { SelectorDnDManager } from "./managers/SelectorDnDManager";
export function SelectorDnD(props: SelectorDnDProps) {
  const { info } = props;
  const { options = {} } = info.element as SelectorElement;
  return (
    <div>
      <h3>{t("step_builder_element_type_selector_title")}</h3>
      <p>{t("step_builder_element_type_selector_description")}</p>
      <DndScope id={SELECTOR_DND_ID} manager={SelectorDnDManager.init()}>
        <Sortable axis="vertical">
          {Object.entries(options).map(([key, value], index) => {
            return (
              <OptionItem
                key={`option-${index}`}
                frontmatter={key}
                label={value}
                index={index}
              />
            );
          })}
        </Sortable>
      </DndScope>
    </div>
  );
}
