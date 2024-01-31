import React, { useEffect, useState } from "react";
import { t } from "architecture/lang";
import { SelectorElement } from "zettelkasten";
import { Icon } from "architecture/components/icon";
import { SelectorDnDProps } from "./model/DnDSelectorStateModel";
import { OptionItem } from "./OptionItem";
import OptionsProvider from "./contexts/OptionsContext";
export function SelectorDnD(props: SelectorDnDProps) {
  const { action, root } = props;
  const { options = [] } = action as SelectorElement;
  const [optionsState, setOptionsState] = useState(options);

  useEffect(() => {
    return () => {
      root.unmount();
    };
  }, []);

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
      <OptionsProvider key={`options-provider`} action={action}>
        {options.map(([key], index) => {
          return <OptionItem key={`${key}-${index}`} index={index} />;
        })}
      </OptionsProvider>
    </div>
  );
}
