// OptionsProvider.tsx
import React, { useState } from "react";
import { createContext, FC, ReactNode, useContext } from "react";
import { SelectorElement } from "zettelkasten";
import { Notice } from "obsidian";
import { t } from "architecture/lang";
import { v4 as uuid4 } from "uuid";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

// Define the shape of the context
interface OptionsContextProps {
  id: string;
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

  // Function to swap options using dndkit's arrayMove helper
  const swapOptions = (oldIndex: number, newIndex: number) => {
    const newOptionsState = arrayMove(optionsState, oldIndex, newIndex);
    setOptionsState(newOptionsState);
    action.options = newOptionsState;
  };

  const addOption = () => {
    const newOptionsState = [...optionsState];
    const newKey = `newOption${newOptionsState.length}`;
    const newLabel = `newOption ${newOptionsState.length}`;
    newOptionsState.unshift([newKey, newLabel]);

    setOptionsState(newOptionsState);
    if (!action.options) {
      action.options = [];
    }
    action.options.unshift([newKey, newLabel]);
  };

  const deleteOption = (index: number) => {
    const newOptionsState = [...optionsState];
    newOptionsState.splice(index, 1);
    setOptionsState(newOptionsState);
    action.options.splice(index, 1);
  };

  const updateOption = (index: number, frontmatter: string, label: string) => {
    const isUnique =
      optionsState.find(([key], i) => i !== index && key === frontmatter) ===
      undefined;

    const newOptionsState = [...optionsState];
    newOptionsState[index] = [frontmatter, label];
    setOptionsState(newOptionsState);

    if (isUnique) {
      action.options[index] = [frontmatter, label];
    } else {
      new Notice(t("notification_duplicated_option"));
    }
  };

  const modifyDefaultOption = (key: string) => {
    setDefaultOptionState((prev) => {
      if (prev === key) {
        action.defaultOption = undefined;
        return undefined;
      } else {
        action.defaultOption = key;
        return key;
      }
    });
  };

  // Setup sensors for drag and drop using dndkit
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  // Handler for when drag ends to update the options order
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = optionsState.findIndex(([key]) => key === active.id);
      const newIndex = optionsState.findIndex(([key]) => key === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        swapOptions(oldIndex, newIndex);
      }
    }
  };

  const contextValue: OptionsContextProps = {
    id: uuid4(),
    options: optionsState,
    defaultOption: defaultOptionState,
    add: addOption,
    delete: deleteOption,
    update: updateOption,
    modifyDefault: modifyDefaultOption,
  };

  // Create an array of item IDs for the sortable context
  const itemIds = optionsState.map(([key]) => key);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <OptionsContext.Provider value={contextValue}>
          {children}
        </OptionsContext.Provider>
      </SortableContext>
    </DndContext>
  );
};

export default OptionsProvider;
