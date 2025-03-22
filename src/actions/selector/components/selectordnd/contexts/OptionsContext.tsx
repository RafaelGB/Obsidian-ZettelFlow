import React, {
  useState,
  createContext,
  FC,
  ReactNode,
  useContext,
} from "react";
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
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

/**
 * Interface representing the context value for Options.
 */
export interface OptionsContextProps {
  /** Unique identifier for the drag & drop context. */
  id: string;
  /** List of options, each as a tuple of [frontmatter, label]. */
  options: [string, string][];
  /** The key of the default option, if set. */
  defaultOption: string | undefined;
  /** Function to add a new option. */
  add: () => void;
  /** Function to delete an option by index. */
  delete: (index: number) => void;
  /**
   * Function to update an option.
   * @param index - The index of the option to update.
   * @param frontmatter - The new frontmatter value.
   * @param label - The new label value.
   */
  update: (index: number, frontmatter: string, label: string) => void;
  /**
   * Function to set or unset an option as the default.
   * @param key - The key of the option to modify.
   */
  modifyDefault: (key: string) => void;
}

/**
 * OptionsContext provides state and actions for managing options.
 */
const OptionsContext = createContext<OptionsContextProps | undefined>(
  undefined
);

/**
 * Custom hook to use the OptionsContext.
 * Must be used within an OptionsProvider.
 *
 * @returns {OptionsContextProps} The current context value.
 * @throws Error if used outside an OptionsProvider.
 */
export const useOptionsContext = (): OptionsContextProps => {
  const context = useContext(OptionsContext);
  if (!context) {
    throw new Error("useOptionsContext must be used within an OptionsProvider");
  }
  return context;
};

/**
 * Interface for OptionsProvider component props.
 */
interface OptionsProviderProps {
  /** The selector element containing initial options and default option. */
  action: SelectorElement;
  /** Child components that require access to the options context. */
  children: ReactNode;
}

/**
 * OptionsProvider component that manages options state and integrates
 * the dnd-kit drag & drop context for reordering options.
 *
 * @param {OptionsProviderProps} props - The component props.
 * @returns {JSX.Element} The rendered provider with drag & drop context.
 */
const OptionsProvider: FC<OptionsProviderProps> = ({ action, children }) => {
  // Extract initial options and default option from the action
  const { options, defaultOption } = action;
  const [defaultOptionState, setDefaultOptionState] = useState(defaultOption);
  const [optionsState, setOptionsState] = useState(options || []);

  /**
   * Swaps the positions of two options using dnd-kit’s arrayMove helper.
   *
   * @param {number} oldIndex - The current index of the option.
   * @param {number} newIndex - The new index for the option.
   */
  const swapOptions = (oldIndex: number, newIndex: number): void => {
    const newOptionsState = arrayMove(optionsState, oldIndex, newIndex);
    setOptionsState(newOptionsState);
    action.options = newOptionsState;
  };

  /**
   * Adds a new option at the beginning of the options list.
   */
  const addOption = (): void => {
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

  /**
   * Deletes an option at a specified index.
   *
   * @param {number} index - The index of the option to delete.
   */
  const deleteOption = (index: number): void => {
    const newOptionsState = [...optionsState];
    newOptionsState.splice(index, 1);
    setOptionsState(newOptionsState);
    action.options.splice(index, 1);
  };

  /**
   * Updates an option's frontmatter and label values.
   *
   * Checks for uniqueness of the frontmatter value and shows a notice
   * if a duplicate is detected.
   *
   * @param {number} index - The index of the option to update.
   * @param {string} frontmatter - The new frontmatter value.
   * @param {string} label - The new label value.
   */
  const updateOption = (
    index: number,
    frontmatter: string,
    label: string
  ): void => {
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

  /**
   * Sets or unsets the default option.
   *
   * If the given key is already the default, it unsets it; otherwise,
   * it sets it as the new default.
   *
   * @param {string} key - The key of the option to modify.
   */
  const modifyDefaultOption = (key: string): void => {
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

  // Setup sensors for drag and drop using dnd-kit with a minimum activation distance
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  /**
   * Handles the drag end event.
   *
   * When the drag is finished, this function finds the old and new indices
   * of the dragged item and swaps their positions.
   *
   * @param {DragEndEvent} event - The drag end event from dnd-kit.
   */
  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = optionsState.findIndex(([key]) => key === active.id);
      const newIndex = optionsState.findIndex(([key]) => key === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        swapOptions(oldIndex, newIndex);
      }
    }
  };

  // Create the context value with a unique id and actions
  const contextValue: OptionsContextProps = {
    id: uuid4(),
    options: optionsState,
    defaultOption: defaultOptionState,
    add: addOption,
    delete: deleteOption,
    update: updateOption,
    modifyDefault: modifyDefaultOption,
  };

  // Generate an array of option IDs for the SortableContext (required by dnd-kit)
  const itemIds = optionsState.map(([key]) => key);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToVerticalAxis]}
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
