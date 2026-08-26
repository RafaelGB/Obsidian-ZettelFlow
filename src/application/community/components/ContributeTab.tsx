import React from "react";
import { c } from "architecture";
import { t } from "architecture/lang";
import { PluginComponentProps } from "../typing";

/** Placeholder until #294 S3 fills the Contribute panel with the GitHub participation flows. */
export function ContributeTab(_props: PluginComponentProps) {
  return (
    <div className={c("community-hub-placeholder")}>{t("community_hub_placeholder")}</div>
  );
}
