import { PropsWithChildren } from "react";
import { SortableProps } from "./model/SortableModel";

export function Sortable(props: PropsWithChildren<SortableProps>) {
  const { children } = props;

  return children;
}
