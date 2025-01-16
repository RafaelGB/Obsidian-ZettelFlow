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
    onChange: (value: string | null) => void
};

export type ActionCardInfo = {
    id: string,
    icon: string,
    label: string,
    link: string,
    purpose: string
};