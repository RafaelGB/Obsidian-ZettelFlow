import { Axis } from "./CoreDnDModel";

export interface SortableProps {
    axis: Axis;
    onSortChange?: (isSorting: boolean) => void;
}