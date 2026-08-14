import { Action } from "architecture/api";
import type { ActionCategory } from "architecture/api/categories/categories";
import { AbstractStepModal } from "zettelkasten/modals/AbstractStepModal";

export type ActionsManagementProps = {
    modal: AbstractStepModal
};

export type ActionAccordionProps = {
    modal: AbstractStepModal,
    action: Action,
    index: number,
    onRemove: () => void,
};

export type ActionAddMenuProps = {
    modal: AbstractStepModal,
    onChange: (value: string | null, isTemplate: boolean) => void,
    existingActionIds?: string[],
};

export type ActionCardInfo = {
    id: string,
    icon: string,
    label: string,
    link?: string,
    purpose: string,
    isTemplate?: boolean,
    /** Cognitive-capability category for picker grouping (#152); absent ⇒ uncategorized. */
    category?: ActionCategory
};