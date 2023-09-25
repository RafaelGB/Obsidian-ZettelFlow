import React, { useCallback, useMemo } from "react";
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
  const [optionsState, setOptionsState] = React.useState(
    Object.entries(options)
  );

  const updateOptionsCallback = useCallback(
    (indexSwap1: number, indexSwap2: number) => {
      const newOptionsState = [...optionsState];
      const [key1, value1] = newOptionsState[indexSwap1];
      const [key2, value2] = newOptionsState[indexSwap2];
      newOptionsState[indexSwap1] = [key2, value2];
      newOptionsState[indexSwap2] = [key1, value1];
      setOptionsState(newOptionsState);
      info.element.options = Object.fromEntries(newOptionsState);
    },
    [optionsState]
  );

  const managerMemo = useMemo(() => {
    return SelectorDnDManager.init(updateOptionsCallback);
  }, [optionsState]);

  return (
    <div>
      <h3>{t("step_builder_element_type_selector_title")}</h3>
      <p>{t("step_builder_element_type_selector_description")}</p>
      <DndScope id={SELECTOR_DND_ID} manager={managerMemo}>
        <Sortable axis="vertical">
          {optionsState.map(([key, value], index) => {
            return (
              <OptionItem
                key={`option-${index}-${key}`}
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
