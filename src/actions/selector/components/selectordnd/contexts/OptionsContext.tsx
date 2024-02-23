import { DndScope, Sortable } from "architecture/components/dnd";
import React, { useMemo } from "react";
import { createContext, FC, ReactNode, useContext, useState } from "react";
import { SelectorElement } from "zettelkasten";
import { SelectorDnDManager } from "../managers/SelectorDnDManager";
import { SELECTOR_DND_ID } from "../utils/Identifiers";
import { Notice } from "obsidian";
import { t } from "architecture/lang";

interface OptionsContextProps {
  options: [string, string][];
  defaultOption: string | undefined;
  add: () => void;
  delete: (index: number) => void;
  update: (index: number, frontmatter: string, label: string) => void;
  modifyDefault: (key: string) => void;
}

const OptionsContext = createContext<OptionsContextProps | undefined>(
  undefined
);

export const useOptionsContext = () => {
  const context = useContext(OptionsContext);
  if (!context) {
    throw new Error("useOptionsContext must be used within an OptionsProvider");
  }
  return context;
};

interface OptionsProviderProps {
  action: SelectorElement;
  children: ReactNode;
}

const OptionsProvider: FC<OptionsProviderProps> = ({ action, children }) => {
  const { options, defaultOption } = action;
  const [defaultOptionState, setDefaultOptionState] = useState(defaultOption);
  const [optionsState, setOptionsState] = useState(options || []);

  const swapOptions = (origin: number, dropped: number) => {
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
    action.options = newOptionsState;
  };

  const addOption = () => {
    const newOptionsState = [...optionsState];
    // add at the start
    const newKey = `newOption${newOptionsState.length}`;
    const newLabel = `newOption ${newOptionsState.length}`;
    newOptionsState.unshift([newKey, newLabel]);

    setOptionsState(newOptionsState);
    // On disk
    if (!action.options) {
      action.options = [];
    }
    action.options.unshift([newKey, newLabel]);
  };

  const deleteOption = (index: number) => {
    // On state
    const newOptionsState = [...optionsState];
    newOptionsState.splice(index, 1);
    setOptionsState(newOptionsState);
    // On disk
    action.options.splice(index, 1);
  };

  const updateOption = (index: number, frontmatter: string, label: string) => {
    // Check first if the frontmatter is unique
    const isUnique =
      optionsState.find(([key], i) => {
        if (i !== index && key === frontmatter) {
          return true;
        }
        return false;
      }) === undefined;

    optionsState[index] = [frontmatter, label];
    setOptionsState(optionsState);
    if (isUnique) {
      // On disk
      action.options[index] = [frontmatter, label];
    } else {
      new Notice(t("notification_duplicated_option"));
    }
  };

  const modifyDefaultOption = (key: string) => {
    setDefaultOptionState((prevDefaultOption) => {
      if (prevDefaultOption === key) {
        action.defaultOption = undefined;
        return undefined;
      } else {
        action.defaultOption = key;
        return key;
      }
    });
  };

  const contextValue: OptionsContextProps = {
    options: optionsState,
    defaultOption: defaultOptionState,
    add: addOption,
    delete: deleteOption,
    update: updateOption,
    modifyDefault: modifyDefaultOption,
  };

  const managerMemo = useMemo(() => {
    return SelectorDnDManager.init(swapOptions);
  }, [optionsState]);

  return (
    <DndScope id={SELECTOR_DND_ID} manager={managerMemo}>
      <Sortable axis="vertical">
        <OptionsContext.Provider value={contextValue}>
          {children}
        </OptionsContext.Provider>
      </Sortable>
    </DndScope>
  );
};

export default OptionsProvider;
