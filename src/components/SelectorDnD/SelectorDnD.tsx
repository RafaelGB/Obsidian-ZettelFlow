import React from "react";
import { SelectorDnDProps } from "./model/DnDSelectorStateModel";
import { t } from "architecture/lang";
import { DndScope, Sortable } from "architecture/components/dnd";

export function SelectorDnD(props: SelectorDnDProps) {
  return (
    <div>
      <h3>{t("step_builder_element_type_selector_title")}</h3>
      <p>{t("step_builder_element_type_selector_description")}</p>
      <DndScope>
        <Sortable axis="vertical">
          <div>Test 1</div>
          <div>Test 2</div>
          <div>Test 3</div>
        </Sortable>
      </DndScope>
    </div>
  );
}
