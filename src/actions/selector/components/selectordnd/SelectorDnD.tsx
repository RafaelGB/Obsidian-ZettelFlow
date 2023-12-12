import React, { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "architecture/lang";
import { DndScope, Sortable } from "architecture/components/dnd";
import { SelectorElement } from "zettelkasten";
import { Icon } from "architecture/components/icon";
import { SelectorDnDProps } from "./model/DnDSelectorStateModel";
import { SelectorDnDManager } from "./managers/SelectorDnDManager";
import { SELECTOR_DND_ID } from "./utils/Identifiers";
import { OptionItem } from "./OptionItem";
export function SelectorDnD(props: SelectorDnDProps) {
  const { action, root } = props;
  const { options = [], defaultOption } = action as SelectorElement;
  // LEGACY: This is to keep the id of the action
  if (!Array.isArray(options)) {
    props.action.options = Object.entries(
      props.action.options as Record<string, string>
    );
  }
  // END LEGACY

  const [defaultOptionState, setDefaultOptionState] = useState(defaultOption);
  const [optionsState, setOptionsState] = useState(options);

  useEffect(() => {
    return () => {
      root.unmount();
    };
  }, []);

  const updateOptions = (origin: number, dropped: number) => {
    const newOptionsState = [...optionsState];
    const originEntry = newOptionsState[origin];
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
    props.action.options = newOptionsState;
  };

  const deleteOptionCallback = useCallback(
    (index: number) => {
      const newOptionsState = [...optionsState];
      newOptionsState.splice(index, 1);
      setOptionsState(newOptionsState);
      props.action.options = newOptionsState;
    },
    [optionsState]
  );

  const updateOptionInfoCallback = (
    index: number,
    frontmatter: string,
    label: string
  ) => {
    optionsState[index] = [frontmatter, label];
    setOptionsState(optionsState);
    props.action.options = optionsState;
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
          action.options = newOptionsState;
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
                key={`${key}-${index}`}
                frontmatter={key}
                isDefault={defaultOptionState === key}
                label={value}
                index={index}
                deleteOptionCallback={deleteOptionCallback}
                updateOptionInfoCallback={updateOptionInfoCallback}
                changeDefaultCallback={(defaultOption) => {
                  setDefaultOptionState(defaultOption);
                  props.action.defaultOption = defaultOption;
                }}
              />
            );
          })}
        </Sortable>
      </DndScope>
    </div>
  );
}
