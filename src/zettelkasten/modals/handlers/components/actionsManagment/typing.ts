import { Action } from "architecture/api";
import { StepBuilderModal } from "zettelkasten/modals/StepBuilderModal";

export type ActionsManagementProps = {
    modal: StepBuilderModal
};

export type ActionAccordionProps = {
    modal: StepBuilderModal,
    action: Action,
    index: number,
    onRemove: () => void,
};