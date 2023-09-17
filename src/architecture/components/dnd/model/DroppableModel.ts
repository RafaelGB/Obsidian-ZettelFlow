import { RefObject } from "react";

export interface DraggableProps {
    index: number;
    measureRef: RefObject<HTMLDivElement>;
}