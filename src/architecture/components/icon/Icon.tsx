import { c } from "architecture/styles/helper";
import { setIcon } from "obsidian";
import React from "react";
import { IconProps } from "./model/IconModel";

export function Icon({ name, className }: IconProps) {
  return (
    <span
      data-icon={name}
      className={`${c("icon")} ${className || ""}`}
      ref={(c) => {
        if (c) {
          setIcon(c, name);
        }
      }}
    />
  );
}
