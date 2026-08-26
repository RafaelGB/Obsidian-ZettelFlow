import React from "react";
import { c } from "architecture";
import { t } from "architecture/lang";
import { PluginComponentProps } from "../typing";

/** Placeholder until #294 S4 fills the Learn panel with curated links to the docs guides. */
export function LearnTab(_props: PluginComponentProps) {
  return (
    <div className={c("community-hub-placeholder")}>{t("community_hub_placeholder")}</div>
  );
}
