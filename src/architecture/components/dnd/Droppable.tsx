import { PropsWithChildren, useRef } from "react";
import { DraggableProps } from "./model/DroppableModel";
import React from "react";

export function Droppable(props: PropsWithChildren<DraggableProps>) {
  const { children } = props;
  const elementRef = useRef<HTMLDivElement>(null);
  return <div ref={elementRef}>{children}</div>;
}
