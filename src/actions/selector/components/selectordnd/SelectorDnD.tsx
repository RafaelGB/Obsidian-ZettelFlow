import React, { JSX, useEffect } from "react";
import { t } from "architecture/lang";
import { Icon } from "architecture/components/icon";
import { SelectorDnDProps } from "./model/DnDSelectorStateModel";
import { OptionItem } from "./OptionItem";
import OptionsProvider, { useOptionsContext } from "./contexts/OptionsContext";
import { SelectorElement } from "zettelkasten";

/**
 * SelectorDnD Component
 *
 * This component serves as the main entry point for the selector with drag-and-drop functionality.
 * It initializes the OptionsProvider and renders the OptionList.
 *
 * @param {SelectorDnDProps} props - The properties passed to the component.
 * @returns {JSX.Element} The rendered SelectorDnD component.
 */
export function SelectorDnD(props: SelectorDnDProps): JSX.Element {
  const { action, root } = props;

  // Cleanup effect to unmount the root when the component is unmounted
  useEffect(() => {
    return () => {
      root.unmount();
    };
  }, [root]);

  return (
    <div>
      <h3>{t("step_builder_element_type_selector_title")}</h3>
      <p>{t("step_builder_element_type_selector_description")}</p>
      <OptionsProvider action={action as SelectorElement}>
        <OptionList />
      </OptionsProvider>
    </div>
  );
}

/**
 * OptionList Component
 *
 * This component renders the list of options and provides a button to add new options.
 *
 * @returns {JSX.Element} The rendered OptionList component.
 */
const OptionList = (): JSX.Element => {
  const { options, add } = useOptionsContext();

  return (
    <div>
      <div className="clickable-icon" onClick={add} aria-label="Add option">
        <Icon name="lucide-plus" />
      </div>
      {options.map(([key], index) => (
        <OptionItem key={`${key}-${index}`} id={key} index={index} />
      ))}
    </div>
  );
};
