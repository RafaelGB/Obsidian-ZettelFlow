import { Action } from "architecture/api";
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
    onChange: (value: string | null, isTemplate: boolean) => void
};

export type ActionCardInfo = {
    id: string,
    icon: string,
    label: string,
    link?: string,
    purpose: string,
    isTemplate?: boolean
};