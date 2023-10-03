import { PropsWithChildren } from "react";
import { SortableProps } from "./model/SortableModel";
import React from "react";
import { c } from "architecture/styles/helper";

export function Sortable(props: PropsWithChildren<SortableProps>) {
  const { children } = props;

  return <div className={c("sortable")}>{children}</div>;
}
