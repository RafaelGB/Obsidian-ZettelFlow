import { PropsWithChildren } from "react";
import { SortableProps } from "./model/SortableModel";

export function Sortable(props: PropsWithChildren<SortableProps>) {
  const { axis, onSortChange, children } = props;

  return children;
}
