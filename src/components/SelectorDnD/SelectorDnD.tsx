import React, { useCallback, useMemo, useState } from "react";
import { SelectorDnDProps } from "./model/DnDSelectorStateModel";
import { t } from "architecture/lang";
import { DndScope, Sortable } from "architecture/components/dnd";
import { SelectorElement } from "zettelkasten";
import { OptionItem } from "./OptionItem";
import { SELECTOR_DND_ID } from "./utils/Identifiers";
import { SelectorDnDManager } from "./managers/SelectorDnDManager";
import { Icon } from "architecture/components/icon";
export function SelectorDnD(props: SelectorDnDProps) {
  const { info } = props;
  const { options = {}, defaultOption } = info.element as SelectorElement;
  const [defaultOptionState, setDefaultOptionState] = useState(defaultOption);
  const [optionsState, setOptionsState] = useState(Object.entries(options));

  const updateOptions = (origin: number, dropped: number) => {
    console.log("updateOptions", origin, dropped);
    const newOptionsState = [...optionsState];
    let originEntry = newOptionsState[origin];
    let auxEntry = newOptionsState[dropped];
    newOptionsState[dropped] = originEntry;
    // Once we swap the first element, sort the array between the origin and the dropped
    // element to keep the order
    if (origin < dropped) {
      dropped--;
      while (origin <= dropped) {
        const aux = newOptionsState[dropped];
        newOptionsState[dropped] = auxEntry;
        auxEntry = aux;
        dropped--;
      }
    } else {
      dropped++;
      while (origin >= dropped) {
        const aux = newOptionsState[dropped];
        newOptionsState[dropped] = auxEntry;
        auxEntry = aux;
        dropped++;
      }
    }
    setOptionsState(newOptionsState);
    info.element.options = Object.fromEntries(newOptionsState);
  };

  const deleteOptionCallback = useCallback(
    (index: number) => {
      const newOptionsState = [...optionsState];
      newOptionsState.splice(index, 1);
      setOptionsState(newOptionsState);
      info.element.options = Object.fromEntries(newOptionsState);
    },
    [optionsState]
  );

  const updateOptionInfoCallback = (
    index: number,
    frontmatter: string,
    label: string
  ) => {
    const newOptionsState = [...optionsState];
    newOptionsState[index] = [frontmatter, label];
    info.element.options = Object.fromEntries(newOptionsState);
  };

  const managerMemo = useMemo(() => {
    return SelectorDnDManager.init(updateOptions);
  }, [optionsState]);

  return (
    <div>
      <h3>{t("step_builder_element_type_selector_title")}</h3>
      <p>{t("step_builder_element_type_selector_description")}</p>
      <div
        className="clickable-icon"
        onClick={() => {
          const newOptionsState = [...optionsState];
          // add at the start
          newOptionsState.unshift([
            `newOption${newOptionsState.length}`,
            `newOption ${newOptionsState.length}`,
          ]);
          setOptionsState(newOptionsState);
          info.element.options = Object.fromEntries(newOptionsState);
        }}
        aria-label="Add option"
      >
        <Icon name="lucide-plus" />
      </div>
      <DndScope id={SELECTOR_DND_ID} manager={managerMemo}>
        <Sortable axis="vertical">
          {optionsState.map(([key, value], index) => {
            return (
              <OptionItem
                key={`option-${index}-${key}`}
                frontmatter={key}
                isDefault={defaultOptionState === key}
                label={value}
                index={index}
                deleteOptionCallback={deleteOptionCallback}
                updateOptionInfoCallback={updateOptionInfoCallback}
                changeDefaultCallback={(defaultOption) => {
                  setDefaultOptionState(defaultOption);
                  info.element.defaultOption = defaultOption;
                }}
              />
            );
          })}
        </Sortable>
      </DndScope>
    </div>
  );
}
