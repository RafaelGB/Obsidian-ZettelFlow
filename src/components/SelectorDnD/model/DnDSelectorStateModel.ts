import { Entity } from "architecture/components/dnd";
import { StepBuilderInfo } from "zettelkasten";

export type DnDSelectorStateActions = {
    onDrop(dragEntity: Entity, dropEntity: Entity): void;
}

export type DnDSelectorState = {
    win: Window;
    actions: DnDSelectorStateActions;
}

export type SelectorDnDProps = {
    info: StepBuilderInfo;
}