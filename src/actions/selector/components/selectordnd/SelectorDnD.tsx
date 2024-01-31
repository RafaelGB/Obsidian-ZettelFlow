import React, { useEffect } from "react";
import { t } from "architecture/lang";
import { Icon } from "architecture/components/icon";
import { SelectorDnDProps } from "./model/DnDSelectorStateModel";
import { OptionItem } from "./OptionItem";
import OptionsProvider, { useOptionsContext } from "./contexts/OptionsContext";
export function SelectorDnD(props: SelectorDnDProps) {
  const { action, root } = props;
  useEffect(() => {
    return () => {
      root.unmount();
    };
  }, []);

  return (
    <div>
      <h3>{t("step_builder_element_type_selector_title")}</h3>
      <p>{t("step_builder_element_type_selector_description")}</p>
      <OptionsProvider key={`options-provider`} action={action}>
        <OptionList />
      </OptionsProvider>
    </div>
  );
}

const OptionList = () => {
  const { options, add } = useOptionsContext();
  return (
    <div>
      <div className="clickable-icon" onClick={add} aria-label="Add option">
        <Icon name="lucide-plus" />
      </div>
      {options.map(([key], index) => {
        return <OptionItem key={`${key}-${index}`} index={index} />;
      })}
    </div>
  );
};
