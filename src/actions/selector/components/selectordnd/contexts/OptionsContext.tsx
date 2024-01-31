import { Action } from "architecture/api";
import { DndScope, Sortable } from "architecture/components/dnd";
import React, { useMemo } from "react";
import { createContext, FC, ReactNode, useContext, useState } from "react";
import { SelectorElement } from "zettelkasten";
import { SelectorDnDManager } from "../managers/SelectorDnDManager";
import { SELECTOR_DND_ID } from "../utils/Identifiers";

interface OptionsContextProps {
  options: [string, string][];
  defaultOption: string | undefined;
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
  action: Action;
  children: ReactNode;
}

const OptionsProvider: FC<OptionsProviderProps> = ({ action, children }) => {
  const { options = [], defaultOption } = action as SelectorElement;
  const [defaultOptionState, setDefaultOptionState] = useState(defaultOption);
  const [optionsState, setOptionsState] = useState(options);

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

  const deleteOption = (index: number) => {
    const newOptionsState = [...optionsState];
    newOptionsState.splice(index, 1);
    setOptionsState(newOptionsState);
    action.options = newOptionsState;
  };

  const updateOption = (index: number, frontmatter: string, label: string) => {
    optionsState[index] = [frontmatter, label];
    setOptionsState(optionsState);
    action.options = optionsState;
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
