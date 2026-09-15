import React from "react";
import { c } from "architecture";
import { Icon } from "architecture/components/icon";

export type WizardStateKind = "empty" | "loading" | "error";

const ICON_OF: Record<WizardStateKind, string> = {
    empty: "circle-dashed",
    loading: "loader",
    error: "alert-triangle",
};

/**
 * The one empty / loading / error treatment for the whole wizard (#409, epic #405).
 *
 * `RootSelector` had three tidy states and nothing else in the wizard had any, so a slow step or a
 * failed read showed nothing at all. This is that treatment, extracted — not a fourth dialect.
 */
export function WizardState({
  kind,
  message,
}: {
  kind: WizardStateKind;
  message: string;
}) {
  return (
    <div
      className={`${c("wizard-state")} ${c(`wizard-state-${kind}`)}`}
      role={kind === "error" ? "alert" : "status"}
    >
      <Icon name={ICON_OF[kind]} />
      <p className={c("wizard-state-message")}>{message}</p>
    </div>
  );
}
