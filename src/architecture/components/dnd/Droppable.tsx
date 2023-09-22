import { PropsWithChildren, useEffect, useRef } from "react";
import { DraggableProps } from "./model/DroppableModel";
import React from "react";
import { c } from "architecture";

export function Droppable(props: PropsWithChildren<DraggableProps>) {
  const { children, index } = props;
  const elementRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = elementRef.current;
    if (!element) {
      return;
    }
    element.classList.add(c("droppable-item-dataset"));
    element.dataset.index = index.toString();
  }, [index]);
  return <div ref={elementRef}>{children}</div>;
}
